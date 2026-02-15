/* =========================
   CONFIG
========================= */
const SHEET_1_SRC = "textures/Enhancers.png";
const SHEET_2_SRC = "textures/8BitDeck_opt2.png";
const jokerSheet = new Image();
jokerSheet.src = "textures/Jokers.png";
const smallJokerSheet = new Image();
smallJokerSheet.src = "textures/JokersSmall.png";
window.MULT_0  = 2.5902;
window.MULT_1  = 3.8963;
window.MULT_2  = 5.6829;
window.MULT_3  = 7.8771;
window.MULT_4  = 11.5118;
window.MULT_5  = 15.8726;
window.MULT_6  = 22.9161;
window.MULT_7  = 31.7081;
window.MULT_8  = 39.8186;
window.MULT_9  = 58.7168;
window.MULT_10 = 75.4157;
let HardMode = false;

let FixedScoringEnabled = false;
let FixedScoringValue = 300;
//debugging
let wrongs = 0;
let corrects = 0;

const ALMOST_THERE_SOUNDS = [
  {
    threshold: 15,
    file: "sounds/streak/ambientFire1.ogg",
    volume: 0.15,
    fadeIn: 1200
  },
  {
    threshold: 16,
    file: "sounds/streak/ambientFire2.ogg",
    volume: 0.2,
    fadeIn: 1600
  },
  {
    threshold: 17,
    file: "sounds/streak/ambientFire3.ogg",
    volume: 0.25,
    fadeIn: 1600
  },
  {
    threshold: 18,
    file: "sounds/streak/ambientOrgan1.ogg",
    volume: 0.1,
    fadeIn: 4000
  }
];
const activeAmbientLayers = new Map(); // threshold -> Audio
function stopAllAmbientLayers() {
  activeAmbientLayers.forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
  activeAmbientLayers.clear();
}

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

const JOKER_COLS = 10;
const JOKER_ROWS = 16;

let currentJokers = [];
let MAX_JOKERS = 5;

const ENHANCERS = [
  { type: "none", col: 2, row: 1, weight: 60 },
  { type: "bonus", col: 2, row: 2, weight: 20 },  // +30 chips
  { type: "mult",  col: 3, row: 2, weight: 15 },  // +4 mult
  { type: "glass", col: 6, row: 2, weight: 5 }    // x2 mult
];

function randomEnhancer() {
  const totalWeight = ENHANCERS.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const enhancer of ENHANCERS) {
    if (r < enhancer.weight) return enhancer;
    r -= enhancer.weight;
  }
  return ENHANCERS[0]; // fallback
}

// ----- SEALS -----

const SEAL_CONFIG = [
  { type: null, weight: 8 },        // No seal
  { type: "red_seal", weight: 2 }   // Red seal
];
function randomSeal() {

  const totalWeight = SEAL_CONFIG.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const seal of SEAL_CONFIG) {
    if (roll < seal.weight) {
      return seal.type;
    }
    roll -= seal.weight;
  }

  return null;
}

const SHEET_1_COLS = 7;
const SHEET_1_ROWS = 5;
const SHEET_2_COLS = 13;
const SHEET_2_ROWS = 4;

const BASE_COL = 2;
const BASE_ROW = 1;


const ROW_PRIORITY = [3, 0, 1, 2];

let GUESS_COOLDOWN = 1000;
window.GUESS_COOLDOWN = GUESS_COOLDOWN;
let roundStartTime = 0;
let joker_spawn_rate = 0.7;

const ROUND_BASES = [
  100,
  300,
  800,
  2000,
  5000,
  11000,
  20000,
  35000,
  50000,
  110000,
  560000,
  7200000,
  300000000,
  47000000000,
  2900000000000,
  77000000000000000,
  860000000000000000000
];
const ALL_REQUIREMENTS = [];

for (const base of ROUND_BASES) {
  ALL_REQUIREMENTS.push(base);
  ALL_REQUIREMENTS.push(Math.floor(base * 1.5));
  ALL_REQUIREMENTS.push(base * 2);
}

// Sort ascending for easier comparison
ALL_REQUIREMENTS.sort((a, b) => a - b);

let currentTargetScore = 0;

function updateTargetDisplay() {
  document.getElementById("target-score").textContent =
    currentTargetScore.toLocaleString();
}

/* =========================
   AUDIO
========================= */
let SFX_VOLUME_MULT = 0.5;

const CORRECT_SOUND_POOLS = [
  { weight: 2, files: ["sounds/correct/chips/chips1.ogg", "sounds/correct/chips/chips2.ogg"] },
  { weight: 2, files: ["sounds/correct/cash/coin1.ogg","sounds/correct/cash/coin2.ogg","sounds/correct/cash/coin3.ogg","sounds/correct/cash/coin4.ogg","sounds/correct/cash/coin5.ogg","sounds/correct/cash/coin6.ogg","sounds/correct/cash/coin7.ogg"] },
  { weight: 1, files: ["sounds/correct/mult/multhit2.ogg"] }
];

const WRONG_SOUNDS = [
  "sounds/wrong/glass1.ogg","sounds/wrong/glass2.ogg","sounds/wrong/glass3.ogg",
  "sounds/wrong/glass4.ogg","sounds/wrong/glass5.ogg","sounds/wrong/glass6.ogg"
];

/* =========================
   PATTERNS & SCORES
========================= */
const PATTERNS = [
  { id: "flush_five", name: "flush_five", label: "Flush Five", weight: 10, gen: flushFive },
  { id: "flush_house", name: "flush_house", label: "Flush House", weight: 10, gen: flushHouse },
  { id: "five_kind", name: "five_kind", label: "Five of a Kind", weight: 10, gen: fiveKind },
  { id: "straight_flush", name: "straight_flush", label: "Straight Flush", weight: 6, gen: straightFlush },
  { id: "four_kind", name: "four_kind", label: "Four of a Kind", weight: 6, gen: fourOfAKind },
  { id: "full_house", name: "full_house", label: "Full House", weight: 40, gen: fullHouse },
  { id: "flush", name: "flush", label: "Flush", weight: 80, gen: flush },
  { id: "straight", name: "straight", label: "Straight", weight: 40, gen: straight },
  { id: "three_kind", name: "three_kind", label: "Three of a Kind", weight: 3, gen: threeKind },
  { id: "two_pair", name: "two_pair", label: "Two Pair", weight: 3, gen: twoPair },
  { id: "pair", name: "pair", label: "Pair", weight: 5, gen: pair },
  { id: "high_card", name: "high_card", label: "High Card", weight: 4, gen: highCard }
];
const HAND_SCORES = {
  straight_flush: { chips: 100, mult: 8 },
  four_kind: { chips: 60, mult: 7 },
  full_house: { chips: 40, mult: 4 },
  flush: { chips: 35, mult: 4 },
  straight: { chips: 30, mult: 4 },
  high_card: { chips: 5, mult: 1 },

  // New patterns
  flush_five: { chips: 160, mult: 16 },
  flush_house: { chips: 140, mult: 14 },
  five_kind: { chips: 120, mult: 12 },
  three_kind: { chips: 30, mult: 3 },
  two_pair: { chips: 20, mult: 2 },
  pair: { chips: 10, mult: 2 }
};

/* =========================
   STATE
========================= */
let sheet1, sheet2;
let currentPattern = null;
let currentCards = [];
let currentScore = 0;
let runScore = 0;
let currentRound = 1;
let highestScore = 0;
const MAX_ROUNDS = 20;
let roundQueue = [];

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
    buildRoundQueue();
    reroll();
  });

/* =========================
   HELPERS
========================= */
const JOKER_DEFS = [
  { name: "joker", type: "post_card", col: 0, row: 0, weight: 1 },        // (1,1)
  { name: "jolly", type: "post_card", col: 2, row: 0, weight: 1 },        // (3,1)
  { name: "zanny", type: "post_card", col: 3, row: 0, weight: 1 },        // (4,1)
  { name: "mad", type: "post_card", col: 4, row: 0, weight: 1 },          // (5,1)
  { name: "crazy", type: "post_card", col: 5, row: 0, weight: 1 },        // (6,1)
  { name: "droll", type: "post_card", col: 6, row: 0, weight: 1 },        // (7,1)
  { name: "sly", type: "post_card", col: 0, row: 14, weight: 1 },         // (15,1)
  { name: "willy", type: "post_card", col: 1, row: 14, weight: 1 },       // (15,2)
  { name: "clever", type: "post_card", col: 2, row: 14, weight: 1 },      // (15,3)
  { name: "devious", type: "post_card", col: 3, row: 14, weight: 1 },     // (15,4)
  { name: "crafty", type: "post_card", col: 4, row: 14, weight: 1 },      // (15,5)
  { name: "abstract", type: "post_card", col: 3, row: 3, weight: 1 },      // (4,4)
  { name: "gros_michel", type: "post_card", col: 7, row: 6, weight: 1 },   // (7,8)
  { name: "cavendish", type: "post_card", col: 5, row: 11, weight: 1 },     // (12,6)
  { name: "seeing_double", type: "post_card", col: 4, row: 4, weight: 1 }, // (5,5)
  { name: "mr_bones", type: "post_card", col: 3, row: 4, weight: 1 },      // (5,4)
  { name: "stencil", type: "post_card", col: 2, row: 5, weight: 1 },       // (6,3)
  { name: "flower_pot", type: "post_card", col: 0, row: 6, weight: 1 },    // (7,1)
  { name: "duo", type: "post_card", col: 5, row: 4, weight: 1 },           // (6,5)
  { name: "trio", type: "post_card", col: 6, row: 4, weight: 1 },          // (7,5)
  { name: "family", type: "post_card", col: 7, row: 4, weight: 1 },        // (8,5)
  { name: "order", type: "post_card", col: 8, row: 4, weight: 1 },         // (9,5)
  { name: "tribe", type: "post_card", col: 9, row: 4, weight: 1 },         // (10,5)
  { name: "stuntman", type: "post_card", col: 8, row: 6, weight: 1 }      // (7,9)

];

const ON_SCORING_JOKERS = [
  { name: "greedy_joker", col: 6, row: 1, type: "on_score", weight: 1 },      // 7,2
  { name: "lusty_joker", col: 7, row: 1, type: "on_score", weight: 1 },       // 8,2
  { name: "wrathful_joker", col: 8, row: 1, type: "on_score", weight: 1 },    // 9,2
  { name: "gluttonous_joker", col: 9, row: 1, type: "on_score", weight: 1 },  // 10,2
  { name: "even_steven", col: 8, row: 3, type: "on_score", weight: 1 },       // 9,4
  { name: "odd_todd", col: 9, row: 3, type: "on_score", weight: 1 },          // 10,4
  { name: "walkie_talkie", col: 8, row: 15, type: "on_score", weight: 1 },    // 9,16
  { name: "scholar", col: 0, row: 4, type: "on_score", weight: 1 },           // 1,5
  { name: "smiley_face", col: 6, row: 15, type: "on_score", weight: 1 },      // 7,16
  { name: "photograph", col: 2, row: 13, type: "on_score", weight: 1 },       // 3,14
  { name: "fibonacci", col: 1, row: 5, type: "on_score", weight: 1 },         // 2,6
  { name: "arrowhead", col: 1, row: 8, type: "on_score", weight: 1 },         // 2,9
  { name: "onys_agate", col: 2, row: 8, type: "on_score", weight: 1 },        // 3,9
  { name: "triboulet", bgCol: 4, bgRow: 8, topCol: 4, topRow: 9, type: "on_score", weight: 1 } // 5,9 + 5,10
];

const RETRIGGER_JOKERS = [
  { name: "sock_and_buskin", col: 3, row: 1, type: "retrigger", weight: 1 }, // 3,1
  { name: "hack", col: 5, row: 2, type: "retrigger", weight: 1 },            // 5,2
  { name: "hanging_chad", col: 9, row: 6, type: "retrigger", weight: 1 },   // 9,6
  { name: "seltzer", col: 3, row: 15, type: "retrigger", weight: 1 }         // 3,15
];

const COPY_JOKERS = [
  { name: "blueprint", col: 0, row: 3, type: "copy", weight: 1 },    // 0,3
  { name: "brainstorm", col: 7, row: 7, type: "copy", weight: 1 }   // 7,7
];
const RECOGNITION_JOKERS = [
  { name: "splash", col: 6, row: 10, type: "recognition", weight: 1 },       // 6,10
  { name: "smeared_joker", col: 4, row: 6, type: "recognition", weight: 1 }, // 4,6
  { name: "pareidolia", col: 6, row: 3, type: "recognition", weight: 1 }     // 6,3
];


// Merge into your main JOKER_DEFS so generation can pick them
const ALL_JOKERS = [
  ...JOKER_DEFS,
  ...ON_SCORING_JOKERS,
  ...RETRIGGER_JOKERS,
  ...COPY_JOKERS,
  ...RECOGNITION_JOKERS
];

function pickWeightedJoker() {
  const totalWeight = ALL_JOKERS.reduce((sum, j) => sum + j.weight, 0);
  let r = Math.random() * totalWeight;

  for (const j of ALL_JOKERS) {
    r -= j.weight;
    if (r <= 0) return { ...j };
  }

  return { ...ALL_JOKERS[0] };
}

function generateJokers() {

  const jokers = [];

  for (let i = 0; i < MAX_JOKERS; i++) {
    if (Math.random() < joker_spawn_rate) {
      jokers.push(pickWeightedJoker());
    }
  }

  return jokers;
}


function getClosestRequirement(score) {

  const below = ALL_REQUIREMENTS.filter(v => v <= score);
  const above = ALL_REQUIREMENTS.filter(v => v >= score);

  const pickAbove = Math.random() < 0.5;

  if (pickAbove && above.length) {
    // Closest above
    return above.reduce((closest, val) =>
      Math.abs(val - score) < Math.abs(closest - score) ? val : closest
    );
  }

  if (!pickAbove && below.length) {
    // Closest below
    return below.reduce((closest, val) =>
      Math.abs(val - score) < Math.abs(closest - score) ? val : closest
    );
  }

  // Fallback if one side empty
  if (above.length) return above[0];
  if (below.length) return below[below.length - 1];

  return ALL_REQUIREMENTS[0];
}

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
function playFailSound() {
  const audio = new Audio("sounds/cancel.ogg");
  audio.volume = 0.5; // adjust as needed
  audio.play().catch(() => {}); // ignore autoplay block errors
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
  const tripleCol = randInt(0, 12);
  let pairCol;
  do { pairCol = randInt(0, 12); } while (pairCol === tripleCol);

  const rowsA = shuffle([...Array(4).keys()]).slice(0, 3);
  const rowsB = shuffle([...Array(4).keys()]).slice(0, 2);

  return [
    ...rowsA.map(row => ({ col: tripleCol, row })),
    ...rowsB.map(row => ({ col: pairCol, row }))
  ];
}

function flush() {
  const cols = shuffle([...Array(13).keys()]).slice(0, 5);
  const row = randInt(0, 3);
  return cols.map(col => ({ col, row }));
}

function straight() {
  const startCol = randInt(0, 8);
  let rows;
  do {
    rows = Array.from({ length: 5 }, () => randInt(0, 3));
  } while (rows.every(r => r === rows[0]));
  return rows.map((row, i) => ({ col: startCol + i, row }));
}

function highCard() {
  while (true) {
    const cols = shuffle([...Array(13).keys()]).slice(0, 5);
    const sorted = [...cols].sort((a, b) => a - b);
    const isConsec = sorted.every((v, i, arr) => i === 0 || v === arr[i - 1] + 1);
    if (isConsec) continue;
    const rows = cols.map(() => randInt(0, 3));
    if (rows.every(r => r === rows[0])) continue;
    return cols.map((col, i) => ({ col, row: rows[i] }));
  }
}
function flushFive() {
  // Five cards of the same rank and suit
  const col = randInt(0, 12);
  const suit = randInt(0, 3);
  return Array(5).fill(0).map(() => ({ col, row: suit }));
}

function flushHouse() {
  // Full house where all cards share the same suit
  const suit = randInt(0, 3);
  const tripleCol = randInt(0, 12);
  let pairCol;
  do { pairCol = randInt(0, 12); } while (pairCol === tripleCol);

  const rowsA = shuffle([...Array(4).keys()]).slice(0, 3);
  const rowsB = shuffle([...Array(4).keys()]).slice(0, 2);

  return [
    ...rowsA.map(() => ({ col: tripleCol, row: suit })),
    ...rowsB.map(() => ({ col: pairCol, row: suit }))
  ];
}

function fiveKind() {
  // Five cards of the same rank, suits can repeat
  const col = randInt(0, 12);
  const rows = Array(5).fill(0).map(() => randInt(0, 3));
  return rows.map(row => ({ col, row }));
}

function threeKind() {
  while (true) {
    const tripleCol = randInt(0, 12);

    let otherCols = [];
    while (otherCols.length < 2) {
      const c = randInt(0, 12);
      if (c !== tripleCol && !otherCols.includes(c)) {
        otherCols.push(c);
      }
    }

    const tripleRows = shuffle([0,1,2,3]).slice(0, 3);
    const otherRows = shuffle([0,1,2,3]).slice(0, 2);

    const cards = [
      ...tripleRows.map(row => ({ col: tripleCol, row })),
      { col: otherCols[0], row: otherRows[0] },
      { col: otherCols[1], row: otherRows[1] }
    ];

    // Validate exact rank counts
    const counts = {};
    for (const c of cards) counts[c.col] = (counts[c.col] || 0) + 1;

    const freq = Object.values(counts).sort().join(",");
    if (freq === "1,1,3") return cards;
  }
}


function twoPair() {
  while (true) {
    let pair1 = randInt(0, 12);
    let pair2;
    do { pair2 = randInt(0, 12); } while (pair2 === pair1);

    let single;
    do { single = randInt(0, 12); } 
    while (single === pair1 || single === pair2);

    const pair1Rows = shuffle([0,1,2,3]).slice(0, 2);
    const pair2Rows = shuffle([0,1,2,3]).slice(0, 2);
    const singleRow = randInt(0, 3);

    const cards = [
      ...pair1Rows.map(row => ({ col: pair1, row })),
      ...pair2Rows.map(row => ({ col: pair2, row })),
      { col: single, row: singleRow }
    ];

    // Validate exact rank counts
    const counts = {};
    for (const c of cards) counts[c.col] = (counts[c.col] || 0) + 1;

    const freq = Object.values(counts).sort().join(",");
    if (freq === "1,2,2") return cards;
  }
}


function pair() {
  // Two cards share a rank, others do not form a pair or three of a kind
  const pairCol = randInt(0, 12);
  let otherCols = [];
  while (otherCols.length < 3) {
    const c = randInt(0, 12);
    if (c !== pairCol && !otherCols.includes(c)) otherCols.push(c);
  }

  const pairRows = shuffle([...Array(4).keys()]).slice(0, 2);
  const otherRows = shuffle([...Array(4).keys()]).slice(0, 3);

  return [
    ...pairRows.map(row => ({ col: pairCol, row })),
    { col: otherCols[0], row: otherRows[0] },
    { col: otherCols[1], row: otherRows[1] },
    { col: otherCols[2], row: otherRows[2] }
  ];
}

function randomCell(cols, rows) {
  return { col: randInt(0, cols - 1), row: randInt(0, rows - 1) };
}

/* =========================
   SCORING
========================= */
function cardChips(col) {
  const rank = col + 2;
  if (rank === 14) return 11;
  if (rank >= 11 && rank <= 13) return 10;
  return rank;
}

function calculateScore(pattern, cards, currentJokers = []) {
  let mrBonesActive = false;

  // ----- RESOLVE COPY JOKERS -----
  const resolvedJokers = currentJokers.map(j => ({ ...j }));
  for (let i = 0; i < resolvedJokers.length; i++) {
    const joker = resolvedJokers[i];
    if (joker.type === "copy") {
      let target = null;
      if (joker.name === "brainstorm" && i > 0) target = resolvedJokers[0];
      else if (joker.name === "blueprint" && i < resolvedJokers.length - 1) target = resolvedJokers[i + 1];

      const visited = new Set();
      while (target?.type === "copy") {
        if (visited.has(target)) { target = null; break; }
        visited.add(target);

        const idx = resolvedJokers.indexOf(target);
        if (target.name === "brainstorm") target = idx > 0 ? resolvedJokers[0] : null;
        else if (target.name === "blueprint") target = idx < resolvedJokers.length - 1 ? resolvedJokers[idx + 1] : null;
        else break;
      }

      resolvedJokers[i] = target ? { ...target } : { name: "none", type: "none", weight: 0 };
    }
  }
  currentJokers = resolvedJokers;

  // ----- RECOGNITION JOKERS -----
  let allCardsScore = false;
  let suitDoubling = false;  // smeared
  let treatAllAsFace = false; // pareidolia
  const recognitionJokers = currentJokers.filter(j => j.type === "recognition");
  for (const joker of recognitionJokers) {
    switch (joker.name) {
      case "splash": allCardsScore = true; break;
      case "smeared_joker": suitDoubling = true; break;
      case "pareidolia": treatAllAsFace = true; break;
    }
  }

  const base = HAND_SCORES[pattern.name];
  let totalChips = base.chips;
  let totalMult = base.mult;
  // ----- SMEARED JOKER HAND UPGRADE -----
  if (suitDoubling) { // only if smeared joker is active
    const allRed = cards.every(c => [0, 2].includes(c.row));   // hearts=0, diamonds=2
    const allBlack = cards.every(c => [1, 3].includes(c.row)); // clubs=1, spades=3

    if (allRed || allBlack) {
      switch (pattern.name) {
        case "high_card":
        case "pair":
        case "two_pair":
        case "three_kind":
          //console.log("Smeared joker upgrade: base hand upgraded to flush");
          pattern = { ...pattern, name: "flush" };
          totalChips = HAND_SCORES.flush.chips;
          totalMult = HAND_SCORES.flush.mult;
          break;

        case "straight":
          //console.log("Smeared joker upgrade: straight -> straight_flush");
          pattern = { ...pattern, name: "straight_flush" };
          totalChips = HAND_SCORES.straight_flush.chips;
          totalMult = HAND_SCORES.straight_flush.mult;
          break;

        case "full_house":
          //console.log("Smeared joker upgrade: full_house -> flush_house");
          pattern = { ...pattern, name: "flush_house" };
          totalChips = HAND_SCORES.flush_house.chips;
          totalMult = HAND_SCORES.flush_house.mult;
          break;

        case "five_kind":
          //console.log("Smeared joker upgrade: five_of_a_kind -> flush_five");
          pattern = { ...pattern, name: "flush_five" };
          totalChips = HAND_SCORES.flush_five.chips;
          totalMult = HAND_SCORES.flush_five.mult;
          break;

        // four_kind stays the same
      }
    }
  }

  //console.log("=== CALCULATE SCORE ===");
  //console.log("Base chips:", base.chips, "Base mult:", base.mult);

  // ----- DETERMINE SCORING CARDS ----- yanderedev coding omg
  let scoredCards = [];
  if (!allCardsScore) {
    if (pattern.name === "four_kind") {
      const counts = {};
      for (const c of cards) counts[c.col] = (counts[c.col] || 0) + 1;
      const quadCol = Number(Object.keys(counts).find(c => counts[c] === 4));
      scoredCards = cards.filter(c => c.col === quadCol);
    } else if (pattern.name === "three_kind") {
      const counts = {};
      for (const c of cards) counts[c.col] = (counts[c.col] || 0) + 1;
      const tripleCol = Number(Object.keys(counts).find(c => counts[c] === 3));
      scoredCards = cards.filter(c => c.col === tripleCol);
    } else if (pattern.name === "two_pair") {
      const counts = {};
      for (const c of cards) counts[c.col] = (counts[c.col] || 0) + 1;
      const pairCols = Object.keys(counts).filter(c => counts[c] === 2).map(Number);
      scoredCards = cards.filter(c => pairCols.includes(c.col));
    } else if (pattern.name === "pair") {
      const counts = {};
      for (const c of cards) counts[c.col] = (counts[c.col] || 0) + 1;
      const pairCol = Number(Object.keys(counts).find(c => counts[c] === 2));
      scoredCards = cards.filter(c => c.col === pairCol);
    } else if (pattern.name === "high_card") {
      const highestCol = Math.max(...cards.map(c => c.col));
      scoredCards = cards.filter(c => c.col === highestCol);
    } else {
      scoredCards = [...cards];
    }
  } else {
    scoredCards = [...cards]; // splash overrides, all cards score
  }

  scoredCards.sort((a,b) => b.col - a.col || ROW_PRIORITY.indexOf(a.row) - ROW_PRIORITY.indexOf(b.row));
  //console.log("Scored cards:", scoredCards.map(c => `col:${c.col}, row:${c.row}, enh:${c.enhancer.type}`));

  // ----- FILTER JOKERS BY TYPE -----
  const onScoreJokers = currentJokers.filter(j => j.type === "on_score");
  const postCardJokers = currentJokers.filter(j => j.type !== "on_score" && j.type !== "retrigger" && j.type !== "recognition");
  const retriggerJokers = currentJokers.filter(j => j.type === "retrigger");

  // ----- CARD SCORING PHASE -----
  for (let i = 0; i < scoredCards.length; i++) {
    const card = scoredCards[i];
    const triggers = [];

    // Determine retriggers

    // --- Red Seal retrigger ---
    if (card.seal === "red_seal") {
      triggers.push(1);
    }

    // --- Joker retriggers ---
    for (const joker of retriggerJokers) {
      switch (joker.name) {
        case "sock_and_buskin":
          if ((card.col >= 9 && card.col <= 11) || treatAllAsFace)
            triggers.push(1);
          break;

        case "hack":
          if (card.col >= 0 && card.col <= 3)
            triggers.push(1);
          break;

        case "hanging_chad":
          if (i === 0)
            triggers.push(2);
          break;

        case "seltzer":
          triggers.push(1);
          break;
      }
    }

    triggers.unshift(1); // always score at least once

    for (const t of triggers) {
      for (let r = 0; r < t; r++) {
        let cardChipValue = cardChips(card.col);

        // --- ENHANCEMENTS FIRST ---
        if (card.enhancer.type === "bonus") cardChipValue += 30;
        if (card.enhancer.type === "mult") totalMult += 4;
        if (card.enhancer.type === "glass") totalMult *= 2;

        // Determine if card counts as face
        const isFaceCard = treatAllAsFace || (card.col >= 9 && card.col <= 11);
        const leftmostFaceCard = scoredCards.find(c2 => treatAllAsFace || (c2.col >= 9 && c2.col <= 11));

        // Determine effective suits (for smeared joker)
        let effectiveSuits = [card.row];
        if (suitDoubling) {
          if ([0,2].includes(card.row)) effectiveSuits = [0,2]; // hearts & diamonds
          if ([1,3].includes(card.row)) effectiveSuits = [1,3]; // clubs & spades
        }

        // --- ON-SCORING JOKERS ---
        for (const joker of onScoreJokers) {
          switch(joker.name) {
            case "greedy_joker": if (effectiveSuits.includes(2)) totalMult += 3; break;
            case "lusty_joker": if (effectiveSuits.includes(0)) totalMult += 3; break;
            case "wrathful_joker": if (effectiveSuits.includes(3)) totalMult += 3; break;
            case "gluttonous_joker": if (effectiveSuits.includes(1)) totalMult += 3; break;
            case "even_steven": if (card.col <= 8 && card.col % 2 === 0) totalMult += 4; break;
            case "odd_todd": if (card.col <= 8 && card.col % 2 === 1) cardChipValue += 31; break;
            case "scholar": if (card.col === 12) { cardChipValue += 20; totalMult += 4; } break;
            case "fibonacci": if ([0,1,3,6,12].includes(card.col)) totalMult += 8; break;
            case "arrowhead": if (effectiveSuits.includes(3)) cardChipValue += 50; break;
            case "onys_agate": if (effectiveSuits.includes(1)) totalMult += 7; break;
            case "photograph": if (card === leftmostFaceCard) totalMult *= 2; break;
            case "smiley_face": if (isFaceCard) totalMult += 5; break;
            case "walkie_talkie": if ([2,8].includes(card.col)) { cardChipValue += 10; totalMult += 4; } break;
            case "triboulet": if ([10,11].includes(card.col)) totalMult *= 2; break;
          }
        }

        totalChips += cardChipValue;
        //console.log(`Card ${card.col},${card.row} scored -> chips: ${cardChipValue}, totalChips: ${totalChips}, totalMult: ${totalMult}`);
      }
    }
  }

  // ----- POST-CARD SCORING PHASE -----
  //console.log("----- POST-CARD SCORING PHASE -----");
  //console.log("Current jokers in order:", postCardJokers.map(j => j.name));

  if (postCardJokers.length > 0) {
    // Effective suits for post-card logic
    let scoringCardsForSuits = [];
    for (const c of scoredCards) {
      if (suitDoubling) {
        if ([0,2].includes(c.row)) scoringCardsForSuits.push({ ...c, row: 0 }, { ...c, row: 2 });
        if ([1,3].includes(c.row)) scoringCardsForSuits.push({ ...c, row: 1 }, { ...c, row: 3 });
      } else scoringCardsForSuits.push(c);
    }

    const rankCounts = {};
    for (const c of scoredCards) rankCounts[c.col] = (rankCounts[c.col] || 0) + 1;
    const counts = Object.values(rankCounts);

    const isStraight = pattern.name === "straight" || pattern.name === "straight_flush";
    const isFlush = pattern.name === "flush" || pattern.name === "straight_flush" || pattern.name === "flush_house" || pattern.name === "flush_five";

    const scoringSuits = new Set(scoringCardsForSuits.map(c => c.row));
    const hasClub = scoringSuits.has(1);
    const hasOtherSuit = Array.from(scoringSuits).some(r => r !== 1);
    const totalJokers = currentJokers.length;
    const emptySlots = MAX_JOKERS - totalJokers;
    const stencilCount = postCardJokers.filter(j => j.name === "stencil").length;

    for (const joker of postCardJokers) {
      switch (joker.name) {
        case "joker": totalMult += 4; break;
        case "jolly": if (counts.some(v => v >= 2)) totalMult += 8; break;
        case "zanny": if (counts.some(v => v >= 3)) totalMult += 12; break;
        case "mad": if (counts.filter(v => v >= 2).length >= 2) totalMult += 10; break;
        case "crazy": if (isStraight) totalMult += 12; break;
        case "droll": if (isFlush) totalMult += 10; break;
        case "sly": if (counts.some(v => v >= 2)) totalChips += 50; break;
        case "willy": if (counts.some(v => v >= 3)) totalChips += 100; break;
        case "clever": if (counts.filter(v => v >= 2).length >= 2) totalChips += 80; break;
        case "devious": if (isStraight) totalChips += 100; break;
        case "crafty": if (isFlush) totalChips += 80; break;
        case "duo": if (counts.some(v => v >= 2)) totalMult *= 2; break;
        case "trio": if (counts.some(v => v >= 3)) totalMult *= 3; break;
        case "family": if (counts.some(v => v >= 4)) totalMult *= 4; break;
        case "order": if (isStraight) totalMult *= 3; break;
        case "tribe": if (isFlush) totalMult *= 2; break;
        case "abstract": totalMult += 3 * totalJokers; break;
        case "seeing_double": if (hasClub && hasOtherSuit) totalMult *= 2; break;
        case "mr_bones": mrBonesActive = true; break;
        case "stencil": totalMult *= (emptySlots + stencilCount); break;
        case "flower_pot": {
          if (!suitDoubling) {
            // Normal: need at least one of each suit
            const suits = new Set(scoredCards.map(c => c.row));
            if (suits.has(0) && suits.has(1) && suits.has(2) && suits.has(3)) totalMult *= 3;
          } else {
            // Smeared: need at least 2 red cards (0/2) and 2 black cards (1/3)
            const redCount = scoredCards.filter(c => c.row === 0 || c.row === 2).length;
            const blackCount = scoredCards.filter(c => c.row === 1 || c.row === 3).length;
            if (redCount >= 2 && blackCount >= 2) totalMult *= 3;
          }
          break;
        }

        case "gros_michel": totalMult += 15; break;
        case "stuntman": totalChips += 250; break;
        case "cavendish": totalMult *= 3; break;
      }
      //console.log(`Joker "${joker.name}" applied post-card -> totalChips: ${totalChips}, totalMult: ${totalMult}`);
    }
  }

  //console.log("FINAL SCORE ->", totalChips, "*", totalMult, "=", totalChips * totalMult);
  return totalChips * totalMult;
}









function calculateBase(pattern, cards) {
  const base = HAND_SCORES[pattern.name];

  let totalChips = base.chips;
  let totalMult = base.mult;

  let scoredCards = [];

  if (pattern.name === "four_kind") {
    const counts = {};
    for (const c of cards) counts[c.col] = (counts[c.col] || 0) + 1;
    const quadCol = Number(Object.keys(counts).find(c => counts[c] === 4));
    scoredCards = cards.filter(c => c.col === quadCol);
  } 
  else if (pattern.name === "high_card") {
    const highestCol = Math.max(...cards.map(c => c.col));
    scoredCards = cards.filter(c => c.col === highestCol);
  } 
  else {
    scoredCards = [...cards];
  }

  // ----- CARD SCORING PHASE -----

  for (const card of scoredCards) {
    totalChips += cardChips(card.col);
  }
  return totalChips * totalMult;
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
function generateRoundScenario() {
  const pattern = pickPattern();
  let tops = pattern.gen();

  tops.sort((a, b) =>
    a.col !== b.col
      ? b.col - a.col
      : ROW_PRIORITY.indexOf(a.row) - ROW_PRIORITY.indexOf(b.row)
  );

  const cards = tops.map(card => ({
    ...card,
    enhancer: randomEnhancer(),
    seal: randomSeal()
  }));

  const jokers = generateJokers();

  const score = calculateScore(pattern, cards, jokers);

  let targetScore;

  if (HardMode) {
    const hasMrBones = jokers.some(j => j.name === "mr_bones");
    const effectiveScore = hasMrBones ? score * 4 : score;
    targetScore = getClosestRequirement(effectiveScore);

    console.log("HardMode active:");
    console.log("Score:", score, "EffectiveScore:", effectiveScore, "TargetScore:", targetScore);

  } else if (FixedScoringEnabled) {
    // Use the fixed scoring value
    targetScore = getClosestRequirement(FixedScoringValue);

    console.log("Fixed Scoring active:");
    console.log("FixedScoringValue:", FixedScoringValue, "TargetScore:", targetScore);

  } else {
    const baseOnlyScore = calculateBase(pattern, cards);

    const jokerCount = jokers.length;

    // Dynamically read the global MULT_* variable
    const selectedMultiplier = window[`MULT_${Math.min(jokerCount, MAX_JOKERS)}`];

    console.log("Base score:", baseOnlyScore);
    console.log("Joker count:", jokerCount);
    console.log(`Reading multiplier MULT_${Math.min(jokerCount, MAX_JOKERS)}:`, selectedMultiplier);

    const requirementScore = baseOnlyScore * selectedMultiplier;
    targetScore = getClosestRequirement(requirementScore);

    console.log("RequirementScore:", requirementScore, "TargetScore:", targetScore);
  }


  return {
    pattern,
    cards,
    jokers,
    score,
    targetScore
  };
}






function buildRoundQueue() {

  roundQueue = [];

  for (let i = 0; i < MAX_ROUNDS; i++) {
    roundQueue.push(generateRoundScenario());
  }

  // Randomize first (ensures tie randomness later)
  roundQueue = shuffle(roundQueue);

  // Stable sort ascending by targetScore
  roundQueue.sort((a, b) => a.targetScore - b.targetScore);
}

function reroll() {

  const container = document.getElementById("scenario-container");
  const jokerSlot = document.getElementById("joker-slot");

  container.innerHTML = "";
  jokerSlot.innerHTML = "";

  const tile1W = sheet1.width / SHEET_1_COLS;
  const tile1H = sheet1.height / SHEET_1_ROWS;
  const tile2W = sheet2.width / SHEET_2_COLS;
  const tile2H = sheet2.height / SHEET_2_ROWS;

  const jokerTileW = jokerSheet.width / JOKER_COLS;
  const jokerTileH = jokerSheet.height / JOKER_ROWS;

  // Pull scenario from queue
  const scenario = roundQueue[currentRound - 1];

  currentPattern = scenario.pattern;
  currentCards = scenario.cards;
  currentJokers = scenario.jokers;
  currentScore = scenario.score;
  currentTargetScore = scenario.targetScore;

  updateTargetDisplay();


  updateTargetDisplay();

  // ----- Render Cards -----

  // ----- Render Cards -----

  for (const top of currentCards) {

    const combo = document.createElement("div");
    combo.className = "combo";
    combo.style.width = `${tile1W}px`;
    combo.style.height = `${tile1H}px`;

    // Enhancement layer
    combo.appendChild(
      makeLayer(
        sheet1,
        top.enhancer.col - 1,
        top.enhancer.row - 1,
        tile1W,
        tile1H
      )
    );

    // Card face layer
    combo.appendChild(
      makeLayer(
        sheet2,
        top.col,
        top.row,
        tile2W,
        tile2H
      )
    );

    // ----- Red Seal Layer (on top of everything) -----
    if (top.seal === "red_seal") {

      combo.appendChild(
        makeLayer(
          sheet1,   // same sheet as enhancements
          5,        // 0-indexed col
          4,        // 0-indexed row
          tile1W,
          tile1H
        )
      );

    }

    container.appendChild(combo);
  }

    // ----- Render Jokers (Centered Horizontally) -----

    for (const joker of currentJokers) {

    const jokerDiv = document.createElement("div");

    jokerDiv.style.width = `${jokerTileW}px`;
    jokerDiv.style.height = `${jokerTileH}px`;
    jokerDiv.style.position = "relative";   // CRITICAL
    jokerDiv.style.display = "inline-block";

    if (joker.name === "triboulet") {

      // Background layer
      jokerDiv.appendChild(
        makeLayer(
          jokerSheet,
          joker.bgCol,
          joker.bgRow,
          jokerTileW,
          jokerTileH
        )
      );

      // Face layer (drawn on top)
      jokerDiv.appendChild(
        makeLayer(
          jokerSheet,
          joker.topCol,
          joker.topRow,
          jokerTileW,
          jokerTileH
        )
      );

    } else {

      jokerDiv.appendChild(
        makeLayer(
          jokerSheet,
          joker.col,
          joker.row,
          jokerTileW,
          jokerTileH
        )
      );

    }

    jokerSlot.appendChild(jokerDiv);
    }



  roundStartTime = performance.now();
}



/* =========================
   GAME LOGIC
========================= */

const status = document.getElementById("status");

function resolveGuess(guessYes) {
  setGuessButtonsEnabled(false);

  const hasMrBones = currentJokers.some(j => j.name === "mr_bones");
  const effectiveScoreForBeats = hasMrBones ? currentScore * 4 : currentScore;

  const beats = effectiveScoreForBeats >= currentTargetScore;
  const correct = guessYes === beats;

  const timeTakenMs = performance.now() - roundStartTime;
  const timeTakenSec = timeTakenMs / 1000;

  if (correct) {
    playRandomCorrectSound();

    const safeTime = Math.max(timeTakenSec, 1);
    const roundScore = 100 / safeTime;

    runScore += roundScore;
    corrects++;

    // Increment round
    currentRound++;
    // Check ambient thresholds
    ALMOST_THERE_SOUNDS.forEach(layer => {
      if (
        currentRound >= layer.threshold &&
        !activeAmbientLayers.has(layer.threshold) &&
        runScore > highestScore * (layer.threshold/20)
      ) {
        const audio = new Audio(layer.file);
        fadeInAudio(audio, layer.volume, layer.fadeIn);
        activeAmbientLayers.set(layer.threshold, audio);
      }
    });

    // Check win condition
    if (currentRound > MAX_ROUNDS) {
      if (runScore > highestScore) {
        highestScore = runScore;
      }

      // Stop ambient layers immediately
      stopAllAmbientLayers();

      // Show win text
      status.textContent = `Congratulations! Final Score: ${Math.floor(runScore)}`;

      // Play win sound
      const winAudio = new Audio("sounds/win.ogg");
      winAudio.play();

      // Update highest display immediately
      document.getElementById("highest-display").textContent =
        "Highest Score: " + Math.floor(highestScore);

      // Wait 3 seconds before resetting
      setTimeout(() => {

        runScore = 0;
        currentRound = 1;
        buildRoundQueue();

        document.getElementById("round-display").textContent =
          `Round: ${currentRound}/${MAX_ROUNDS}`;

        document.getElementById("run-display").textContent =
          "Run Score: 0";

        status.textContent = "";

        reroll();
        setGuessButtonsEnabled(true);

      }, 3000);

      return;

    }

  } else {
    wrongs++;
    playRandomWrongSound();
    
    // Update highest score if needed
    if (runScore > highestScore) {
      highestScore = runScore;
    }
    stopAllAmbientLayers();

    runScore = 0;
    currentRound = 1;
    buildRoundQueue();
  }

  let scoreText = `Score: ${Math.floor(currentScore)}`;
  if (hasMrBones && currentScore < currentTargetScore && beats) {
    scoreText += " (Saved by Mr. Bones!)";
  }

  status.textContent = scoreText;

  document.getElementById("run-display").textContent =
    "Run Score: " + Math.floor(runScore);

  document.getElementById("round-display").textContent =
    `Round: ${currentRound}/${MAX_ROUNDS}`;

  document.getElementById("highest-display").textContent =
    "Highest Score: " + Math.floor(highestScore);

  setTimeout(() => {
    status.textContent = "";
    reroll();
    setGuessButtonsEnabled(true);
  }, GUESS_COOLDOWN);
}




document.getElementById("yes").onclick=()=>resolveGuess(true);
document.getElementById("no").onclick=()=>resolveGuess(false);

/* =========================
   UI CONTROLS
========================= */
function buildControls() {
  const controls = document.getElementById("controls");
  if (!controls) return;
  controls.innerHTML = "";

  const cooldownHeader = document.createElement("h3");
  cooldownHeader.textContent = "Cooldown";
  controls.appendChild(cooldownHeader);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = 0;
  slider.max = 3000;
  slider.step = 50;
  slider.value = GUESS_COOLDOWN;

  slider.addEventListener("input", function () {
    GUESS_COOLDOWN = Number(this.value);
  });

  controls.appendChild(slider);
}
// --- Joker weights ---
function getJokerWeights() {
  return {
    onScoring: ON_SCORING_JOKERS.map(j => j.weight),
    afterScoring: JOKER_DEFS.map(j => j.weight),
    retrigger: RETRIGGER_JOKERS.map(j => j.weight),
    copy: COPY_JOKERS.map(j => j.weight),
    recognition: RECOGNITION_JOKERS.map(j => j.weight)
  };
}

// --- Enhancer weights ---
function getEnhancerWeights() {
  return ENHANCERS.map(e => e.weight);
}

// --- Seal weights ---
function getSealWeights() {
  return SEAL_CONFIG.map(s => s.weight);
}

// --- Hand pattern weights ---
function getPatternWeights() {
  return PATTERNS.map(p => p.weight);
}

// --- Combined: all weights in one object ---
function getAllWeights() {
  return {
    jokers: getJokerWeights(),
    enhancers: getEnhancerWeights(),
    seals: getSealWeights(),
    patterns: getPatternWeights()
  };
}

//debugging
async function autoBalanceTo50(iterations = 500, tolerance = 0.07, maxSteps = 10, onUpdate) {
  const originalSpawnRate = joker_spawn_rate;
  const originalMaxJokers = MAX_JOKERS;

  joker_spawn_rate = 1;
  console.log(getEnhancerWeights());
  const results = [];

  function simulateWinRate(candidateMultiplier) {
    let corrects = 0;

    for (let i = 0; i < iterations; i++) {
      // --- Pick pattern using current live weights ---
      const patternWeights = getPatternWeights();
      const pattern = pickPattern(patternWeights);
      let tops = pattern.gen();
      
      tops.sort((a, b) =>
        a.col !== b.col
          ? b.col - a.col
          : ROW_PRIORITY.indexOf(a.row) - ROW_PRIORITY.indexOf(b.row)
      );

      // --- Assign cards with live enhancers ---
      const enhancerWeights = getEnhancerWeights();
      const sealWeights = getSealWeights();
      const cards = tops.map(card => ({
        ...card,
        enhancer: randomEnhancer(enhancerWeights),
        seal: randomSeal(sealWeights)
      }));

      // --- Generate jokers with live weights ---
      const jokerWeights = getJokerWeights();
      const jokers = generateJokers(jokerWeights);

      const score = calculateScore(pattern, cards, jokers);
      const baseOnlyScore = calculateBase(pattern, cards);

      const requirementScore = baseOnlyScore * candidateMultiplier;
      const targetScore = getClosestRequirement(requirementScore);

      const hasMrBones = jokers.some(j => j.name === "mr_bones");
      const effectiveScore = hasMrBones ? score * 4 : score;

      if (effectiveScore >= targetScore) corrects++;
    }

    return corrects / iterations;
  }

  // --- use dynamic MAX_JOKERS from the input if it exists ---
  const dynamicMaxJokers = window.maxJokersInput
    ? parseInt(window.maxJokersInput.value)
    : 5;

  for (let max = 0; max <= dynamicMaxJokers; max++) {
    MAX_JOKERS = max;

    let low = 1;
    let high = 200;
    let mid = 15;
    let winRate = 1;

    for (let step = 0; step < maxSteps; step++) {
      mid = (low + high) / 2;
      winRate = simulateWinRate(mid);

      if (Math.abs(winRate - 0.5) <= tolerance) break;

      if (winRate > 0.5) {
        low = mid;
      } else {
        high = mid;
      }
    }

    results.push({ maxJokers: max, multiplier: mid, winRate });

    console.log(
      `MAX_JOKERS=${max} | MULT≈${mid.toFixed(4)} | WinRate=${(winRate*100).toFixed(2)}%`
    );

    if (onUpdate) {
      const input = baseScoringSection.querySelector(`input[data-joker='${max}']`);
      if (input) {
        input.value = mid.toFixed(6);
        MULTIPLIERS[max] = mid;
        window[`MULT_${max}`] = mid;
        console.log(`Updated MULT_${max} -> ${mid}`);

        // Trigger input event
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    // --- play the sound and wait a short moment to avoid overlap ---
    await playRandomCorrectSound();
    await new Promise(resolve => setTimeout(resolve, 80)); // 80ms breathing room
  }


  // restore original globals
  joker_spawn_rate = originalSpawnRate;
  MAX_JOKERS = originalMaxJokers;

  return results;
}




const customizeBtn = document.getElementById("customize-btn");
const customizePanel = document.getElementById("customize-panel");

// --- Top Notice ---
const notice = document.createElement("div");
notice.textContent = "Any changes apply in the next run";

notice.style.textAlign = "center";
notice.style.fontSize = "35px";
notice.style.fontWeight = "800";
notice.style.color = "white";
notice.style.margin = "35px 0 35px 0";
notice.style.letterSpacing = "1px";

customizePanel.prepend(notice);


function smoothScrollTo(targetY, duration = 600) {
  const startY = window.scrollY;
  const distance = targetY - startY;
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = progress * (2 - progress);

    window.scrollTo(0, startY + distance * ease);

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}

customizeBtn.addEventListener("click", () => {

  customizePanel.style.display = "block";

  const panelTop = customizePanel.getBoundingClientRect().top + window.scrollY;

  smoothScrollTo(panelTop, 600);
});

document.querySelectorAll(".section-header").forEach(header => {
  header.addEventListener("click", () => {

    const content = header.nextElementSibling;
    const chevron = header.querySelector(".chevron");

    const isOpen = content.style.maxHeight;

    if (isOpen) {
      content.style.maxHeight = null;
      chevron.style.transform = "rotate(0deg)";
    } else {
      content.style.maxHeight = content.scrollHeight + "px";
      chevron.style.transform = "rotate(90deg)";
    }

  });
});

const handSection = document.getElementById("hand-section-content");

function createWeightControls(title, sourceArray, labelKey = "label") {
  const group = document.createElement("div");
  group.className = "weight-group";

  const headerRow = document.createElement("div");
  headerRow.className = "weight-group-header";

  const header = document.createElement("h3");
  header.textContent = title;

  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Set all to 0";
  resetBtn.className = "weight-reset";

  resetBtn.addEventListener("click", () => {
    sourceArray.forEach(item => item.weight = 0);
    group.querySelectorAll("input").forEach(input => input.value = 0);
  });

  headerRow.append(header, resetBtn);
  group.appendChild(headerRow);

  const grid = document.createElement("div");
  grid.className = "weight-grid";

  sourceArray.forEach(item => {
    const row = document.createElement("div");
    row.className = "weight-item";

    const label = document.createElement("span");
    label.textContent = item[labelKey] ?? item.type ?? "None";

    const input = document.createElement("input");
    input.type = "number";
    input.min = 0;
    input.value = item.weight;

    input.addEventListener("input", () => {
      item.weight = Number(input.value);
    });

    row.append(label, input);
    grid.appendChild(row);
  });

  group.appendChild(grid);
  return group;
}


handSection.appendChild(
  createWeightControls("Hand Weights", PATTERNS, "label")
);

handSection.appendChild(
  createWeightControls("Enhancement Weights", ENHANCERS, "type")
);

handSection.appendChild(
  createWeightControls("Seal Weights", SEAL_CONFIG, "type")
);

window.addEventListener("resize", () => {
  document.querySelectorAll(".section-content").forEach(content => {
    if (content.style.maxHeight) {
      content.style.maxHeight = content.scrollHeight + "px";
    }
  });
});

const jokersSection = document.getElementById("jokers-section-content");

function createJokerSection(title, sourceArray) {
  const section = document.createElement("div");
  section.className = "joker-group";

  const headerRow = document.createElement("div");
  headerRow.className = "joker-group-header";

  const h3 = document.createElement("h3");
  h3.textContent = title;

  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Set all to 0";
  resetBtn.className = "weight-reset";

  resetBtn.addEventListener("click", () => {
    sourceArray.forEach(j => j.weight = 0);
    section.querySelectorAll("input").forEach(i => i.value = 0);
  });

  headerRow.append(h3, resetBtn);
  section.appendChild(headerRow);

  const grid = document.createElement("div");
  grid.className = "joker-grid";

  const jokerTileW = smallJokerSheet.width / JOKER_COLS;
  const jokerTileH = smallJokerSheet.height / JOKER_ROWS;

  sourceArray.forEach(joker => {
    const item = document.createElement("div");
    item.className = "joker-item";

    const spriteBox = document.createElement("div");
    spriteBox.className = "joker-sprite-box";

    if (joker.name === "triboulet") {

      // Background layer
      spriteBox.appendChild(
        makeLayer(
          smallJokerSheet,
          joker.bgCol,
          joker.bgRow,
          jokerTileW,
          jokerTileH
        )
      );

      // Face layer on top
      spriteBox.appendChild(
        makeLayer(
          smallJokerSheet,
          joker.topCol,
          joker.topRow,
          jokerTileW,
          jokerTileH
        )
      );

    } else {

      spriteBox.appendChild(
        makeLayer(
          smallJokerSheet,
          joker.col,
          joker.row,
          jokerTileW,
          jokerTileH
        )
      );

    }

    const input = document.createElement("input");
    input.type = "number";
    input.min = 0;
    input.value = joker.weight;

    input.addEventListener("input", () => {
      joker.weight = Number(input.value);
    });

    item.append(spriteBox, input);
    grid.appendChild(item);
  });




  section.appendChild(grid);
  return section;
}
const maxJokersInput = document.createElement("input");
maxJokersInput.type = "number";
maxJokersInput.min = "0";
maxJokersInput.value = MAX_JOKERS;
maxJokersInput.oninput = e => { MAX_JOKERS = parseInt(e.target.value); };
window.maxJokersInput = maxJokersInput; // make it accessible outside
jokerSheet.onload = () => {
  // Joker Slots + Joker Spawn Rate section
  const slotsWrapper = document.createElement("div");
  slotsWrapper.className = "joker-slots-section";

  // Joker Slots input
  const maxJokersContainer = document.createElement("div");
  maxJokersContainer.className = "slot-input-container";
  const maxJokersLabel = document.createElement("label");
  maxJokersLabel.textContent = "Joker Slots";


  maxJokersContainer.appendChild(maxJokersLabel);
  maxJokersContainer.appendChild(maxJokersInput);

  // Joker Spawn Rate input
  const spawnRateContainer = document.createElement("div");
  spawnRateContainer.className = "slot-input-container";
  const spawnRateLabel = document.createElement("label");
  spawnRateLabel.textContent = "Joker Spawn Rate";
  const spawnRateInput = document.createElement("input");
  spawnRateInput.type = "number";
  spawnRateInput.min = 0;
  spawnRateInput.max = 1;
  spawnRateInput.step = 0.01; // or smaller if you want
  spawnRateInput.value = joker_spawn_rate;
  spawnRateInput.oninput = e => { 
      joker_spawn_rate = parseFloat(e.target.value); 
  };

  window.spawnRateInput = spawnRateInput; // <-- make it accessible for import

  spawnRateContainer.appendChild(spawnRateLabel);
  spawnRateContainer.appendChild(spawnRateInput);

  slotsWrapper.appendChild(maxJokersContainer);
  slotsWrapper.appendChild(spawnRateContainer);

  jokersSection.insertBefore(slotsWrapper, jokersSection.firstChild);



  // --- Render existing joker sections below ---
  jokersSection.appendChild(
    createJokerSection("On Scoring Jokers", ON_SCORING_JOKERS)
  );

  jokersSection.appendChild(
    createJokerSection("After Scoring Jokers", JOKER_DEFS)
  );

  jokersSection.appendChild(
    createJokerSection("Retrigger Jokers", RETRIGGER_JOKERS)
  );

  jokersSection.appendChild(
    createJokerSection("Copy Jokers", COPY_JOKERS)
  );

  jokersSection.appendChild(
    createJokerSection("Recognition Jokers", RECOGNITION_JOKERS)
  );
};

// Assume MULT_X and MAX_JOKERS already exist
const MULTIPLIERS = {
  0: MULT_0,
  1: MULT_1,
  2: MULT_2,
  3: MULT_3,
  4: MULT_4,
  5: MULT_5,
  6: MULT_6,
  7: MULT_7,
  8: MULT_8,
  9: MULT_9,
  10: MULT_10
};

// Scoring Requirement section
const scoringPanel = document.getElementById("scoring-panel");

// Base Scoring Requirement Multiplier section
// Base Scoring Requirement Multiplier section
const baseScoringSection = document.createElement("div");
baseScoringSection.className = "weight-group";

// --- Hard Mode Toggle ---
const hardModeContainer = document.createElement("div");
hardModeContainer.className = "hard-mode-toggle";

const hardModeLabel = document.createElement("label");
hardModeLabel.textContent = "Hard Mode";
hardModeLabel.htmlFor = "hardModeInput";

const hardModeInput = document.createElement("input");
hardModeInput.type = "checkbox";
hardModeInput.id = "hardModeInput";
hardModeInput.checked = HardMode;

hardModeInput.onchange = () => {
  HardMode = hardModeInput.checked;
  console.log("HardMode set to", HardMode);
};

hardModeContainer.append(hardModeLabel, hardModeInput);

// append above the base scoring section
scoringPanel.appendChild(hardModeContainer);
scoringPanel.appendChild(baseScoringSection);

function renderScoringInputs() {
  console.log("Rendering inputs for MAX_JOKERS =", MAX_JOKERS);
  baseScoringSection.innerHTML = "";

  const headerRow = document.createElement("div");
  headerRow.className = "weight-group-header";

  const header = document.createElement("h3");
  header.textContent = "Base Scoring Requirement Multiplier (Non-Hard Mode Only)";

  // --- Fine Tune button ---
  const fineTuneBtn = document.createElement("button");
  fineTuneBtn.textContent = "Fine Tune";
  fineTuneBtn.className = "weight-reset"; // keep same styling

  fineTuneBtn.onclick = async () => {
    console.log("Fine Tune started...");

    // Change button text to indicate it's working
    const originalText = fineTuneBtn.textContent;
    fineTuneBtn.textContent = "Fine Tuning...";
    fineTuneBtn.disabled = true; // prevent multiple clicks

    await autoBalanceTo50(500, 0.07, 10, async (maxJ, mult) => {
      const input = baseScoringSection.querySelector(`input[data-joker='${maxJ}']`);
      if (input) {
        input.value = mult.toFixed(6);
        MULTIPLIERS[maxJ] = mult;
        window[`MULT_${maxJ}`] = mult;
      }
    });

    // Restore original button text and re-enable
    fineTuneBtn.textContent = originalText;
    fineTuneBtn.disabled = false;

    console.log("Fine Tune complete.");
  };


  headerRow.append(header, fineTuneBtn);
  baseScoringSection.appendChild(headerRow);

  const grid = document.createElement("div");
  grid.className = "weight-grid";

  for (let i = 0; i <= MAX_JOKERS; i++) {
    console.log("Creating input for Joker", i);
    const row = document.createElement("div");
    row.className = "weight-item";

    const label = document.createElement("span");
    label.textContent = `${i} Joker${i !== 1 ? "s" : ""}`;

    const input = document.createElement("input");
    input.type = "number";
    input.step = 0.0001;
    input.value = MULTIPLIERS[i];        // keeps the dynamic Fine Tune behavior
    input.dataset.joker = i;

    input.oninput = () => {
      const val = parseFloat(input.value);
      console.log(`Input changed for MULT_${i} ->`, val);
      MULTIPLIERS[i] = val;               // for Fine Tune live updates
      window[`MULT_${i}`] = val;          // sync to globals for generateRoundScenario
    };

    row.append(label, input);
    grid.appendChild(row);
  }

  baseScoringSection.appendChild(grid);
}


// Initial render
renderScoringInputs();

// --- REUSE EXISTING MAX_JOKERS INPUT ---
if (window.maxJokersInput) {
    window.maxJokersInput.oninput = e => {
        MAX_JOKERS = parseInt(e.target.value) || 0;
        console.log("MAX_JOKERS changed ->", MAX_JOKERS);
        renderScoringInputs();
    };
} else {
    console.warn("maxJokersInput not found, dynamic update disabled");
}
// --- Fixed Scoring Requirement Section ---
const fixedScoringSection = document.createElement("div");
fixedScoringSection.className = "fixed-scoring-section";

const fixedToggleContainer = document.createElement("div");
fixedToggleContainer.className = "fixed-scoring-toggle";

const fixedLabel = document.createElement("label");
fixedLabel.textContent = "Fixed Scoring Requirement";
fixedLabel.htmlFor = "fixedScoringInput";

const fixedCheckbox = document.createElement("input");
fixedCheckbox.type = "checkbox";
fixedCheckbox.id = "fixedScoringInput";
fixedCheckbox.checked = FixedScoringEnabled;

const fixedValueInput = document.createElement("input");
fixedValueInput.type = "number";
fixedValueInput.step = 1;
fixedValueInput.value = FixedScoringValue;
fixedValueInput.style.display = "none"; // hidden by default
fixedValueInput.min = "0";

fixedCheckbox.onchange = () => {
  FixedScoringEnabled = fixedCheckbox.checked;
  fixedValueInput.style.display = FixedScoringEnabled ? "inline-block" : "none";
  console.log("FixedScoringEnabled =", FixedScoringEnabled);
};

fixedValueInput.oninput = () => {
  FixedScoringValue = parseInt(fixedValueInput.value) || 0;
  console.log("FixedScoringValue =", FixedScoringValue);
};

fixedToggleContainer.append(fixedLabel, fixedCheckbox, fixedValueInput);
fixedScoringSection.appendChild(fixedToggleContainer);

// append below base scoring section
scoringPanel.appendChild(fixedScoringSection);

// --- Update Hard Mode toggle logic ---
const hardModeCheckbox = document.getElementById("hardModeInput"); // your existing Hard Mode checkbox
hardModeCheckbox.onchange = () => {
  HardMode = hardModeCheckbox.checked;
  console.log("HardMode =", HardMode);

  // if Hard Mode enabled, disable Fixed Scoring
  if (HardMode) {
    FixedScoringEnabled = false;
    fixedCheckbox.checked = false;
    fixedValueInput.style.display = "none";
    console.log("FixedScoring disabled due to Hard Mode");
  }
};

// --- Update Fixed Scoring toggle logic ---
fixedCheckbox.onchange = () => {
  FixedScoringEnabled = fixedCheckbox.checked;
  fixedValueInput.style.display = FixedScoringEnabled ? "inline-block" : "none";
  console.log("FixedScoringEnabled =", FixedScoringEnabled);

  // if Fixed Scoring enabled, disable Hard Mode
  if (FixedScoringEnabled) {
    HardMode = false;
    hardModeCheckbox.checked = false;
    console.log("HardMode disabled due to Fixed Scoring");
  }
};

// --- Manage Presets Section ---
const managePresetsSection = document.getElementById("manage-presets-content");

if (managePresetsSection) {
  // --- Export / Import / Save Controls Container ---
  const exportContainer = document.createElement("div");
  exportContainer.className = "preset-export-container";
  exportContainer.style.display = "flex";
  exportContainer.style.alignItems = "center";
  exportContainer.style.gap = "8px";

  // --- Name Label + Textbox ---
  const nameLabel = document.createElement("span");
  nameLabel.textContent = "Name:";
  nameLabel.style.color = "white";          // make text white
  nameLabel.style.fontWeight = "500";        // bold
  nameLabel.style.fontSize = "24px";         // optional: match other labels


  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Preset Name";
  nameInput.style.padding = "6px";
  nameInput.style.borderRadius = "8px";
  nameInput.style.border = "1px solid rgba(255,255,255,0.15)";
  nameInput.style.background = "rgba(255,255,255,0.08)";
  nameInput.style.color = "white";
  nameInput.style.textAlign = "center";

  exportContainer.appendChild(nameLabel);
  exportContainer.appendChild(nameInput);

  // --- Save Preset Button ---
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save Preset";
  saveBtn.className = "set-all-btn";
  saveBtn.onclick = () => {
    const presetName = nameInput.value.trim();
    if (!presetName) {
      playFailSound();
      alert("Please enter a preset name.");
      return;
    }

    const presetData = gatherPresetData();
    addPresetTile(presetName, presetData);
    savePresetToStorage(presetName, presetData);
    playButtonSound();
    console.log("Preset saved:", presetName, presetData);
  };
  exportContainer.appendChild(saveBtn);

  // --- Export Preset Button ---
  const exportBtn = document.createElement("button");
  exportBtn.textContent = "Export Preset";
  exportBtn.className = "set-all-btn";
  exportBtn.onclick = () => {
    const presetData = gatherPresetData();
    const jsonStr = JSON.stringify(presetData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (nameInput.value.trim() || "preset") + ".json";
    a.click();
    URL.revokeObjectURL(url);
    console.log("Preset exported:", presetData);
  };
  exportContainer.appendChild(exportBtn);

  // --- Import Preset Button ---
  const importBtn = document.createElement("button");
  importBtn.textContent = "Import Preset";
  importBtn.className = "set-all-btn";
  importBtn.style.marginLeft = "auto"; // push to far right
  importBtn.onclick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;

      const text = await file.text();
      const data = JSON.parse(text);
      console.log("Imported preset:", data);

      applyPresetData(data);

      const name = file.name.replace(/\.json$/i, "");
      addPresetTile(name, data);
      savePresetToStorage(name, data);
    };
    input.click();
  };
  exportContainer.appendChild(importBtn);

  managePresetsSection.prepend(exportContainer);

  // --- Preset Tiles Container ---
  const presetsContainer = document.createElement("div");
  presetsContainer.className = "preset-tiles-container";
  managePresetsSection.appendChild(presetsContainer);

  // Add default preset tiles
  const presetNames = ["Default", "Round 1"];
  presetNames.forEach(name => addPresetTile(name, null));

  // --- Load saved presets from localStorage ---
  const storedPresets = JSON.parse(localStorage.getItem("userPresets") || "{}");
  Object.entries(storedPresets).forEach(([name, data]) => {
    addPresetTile(name, data);
  });

  // --- Save preset to localStorage ---
  function savePresetToStorage(name, data) {
    const userPresets = JSON.parse(localStorage.getItem("userPresets") || "{}");
    userPresets[name] = data; // overwrite if exists
    localStorage.setItem("userPresets", JSON.stringify(userPresets));
  }

  // --- Function to add a preset tile ---
  function addPresetTile(name, data) {
    const existingTile = Array.from(presetsContainer.children).find(
      t => t.querySelector("span")?.textContent === name
    );
    if (existingTile) presetsContainer.removeChild(existingTile);

    const tile = document.createElement("div");
    tile.className = "preset-tile";
    tile.style.position = "relative";
    tile.style.width = "158px";
    tile.style.height = "120px";
    tile.style.display = "flex";
    tile.style.flexDirection = "column";
    tile.style.alignItems = "center";
    tile.style.justifyContent = "center";
    tile.style.padding = "12px";
    tile.style.boxSizing = "border-box";

    // Trash icon
    const trash = document.createElement("img");
    trash.src = "textures/trashtag.png";
    trash.style.width = "40px";
    trash.style.height = "40px";
    trash.style.position = "absolute";
    trash.style.top = "6px";
    trash.style.left = "6px";
    trash.style.cursor = "pointer";
    trash.title = "Delete Preset";
    trash.onclick = () => {
      playFailSound();
      presetsContainer.removeChild(tile);
      const userPresets = JSON.parse(localStorage.getItem("userPresets") || "{}");
      delete userPresets[name];
      localStorage.setItem("userPresets", JSON.stringify(userPresets));
    };
    tile.appendChild(trash);

    // --- Load Button ---
    const loadBtn = document.createElement("button");
    loadBtn.className = "preset-load-btn";
    loadBtn.textContent = "Load";
    loadBtn.style.fontSize = "16px"; // scale up
    loadBtn.style.padding = "6px 12px"; // scale padding

    loadBtn.onclick = async () => {
      playButtonSound(); // <-- make sure this plays the button sound
      highestScore = 0;
      if (data) {
        applyPresetData(data);
      } else {
        try {
          const response = await fetch(`presets/${name}.json`);
          const fetchedData = await response.json();
          applyPresetData(fetchedData);
        } catch (err) {
          console.error(`Failed to load preset ${name}:`, err);
          playFailSound();
        }
      }
    };

    tile.appendChild(loadBtn);

    // Name label
    const label = document.createElement("span");
    label.textContent = name;
    label.style.fontSize = "24px";
    label.style.marginTop = "8px";
    tile.appendChild(label);

    presetsContainer.appendChild(tile);
  }

  // --- Function to apply preset data ---
  function applyPresetData(data) {
    if (!data) return;

    // Hand weights
    if (Array.isArray(data.handWeights)) {
      const handInputs = document.querySelectorAll("#hand-section-content input");
      data.handWeights.forEach((p, idx) => {
        PATTERNS[idx].weight = p.weight;
        const input = handInputs[idx];
        if (input) input.value = p.weight;
      });
    }

    // Enhancers
    if (Array.isArray(data.enhancerWeights)) {
      const enhancerInputs = document.querySelectorAll("#hand-section-content .weight-group:nth-child(2) input");
      data.enhancerWeights.forEach((e, idx) => {
        ENHANCERS[idx].weight = e.weight;
        const input = enhancerInputs[idx];
        if (input) input.value = e.weight;
      });
    }

    // Seals
    if (Array.isArray(data.sealWeights)) {
      const sealInputs = document.querySelectorAll("#hand-section-content .weight-group:nth-child(3) input");
      data.sealWeights.forEach((s, idx) => {
        SEAL_CONFIG[idx].weight = s.weight;
        const input = sealInputs[idx];
        if (input) input.value = s.weight;
      });
    }


    // Joker weights
    if (data.jokerWeights) {
      const sections = [
        ON_SCORING_JOKERS,
        JOKER_DEFS,
        RETRIGGER_JOKERS,
        COPY_JOKERS,
        RECOGNITION_JOKERS
      ];
      const keys = ["onScoring","afterScoring","retrigger","copy","recognition"];

      keys.forEach((key, idx) => {
        if (Array.isArray(data.jokerWeights[key])) {
          data.jokerWeights[key].forEach((j, jdx) => {
            sections[idx][jdx].weight = j.weight;
            const sectionDiv = document.querySelectorAll("#jokers-section-content .joker-group")[idx];
            if (sectionDiv) {
              const input = sectionDiv.querySelectorAll("input")[jdx];
              if (input) input.value = j.weight;
            }
          });
        }
      });
    }

    // Max jokers
    if (typeof data.maxJokers === "number") {
      MAX_JOKERS = data.maxJokers;
      if (window.maxJokersInput) window.maxJokersInput.value = MAX_JOKERS;
      renderScoringInputs();
    }

    // Joker spawn rate
    if (typeof data.jokerSpawnRate === "number") {
      joker_spawn_rate = data.jokerSpawnRate;
      if (window.spawnRateInput) window.spawnRateInput.value = joker_spawn_rate;
    }

    // Scoring requirement
    if (data.scoringRequirement === "hard") {
      HardMode = true;
      if (hardModeCheckbox) hardModeCheckbox.checked = true;
      FixedScoringEnabled = false;
      if (fixedCheckbox) {
        fixedCheckbox.checked = false;
        fixedValueInput.style.display = "none";
      }
    } else if (data.scoringRequirement === "fixed") {
      HardMode = false;
      if (hardModeCheckbox) hardModeCheckbox.checked = false;
      FixedScoringEnabled = true;
      if (fixedCheckbox) {
        fixedCheckbox.checked = true;
        fixedValueInput.style.display = "inline-block";
      }
      if (typeof data.fixedScore === "number") {
        FixedScoringValue = data.fixedScore;
        if (fixedValueInput) fixedValueInput.value = FixedScoringValue;
      }
    } else {
      // multiplier
      HardMode = false;
      if (hardModeCheckbox) hardModeCheckbox.checked = false;
      FixedScoringEnabled = false;
      if (fixedCheckbox) {
        fixedCheckbox.checked = false;
        fixedValueInput.style.display = "none";
      }
      if (data.multipliers) {
        Object.keys(data.multipliers).forEach(k => {
          const val = data.multipliers[k];
          MULTIPLIERS[k] = val;
          window[`MULT_${k}`] = val;
          const input = baseScoringSection.querySelector(`input[data-joker='${k}']`);
          if (input) input.value = val;
        });
      }
    }

    console.log("Preset applied successfully:", data);
  }


  // --- Gather preset data ---
  function gatherPresetData() {
    return {
      handWeights: PATTERNS.map(p => ({ label: p.label, weight: p.weight })),
      enhancerWeights: ENHANCERS.map(e => ({ type: e.type, weight: e.weight })),
      sealWeights: SEAL_CONFIG.map(s => ({ type: s.type, weight: s.weight })),
      jokerWeights: {
        onScoring: ON_SCORING_JOKERS.map(j => ({ name: j.name, weight: j.weight })),
        afterScoring: JOKER_DEFS.map(j => ({ name: j.name, weight: j.weight })),
        retrigger: RETRIGGER_JOKERS.map(j => ({ name: j.name, weight: j.weight })),
        copy: COPY_JOKERS.map(j => ({ name: j.name, weight: j.weight })),
        recognition: RECOGNITION_JOKERS.map(j => ({ name: j.name, weight: j.weight }))
      },
      maxJokers: MAX_JOKERS,
      jokerSpawnRate: joker_spawn_rate,
      scoringRequirement: HardMode
        ? "hard"
        : FixedScoringEnabled
        ? "fixed"
        : "multiplier",
      multipliers: Object.fromEntries(
        Object.keys(MULTIPLIERS).map(k => [k, MULTIPLIERS[k]])
      ),
      fixedScore: FixedScoringValue
    };
  }
}


document.querySelectorAll(".customize-section .section-header").forEach(header => {
  header.addEventListener("click", () => {
    playButtonSound();
  });
});
document.querySelectorAll("input[type='checkbox']").forEach(cb => {
  cb.addEventListener("change", () => {
    playButtonSound();
  });
});
document.querySelectorAll(".weight-reset, .fine-tune-btn, .set-all-btn, .preset-load-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    playButtonSound();
  });
});





