// most of this is made with AI, i don't really know how to code

/* =========================
   CONFIG
========================= */
const SHEET_1_SRC = "textures/Enhancers.png"; // 7x5 (background)
const SHEET_2_SRC = "textures/8BitDeck_opt2.png"; // 13x4 (cards)

const SHEET_1_COLS = 7;
const SHEET_1_ROWS = 5;
const SHEET_2_COLS = 13;
const SHEET_2_ROWS = 4;

const BASE_COL = 2; // 1-based
const BASE_ROW = 1;

const COUNT = 5;
const SCORE_TO_BEAT = 300;
const ROW_PRIORITY = [3, 0, 1, 2]; // 4,1,2,3 (zero-based)

let GUESS_COOLDOWN = 1000; // ms
window.GUESS_COOLDOWN = GUESS_COOLDOWN;

/* =========================
   STREAK STATE
========================= */
let currentStreak = 0;
let highestStreak = 0;
let highestStreakTimer = 0;
let highestStreakHadNoTimer = false;
let currentStreakHadNoTimer = false;
let currentStreakMaxTimer = 0;

let highestQuality = 6;
let highestQualityStreak = 0;
let highestQualityTimer = 0;
let highestQualityHadNoTimer = false;


let currentStreakQuality = 0;
const activeStreakSounds = new Map();
let activeStreakSoundIndex = -1;
let lastQualityTimerMode = null; 
// null = not started yet
// "none" = timer == 0
// "timed" = timer > 0

const streakDisplay = document.getElementById("streak-display");

/* =========================
   AUDIO
========================= */
// volume multipliers
let STREAK_VOLUME_MULT = 0.5;   // affects streak quality ambient sounds
let SFX_VOLUME_MULT = 0.5;      // affects all other sounds

const CORRECT_SOUND_POOLS = [
  { weight: 2, files: ["sounds/correct/chips/chips1.ogg", "sounds/correct/chips/chips2.ogg"] },
  { weight: 2, files: ["sounds/correct/cash/coin1.ogg","sounds/correct/cash/coin2.ogg","sounds/correct/cash/coin3.ogg","sounds/correct/cash/coin4.ogg","sounds/correct/cash/coin5.ogg","sounds/correct/cash/coin6.ogg","sounds/correct/cash/coin7.ogg"] },
  { weight: 1, files: ["sounds/correct/mult/multhit2.ogg"] }
];

const WRONG_SOUNDS = [
  "sounds/wrong/glass1.ogg","sounds/wrong/glass2.ogg","sounds/wrong/glass3.ogg","sounds/wrong/glass4.ogg","sounds/wrong/glass5.ogg","sounds/wrong/glass6.ogg"
];
const STREAK_SOUNDS = [
  {
    threshold: 0,
    file: "sounds/streak/ambientFire1.ogg",
    volume: 0.15,
    fadeIn: 1200
  },
  {
    threshold: 2,
    file: "sounds/streak/ambientFire2.ogg",
    volume: 0.2,
    fadeIn: 1600
  },
  {
    threshold: 4,
    file: "sounds/streak/ambientFire3.ogg",
    volume: 0.25,
    fadeIn: 1600
  },
  {
    threshold: 6,
    file: "sounds/streak/ambientOrgan1.ogg",
    volume: 0.1,
    fadeIn: 4000
  }
];

function fadeInAudio(audio, targetVolume, duration){
  if (!audio.paused) return; // already playing, don't restart

  audio.volume = 0;
  audio.loop = true;
  audio.play();

  const start = performance.now();
  const tick = () => {
    const t = (performance.now() - start) / duration;
    if (t >= 1) {
      audio.volume = targetVolume;
    } else {
      audio.volume = targetVolume * t;
      requestAnimationFrame(tick);
    }
  };
  tick();
}



function stopAllStreakSounds(){
  for (const audio of activeStreakSounds.values()) {
    audio.pause();
  }
  activeStreakSounds.clear();
}


function updateStreakAmbientSounds(){
  const delta = currentStreakQuality - highestQuality;

  STREAK_SOUNDS.forEach((cfg, index) => {
    const shouldBePlaying = delta >= cfg.threshold;
    const isPlaying = activeStreakSounds.has(index);

    if (shouldBePlaying && !isPlaying) {
      const audio = new Audio(cfg.file);
      activeStreakSounds.set(index, audio);
      fadeInAudio(audio, cfg.volume * STREAK_VOLUME_MULT, cfg.fadeIn);
    }

    if (!shouldBePlaying && isPlaying) {
      const audio = activeStreakSounds.get(index);
      audio.pause();
      activeStreakSounds.delete(index);
    }
  });
}



/* =========================
   PATTERNS & SCORES
========================= */
const PATTERNS = [
  { id: "straight_flush", name: "straight_flush", label: "Straight Flush", weight: 1, gen: straightFlush },
  { id: "four_kind", name: "four_kind", label: "Four of a Kind", weight: 1, gen: fourOfAKind },
  { id: "full_house", name: "full_house", label: "Full House", weight: 20, gen: fullHouse },
  { id: "flush",      name: "flush",      label: "Flush",      weight: 40, gen: flush },
  { id: "straight",   name: "straight",   label: "Straight",   weight: 20, gen: straight }
];

const HAND_SCORES = {
  straight_flush: { chips: 100, mult: 8 },
  four_kind:      { chips: 60,  mult: 7 },
  full_house:     { chips: 40,  mult: 4 },
  flush:          { chips: 35,  mult: 4 },
  straight:       { chips: 30,  mult: 4 }
};

/* =========================
   STATE
========================= */
let sheet1, sheet2;
let currentPattern = null;
let currentCards = [];
let currentScore = 0;

/* =========================
   IMAGE LOADING
========================= */
function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = src;
  });
}

Promise.all([loadImage(SHEET_1_SRC), loadImage(SHEET_2_SRC)])
  .then(([img1, img2]) => {
    sheet1 = img1;
    sheet2 = img2;
    buildControls();
    reroll();
  });

/* =========================
   RANDOM HELPERS
========================= */
function setGuessButtonsEnabled(enabled) {
  document.getElementById("yes").disabled = !enabled;
  document.getElementById("no").disabled = !enabled;
}

function weightedPick(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) if ((r -= item.weight) <= 0) return item;
  return items[items.length - 1];
}

function playRandomCorrectSound() {
  const pool = weightedPick(CORRECT_SOUND_POOLS);
  const file = pool.files[Math.floor(Math.random() * pool.files.length)];
  const audio = new Audio(file);
  audio.volume = SFX_VOLUME_MULT;
  audio.play();
}


function playRandomWrongSound() {
  const file = WRONG_SOUNDS[Math.floor(Math.random() * WRONG_SOUNDS.length)];
  const audio = new Audio(file);
  audio.volume = SFX_VOLUME_MULT;
  audio.play();
}

function playButtonSound() {
  const audio = new Audio("sounds/button.ogg");
  audio.volume = 0.2 * SFX_VOLUME_MULT;
  audio.play();
}



function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function isConsecutive(arr) { for (let i = 1; i < arr.length; i++) if (arr[i] !== arr[i-1] + 1) return false; return true; }

/* =========================
   PATTERN PICKING
========================= */
function pickPattern() {
  const pool = [];
  for (const p of PATTERNS) for (let i = 0; i < p.weight; i++) pool.push(p);
  return pool.length ? rand(pool) : PATTERNS[0];
}

/* =========================
   PATTERN GENERATORS
========================= */
function straightFlush() {
  const row = randInt(0, SHEET_2_ROWS - 1);
  const startCol = randInt(0, SHEET_2_COLS - 5);
  return Array.from({ length: 5 }, (_, i) => ({ col: startCol + i, row }));
}

function fourOfAKind() {
  const col = randInt(0, SHEET_2_COLS - 1);
  const rows = shuffle([...Array(SHEET_2_ROWS).keys()]);
  const cards = rows.slice(0, 4).map(r => ({ col, row: r }));
  let kicker; do { kicker = randomCell(SHEET_2_COLS, SHEET_2_ROWS); } while (kicker.col === col);
  cards.push(kicker);
  return cards;
}

function fullHouse() {
  const winning = Math.random() < 0.5;
  const chipMap = [2,3,4,5,6,7,8,9,10,10,10,10,11];
  let validTriples = [];
  for (let c = 0; c < 13; c++) {
    let minPair = 0, maxPair = 12;
    if (winning) { minPair = Math.ceil((35 - 3*chipMap[c])/2); minPair = Math.max(minPair,0); if (minPair>12) continue; }
    else { maxPair = Math.floor((34 - 3*chipMap[c])/2); if (maxPair<0) continue; }
    validTriples.push({ col: c, minPair, maxPair });
  }
  const tripleCol = rand(validTriples).col;
  let validPairs = [];
  for (let c = 0; c < 13; c++) if (c!==tripleCol && chipMap[c]>=validTriples.find(t=>t.col===tripleCol).minPair && chipMap[c]<=validTriples.find(t=>t.col===tripleCol).maxPair) validPairs.push(c);
  if (!validPairs.length) for (let c = 0; c<13; c++) if (c!==tripleCol) validPairs.push(c);
  const pairCol = rand(validPairs);
  const rowsA = shuffle([...Array(SHEET_2_ROWS).keys()]).slice(0,3);
  const rowsB = shuffle([...Array(SHEET_2_ROWS).keys()]).slice(0,2);
  return [...rowsA.map(row=>({col:tripleCol,row})), ...rowsB.map(row=>({col:pairCol,row}))];
}

function flush() {
  const winning = Math.random() < 0.5;
  const chipMap = [2,3,4,5,6,7,8,9,10,10,10,10,11];
  let validCols;

  // pick 5-card set that meets sum threshold and is NOT consecutive (avoids straight flush)
  while (true) {
    const cols = shuffle([...Array(SHEET_2_COLS).keys()]).slice(0, 5);
    const sum = cols.reduce((s, c) => s + chipMap[c], 0);
    cols.sort((a, b) => a - b);
    const isConsec = isConsecutive(cols); // check if columns are consecutive
    if (((winning && sum >= 40) || (!winning && sum < 40)) && !isConsec) {
      validCols = cols;
      break;
    }
  }

  const row = randInt(0, SHEET_2_ROWS - 1);
  return validCols.map(col => ({ col, row }));
}

function straight() {
  const startCol = randInt(0, SHEET_2_COLS - 5);
  let rows;
  // ensure straight is NOT all in same row (avoids straight flush)
  do {
    rows = Array.from({ length: 5 }, () => randInt(0, SHEET_2_ROWS - 1));
  } while (rows.every(r => r === rows[0])); // repeat if all rows same

  return rows.map((row, i) => ({ col: startCol + i, row }));
}

function randomCell(cols, rows) { return {col: randInt(0,cols-1), row: randInt(0,rows-1)}; }

/* =========================
   SCORING
========================= */
function cardChips(col){
  const rank = col+2;
  if(rank===14) return 11;
  if(rank>=11 && rank<=13) return 10;
  return rank;
}

function calculateScore(pattern,cards){
  const base = HAND_SCORES[pattern.name];
  let chips = base.chips;
  if(pattern.name==="four_kind"){
    const counts = {};
    for(const c of cards) counts[c.col] = (counts[c.col]||0)+1;
    const quadCol = Number(Object.keys(counts).find(c=>counts[c]===4));
    for(const c of cards) if(c.col===quadCol) chips+=cardChips(c.col);
  } else { for(const c of cards) chips+=cardChips(c.col); }
  return chips*base.mult;
}

/* =========================
   RENDERING
========================= */
function makeLayer(sheet,col,row,tileW,tileH){
  const div = document.createElement("div");
  div.className = "layer";
  div.style.width = `${tileW}px`;
  div.style.height = `${tileH}px`;
  div.style.backgroundImage = `url(${sheet.src})`;
  div.style.backgroundSize = `${sheet.width}px ${sheet.height}px`;
  div.style.backgroundPosition = `-${col*tileW}px -${row*tileH}px`;
  return div;
}

function reroll() {
  const container = document.getElementById("container");
  container.innerHTML = "";
  const tile1W = sheet1.width / SHEET_1_COLS;
  const tile1H = sheet1.height / SHEET_1_ROWS;
  const tile2W = sheet2.width / SHEET_2_COLS;
  const tile2H = sheet2.height / SHEET_2_ROWS;

  currentPattern = pickPattern();
  let tops = currentPattern.gen();
  tops.sort((a,b)=>a.col!==b.col?b.col-a.col:ROW_PRIORITY.indexOf(a.row)-ROW_PRIORITY.indexOf(b.row));
  currentCards = tops;
  currentScore = calculateScore(currentPattern, tops);

  for(const top of tops){
    const combo = document.createElement("div");
    combo.className = "combo";
    combo.style.width = `${tile1W}px`;
    combo.style.height = `${tile1H}px`;
    combo.appendChild(makeLayer(sheet1, BASE_COL-1, BASE_ROW-1, tile1W, tile1H));
    combo.appendChild(makeLayer(sheet2, top.col, top.row, tile2W, tile2H));
    container.appendChild(combo);
  }

  startTimer(()=>resolveGuess(false, true));
}

/* =========================
   UI CONTROLS
========================= */
function buildControls() {
  const controls = document.getElementById("controls");
  controls.innerHTML = "";

  // Hand Weights
  const hwHeader = document.createElement("h3");
  hwHeader.textContent = "Hand Weights";
  controls.appendChild(hwHeader);

  for (const p of PATTERNS) {
    const wrap = document.createElement("div");
    wrap.className = "control";

    const label = document.createElement("label");

    const labelText = document.createElement("span");
    labelText.textContent = p.label;

    const labelValue = document.createElement("span");
    labelValue.id = `${p.id}-val`;
    labelValue.textContent = p.weight;

    label.appendChild(labelText);
    label.appendChild(labelValue);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = 0;
    slider.max = 100;
    slider.value = p.weight;

    // play sound ONCE when interaction starts
    slider.addEventListener("pointerdown", playButtonSound);

    slider.addEventListener("input", () => {
      p.weight = Number(slider.value);
      labelValue.textContent = slider.value;
    });

    wrap.appendChild(label);
    wrap.appendChild(slider);
    controls.appendChild(wrap);
  }

  // Timer
  const timerHeader = document.createElement("h3");
  timerHeader.textContent = "Timer";
  controls.appendChild(timerHeader);

  const timerWrap = document.createElement("div");
  timerWrap.className = "control";

  const timerLabel = document.createElement("label");

  const timerText = document.createElement("span");
  timerText.textContent = "Timer (0 for none)";

  const timerValue = document.createElement("span");
  timerValue.id = "timer-val";
  timerValue.textContent = 0;

  timerLabel.appendChild(timerText);
  timerLabel.appendChild(timerValue);

  const timerSlider = document.createElement("input");
  timerSlider.type = "range";
  timerSlider.min = 0;
  timerSlider.max = 5;
  timerSlider.step = 0.1;
  timerSlider.value = 0;

  timerSlider.addEventListener("pointerdown", playButtonSound);
  timerSlider.addEventListener("input", () => {
    timerValue.textContent = timerSlider.value;
  });

  timerWrap.appendChild(timerLabel);
  timerWrap.appendChild(timerSlider);
  controls.appendChild(timerWrap);

  // Cooldown
  const cooldownHeader = document.createElement("h3");
  cooldownHeader.textContent = "Cooldown";
  controls.appendChild(cooldownHeader);

  const cooldownWrap = document.createElement("div");
  cooldownWrap.className = "control";

  const cooldownLabel = document.createElement("label");
  cooldownLabel.textContent = "Guess Cooldown (ms) ";

  const cooldownValue = document.createElement("span");
  cooldownValue.textContent = GUESS_COOLDOWN;
  cooldownLabel.appendChild(cooldownValue);

  const cooldownSlider = document.createElement("input");
  cooldownSlider.type = "range";
  cooldownSlider.min = 0;
  cooldownSlider.max = 3000;
  cooldownSlider.step = 50;
  cooldownSlider.value = GUESS_COOLDOWN;

  cooldownSlider.addEventListener("pointerdown", playButtonSound);
  cooldownSlider.addEventListener("input", function () {
    window.GUESS_COOLDOWN = Number(this.value);
    cooldownValue.textContent = this.value;
  });

  cooldownWrap.appendChild(cooldownLabel);
  cooldownWrap.appendChild(cooldownSlider);
  controls.appendChild(cooldownWrap);
    // Audio
  const audioHeader = document.createElement("h3");
  audioHeader.textContent = "Audio";
  controls.appendChild(audioHeader);

  // --- SFX Volume ---
  const sfxWrap = document.createElement("div");
  sfxWrap.className = "control";

  const sfxLabel = document.createElement("label");

  const sfxText = document.createElement("span");
  sfxText.textContent = "SFX Volume";

  const sfxValue = document.createElement("span");
  sfxValue.textContent = SFX_VOLUME_MULT.toFixed(2);

  sfxLabel.appendChild(sfxText);
  sfxLabel.appendChild(sfxValue);

  const sfxSlider = document.createElement("input");
  sfxSlider.type = "range";
  sfxSlider.min = 0;
  sfxSlider.max = 1;
  sfxSlider.step = 0.01;
  sfxSlider.value = SFX_VOLUME_MULT;

  sfxSlider.addEventListener("pointerdown", playButtonSound);
  sfxSlider.addEventListener("input", () => {
    SFX_VOLUME_MULT = Number(sfxSlider.value);
    sfxValue.textContent = SFX_VOLUME_MULT.toFixed(2);
  });

  sfxWrap.appendChild(sfxLabel);
  sfxWrap.appendChild(sfxSlider);
  controls.appendChild(sfxWrap);

  // --- Streak Volume ---
  const streakWrap = document.createElement("div");
  streakWrap.className = "control";

  const streakLabel = document.createElement("label");

  const streakText = document.createElement("span");
  streakText.textContent = "High Streak Volume";

  const streakValue = document.createElement("span");
  streakValue.textContent = STREAK_VOLUME_MULT.toFixed(1);

  streakLabel.appendChild(streakText);
  streakLabel.appendChild(streakValue);

  const streakSlider = document.createElement("input");
  streakSlider.type = "range";
  streakSlider.min = 0;
  streakSlider.max = 1;
  streakSlider.step = 0.01;
  streakSlider.value = STREAK_VOLUME_MULT;

  streakSlider.addEventListener("pointerdown", playButtonSound);
  streakSlider.addEventListener("input", () => {
    STREAK_VOLUME_MULT = Number(streakSlider.value);
    streakValue.textContent = STREAK_VOLUME_MULT.toFixed(2);
  });

  streakWrap.appendChild(streakLabel);
  streakWrap.appendChild(streakSlider);
  controls.appendChild(streakWrap);

}



/* =========================
   TIMER LOGIC
========================= */
let timerInterval = null;
let remainingTime = 0;

function getTimerValue(){ const val=parseFloat(document.getElementById("timer-val").textContent); return isNaN(val)?0:val; }
function startTimer(onExpire){
  clearInterval(timerInterval);
  let timerValue = getTimerValue();
  const timerDisplay = document.getElementById("timer-display");
  if(timerValue<=0){ timerDisplay.textContent=""; return; }
  remainingTime=timerValue; timerDisplay.textContent=remainingTime.toFixed(2)+"s";
  const start = performance.now();
  timerInterval=setInterval(()=>{
    const elapsed = (performance.now()-start)/1000;
    remainingTime = Math.max(0,timerValue-elapsed);
    timerDisplay.textContent = remainingTime.toFixed(2)+"s";
    if(remainingTime<=0){ clearInterval(timerInterval); onExpire(); }
  },16);
}
function pauseTimer(){ clearInterval(timerInterval); if(remainingTime<=0) document.getElementById("timer-display").textContent=""; }
function updateTimerVisibility(){
  const timerValue = getTimerValue(); const timerDisplay = document.getElementById("timer-display");
  if(timerValue<=0) timerDisplay.textContent="";
  else if(remainingTime>0) timerDisplay.textContent = remainingTime.toFixed(2)+"s";
}

/* =========================
   GAME LOGIC
========================= */
const status = document.getElementById("status");
function calculateStreakQuality(streak, maxTimer, hadNoTimer) {
  if (hadNoTimer || maxTimer <= 0) return 0;
  return streak / maxTimer;
}

function logCurrentStreakQuality(){
  currentStreakQuality = calculateStreakQuality(
    currentStreak,
    currentStreakMaxTimer,
    currentStreakHadNoTimer
  );

  updateStreakAmbientSounds();
}

function endQualityStreak() {
  const finalQuality = calculateStreakQuality(
    currentStreak,
    currentStreakMaxTimer,
    currentStreakHadNoTimer
  );

  if (finalQuality > highestQuality) {
    highestQuality = finalQuality;
    highestQualityStreak = currentStreak;
    highestQualityTimer = currentStreakMaxTimer;
    highestQualityHadNoTimer = currentStreakHadNoTimer;
  }

  stopAllStreakSounds();
  currentStreakQuality = 0;

  // reset QUALITY-related state only
  currentStreakMaxTimer = 0;
  currentStreakHadNoTimer = false;
  lastQualityTimerMode = null;
}



function updateStreakDisplay(){
  const timerText = highestStreakHadNoTimer ? "no timer" : `${highestStreakTimer.toFixed(2)}s`;
  streakDisplay.innerHTML = `Streak: ${currentStreak}<br>Highest Streak: ${highestStreak} (${timerText})`;
}

function resolveGuess(guessYes, timedOut = false) {
  pauseTimer();
  setGuessButtonsEnabled(false);

  const beats = currentScore >= SCORE_TO_BEAT;
  const correct = !timedOut && guessYes === beats;
  const timerValue = parseFloat(document.getElementById("timer-val").textContent) || 0;
  const currentTimerMode = timerValue > 0 ? "timed" : "none";

  // detect timer-mode transitions for QUALITY ONLY
  if (lastQualityTimerMode !== null && currentTimerMode !== lastQualityTimerMode) {
    // timed → none OR none → timed
    endQualityStreak();
  }
  lastQualityTimerMode = currentTimerMode;

  if (correct) {
    playRandomCorrectSound();

    currentStreak++;

    // track timer usage for THIS streak
    if (timerValue === 0) {
      currentStreakHadNoTimer = true;
    } else {
      currentStreakMaxTimer = Math.max(currentStreakMaxTimer, timerValue);
    }


    // ALWAYS log current streak quality
    logCurrentStreakQuality();

    // normal highest streak tracking
    if (currentStreak > highestStreak) {
      highestStreak = currentStreak;
      highestStreakTimer = currentStreakMaxTimer;
      highestStreakHadNoTimer = currentStreakHadNoTimer;
    }

  } else {
    playRandomWrongSound();

    // streak just ended → evaluate its FINAL quality
    const finalQuality = calculateStreakQuality(
      currentStreak,
      currentStreakMaxTimer,
      currentStreakHadNoTimer
    );

    if (finalQuality > highestQuality) {
      highestQuality = finalQuality;
      highestQualityStreak = currentStreak;
      highestQualityTimer = currentStreakMaxTimer;
      highestQualityHadNoTimer = currentStreakHadNoTimer;
    }

    // stop ALL layered quality sounds
    stopAllStreakSounds();

    // reset current quality tracking
    currentStreakQuality = 0;

    // reset streak state
    currentStreak = 0;
    currentStreakMaxTimer = 0;
    currentStreakHadNoTimer = false;
  }


  updateStreakDisplay();
  status.style.top = "50px";
  status.textContent = `Score: ${currentScore}`;

  setTimeout(() => {
    status.textContent = "";
    reroll();
    setGuessButtonsEnabled(true);
  }, window.GUESS_COOLDOWN);
}

document.getElementById("yes").onclick=()=>resolveGuess(true);
document.getElementById("no").onclick=()=>resolveGuess(false);

/* =========================
   TOGGLE CONTROLS
========================= */
const toggleBtn=document.getElementById("toggle-controls");
const controls=document.getElementById("controls");
const layout=document.getElementById("layout");

toggleBtn.textContent="Settings";
toggleBtn.onclick = () => {
  playButtonSound();

  const visible = controls.classList.toggle("hidden") === false;
  layout.classList.toggle("centered", !visible);
  toggleBtn.textContent = visible ? "Hide Settings" : "Settings";
};


layout.classList.add("centered");
