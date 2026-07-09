const BOARD = { rows: 5, cols: 5, mines: 5 };

const FACES = {
  idle: "🙂",
  worried: "😮",
  win: "😎",
  lose: "😵",
};

const SAFE_EMOJIS = ["😂", "😍", "😉"];
const UNSAFE_EMOJI = "😭";
const PEEK_DURATION_MS = 700;
const PEEK_LIMIT = 3;
const WIN_FLASH_DURATION_MS = 900;
const DOUBLE_TAP_MS = 350;
const LONG_PRESS_MS = 500;

// --- Custom audio (optional) ---
// 1. Gumawa ng folder: audio/
// 2. Ilagay ang files mo, hal: win.mp3 at lose.mp3
// 3. I-update ang paths sa baba. Set to null para sa built-in music lang.
const AUDIO = {
  win: "audio/win.mp3",
  lose: "audio/lose.mp3",
  volume: 4.0, // boost multiplier (1 = normal, 2–4 = mas malakas)
};

function getSafeEmoji(adjacentMines) {
  return SAFE_EMOJIS[(adjacentMines - 1) % SAFE_EMOJIS.length];
}

const boardEl = document.getElementById("board");
const mineCounterEl = document.getElementById("mine-counter");
const peekCounterEl = document.getElementById("peek-counter");
const timerEl = document.getElementById("timer");
const faceBtn = document.getElementById("face-btn");
const messageEl = document.getElementById("message");
const newGameBtn = document.getElementById("new-game");
const boomOverlay = document.getElementById("boom-overlay");
const boomRetryBtn = document.getElementById("boom-retry");
const winOverlay = document.getElementById("win-overlay");
const fireworksCanvas = document.getElementById("fireworks-canvas");
const winWhiteFlash = document.getElementById("win-white-flash");
const winBanner = document.querySelector(".win-banner");

const FIREWORK_COLORS = [
  "#ff0000", "#ff8800", "#ffff00", "#00ff55",
  "#0088ff", "#4400ff", "#aa00ff", "#ff69b4", "#ffffff", "#ffd700",
];

let fireworksCtx = null;
let fireworksAnimId = null;
let fireworksParticles = [];
let fireworksRockets = [];
let fireworksResizeHandler = null;

let rows = 5;
let cols = 5;
let mineCount = 5;
let grid = [];
let revealedCount = 0;
let flaggedCount = 0;
let gameOver = false;
let gameWon = false;
let firstClick = true;
let timerInterval = null;
let elapsedSeconds = 0;
let isPeeking = false;
let peekTimeout = null;
let peekCount = PEEK_LIMIT;
let winFlashTimeout = null;
let fireworksBlinding = false;
let lastTap = null;
let singleTapTimer = null;
let longPressTimer = null;
let suppressNextTap = false;

let audioCtx = null;
let musicMasterGain = null;
let musicLoopTimeout = null;
let musicDrone = null;
let activeMusicType = null;
let winAudioEl = null;
let loseAudioEl = null;
let customAudioGain = null;

const WIN_MELODY = [
  { freq: 523.25, dur: 0.12, type: "triangle", vol: 0.2 },
  { freq: 659.25, dur: 0.12, type: "triangle", vol: 0.2 },
  { freq: 783.99, dur: 0.12, type: "triangle", vol: 0.2 },
  { freq: 1046.5, dur: 0.28, type: "sine", vol: 0.24 },
  { freq: 987.77, dur: 0.12, type: "triangle", vol: 0.18 },
  { freq: 1174.66, dur: 0.12, type: "triangle", vol: 0.18 },
  { freq: 1318.51, dur: 0.35, type: "sine", vol: 0.26 },
  { freq: 1046.5, dur: 0.12, type: "triangle", vol: 0.16 },
  { freq: 1318.51, dur: 0.4, type: "sine", vol: 0.22 },
];

const LOSE_MELODY = [
  { freq: 146.83, dur: 0.45, type: "sawtooth", vol: 0.14 },
  { freq: 130.81, dur: 0.45, type: "sawtooth", vol: 0.14 },
  { freq: 116.54, dur: 0.5, type: "sawtooth", vol: 0.15 },
  { freq: 97.99, dur: 0.55, type: "square", vol: 0.12 },
  { freq: 87.31, dur: 0.6, type: "square", vol: 0.12 },
  { freq: 73.42, dur: 0.7, type: "sawtooth", vol: 0.1 },
];

function initCustomAudio() {
  if (AUDIO.win) {
    winAudioEl = new Audio(AUDIO.win);
    winAudioEl.loop = true;
    winAudioEl.volume = 1;
    winAudioEl.preload = "auto";
  }

  if (AUDIO.lose) {
    loseAudioEl = new Audio(AUDIO.lose);
    loseAudioEl.loop = true;
    loseAudioEl.volume = 1;
    loseAudioEl.preload = "auto";
  }
}

function connectCustomAudioElement(el) {
  if (!el || el._audioBoostConnected) return;

  initBuiltInAudio();

  if (!customAudioGain) {
    customAudioGain = audioCtx.createGain();
    customAudioGain.connect(audioCtx.destination);
  }

  customAudioGain.gain.value = AUDIO.volume;
  const source = audioCtx.createMediaElementSource(el);
  source.connect(customAudioGain);
  el._audioBoostConnected = true;
}

function stopCustomAudio() {
  [winAudioEl, loseAudioEl].forEach((el) => {
    if (!el) return;
    el.pause();
    el.currentTime = 0;
  });
}

async function playCustomAudio(type) {
  const el = type === "win" ? winAudioEl : loseAudioEl;
  if (!el) return false;

  try {
    await ensureAudioReady();
    connectCustomAudioElement(el);
    if (customAudioGain) {
      customAudioGain.gain.value = AUDIO.volume;
    }
    el.currentTime = 0;
    await el.play();
    activeMusicType = `${type}-file`;
    return true;
  } catch {
    return false;
  }
}
function initBuiltInAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  musicMasterGain = audioCtx.createGain();
  musicMasterGain.gain.value = 0.2;
  musicMasterGain.connect(audioCtx.destination);
}

async function ensureAudioReady() {
  initBuiltInAudio();
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
}

function unlockAudio() {
  ensureAudioReady();
}

function playMusicNote(freq, duration, type = "sine", volume = 0.2) {
  if (!audioCtx || !musicMasterGain || activeMusicType === null) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const now = audioCtx.currentTime;

  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(musicMasterGain);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function playMelodyLoop(melody) {
  let step = 0;

  const playStep = () => {
    if (activeMusicType === null) return;

    const note = melody[step % melody.length];
    playMusicNote(note.freq, note.dur, note.type || "sine", note.vol || 0.2);

    if (activeMusicType === "win" && step % 2 === 0) {
      playMusicNote(note.freq / 2, note.dur * 1.1, "sine", (note.vol || 0.2) * 0.35);
    }

    step += 1;
    musicLoopTimeout = setTimeout(playStep, (note.dur + 0.04) * 1000);
  };

  playStep();
}

function startMusicDrone(freq, type, volume) {
  if (!audioCtx || !musicMasterGain) return;

  stopMusicDrone();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(musicMasterGain);
  osc.start();
  musicDrone = { osc, gain };
}

function stopMusicDrone() {
  if (!musicDrone) return;
  try {
    musicDrone.osc.stop();
    musicDrone.osc.disconnect();
    musicDrone.gain.disconnect();
  } catch {
    // already stopped
  }
  musicDrone = null;
}

function stopGameMusic() {
  activeMusicType = null;
  clearTimeout(musicLoopTimeout);
  musicLoopTimeout = null;
  stopMusicDrone();
  stopCustomAudio();
}

function playBuiltInWinMusic() {
  ensureAudioReady().then(() => {
    activeMusicType = "win";
    musicMasterGain.gain.value = 0.22;
    playMelodyLoop(WIN_MELODY);
  });
}

function playBuiltInLoseMusic() {
  ensureAudioReady().then(() => {
    activeMusicType = "lose";
    musicMasterGain.gain.value = 0.45;
    startMusicDrone(55, "sine", 0.14);
    playMelodyLoop(LOSE_MELODY);
  });
}

async function playWinMusic() {
  stopGameMusic();
  const played = await playCustomAudio("win");
  if (!played) playBuiltInWinMusic();
}

async function playLoseMusic() {
  stopGameMusic();
  const played = await playCustomAudio("lose");
  if (!played) playBuiltInLoseMusic();
}

function init() {
  initCustomAudio();
  newGameBtn.addEventListener("click", startNewGame);
  faceBtn.addEventListener("click", startNewGame);
  boomRetryBtn.addEventListener("click", startNewGame);
  document.addEventListener("click", unlockAudio, { once: true });
  document.addEventListener("contextmenu", unlockAudio, { once: true });
  startNewGame();
}

function startNewGame() {
  rows = BOARD.rows;
  cols = BOARD.cols;
  mineCount = BOARD.mines;
  grid = [];
  revealedCount = 0;
  flaggedCount = 0;
  gameOver = false;
  gameWon = false;
  firstClick = true;
  peekCount = PEEK_LIMIT;
  elapsedSeconds = 0;
  stopTimer();
  updateTimerDisplay();
  updateMineCounter();
  updatePeekCounter();
  setFace(FACES.idle);
  hideMessage();
  hideBoomPopup();
  hideWinFireworks();
  stopGameMusic();
  cancelPeek();
  clearTouchTimers();
  buildBoard();
  renderBoard();
}

function buildBoard() {
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      grid[r][c] = {
        isMine: false,
        adjacentMines: 0,
        revealed: false,
        flagged: false,
      };
    }
  }
}

function placeMines(safeRow, safeCol) {
  let placed = 0;
  while (placed < mineCount) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (grid[r][c].isMine) continue;
    if (Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1) continue;
    grid[r][c].isMine = true;
    placed++;
  }
  calculateAdjacentMines();
}

function calculateAdjacentMines() {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].isMine) continue;
      let count = 0;
      forEachNeighbor(r, c, (nr, nc) => {
        if (grid[nr][nc].isMine) count++;
      });
      grid[r][c].adjacentMines = count;
    }
  }
}

function forEachNeighbor(row, col, callback) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        callback(nr, nc);
      }
    }
  }
}

function renderBoard() {
  const cellSize = getComputedStyle(document.documentElement)
    .getPropertyValue("--cell-size")
    .trim();
  boardEl.style.gridTemplateColumns = `repeat(${cols}, ${cellSize})`;
  boardEl.innerHTML = "";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.setAttribute("aria-label", `Cell row ${r + 1} column ${c + 1}`);
      cell.addEventListener("click", onCellClick);
      cell.addEventListener("contextmenu", onCellContextMenu);
      cell.addEventListener("mousedown", onCellMouseDown);
      cell.addEventListener("mouseup", onCellMouseUp);
      cell.addEventListener("touchstart", onCellTouchStart, { passive: true });
      cell.addEventListener("touchend", onCellTouchEnd);
      cell.addEventListener("touchmove", onCellTouchMove, { passive: true });
      cell.addEventListener("touchcancel", onCellTouchCancel);
      boardEl.appendChild(cell);
    }
  }
}

function getCellEl(row, col) {
  return boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
}

function isTouchDevice() {
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function clearTouchTimers() {
  clearTimeout(singleTapTimer);
  clearTimeout(longPressTimer);
  singleTapTimer = null;
  longPressTimer = null;
  lastTap = null;
  suppressNextTap = false;
}

function onCellClick(event) {
  if (isTouchDevice()) return;

  event.preventDefault();
  const row = Number(event.currentTarget.dataset.row);
  const col = Number(event.currentTarget.dataset.col);
  revealCell(row, col);
}

function onCellTouchStart(event) {
  if (!isTouchDevice()) return;

  const row = Number(event.currentTarget.dataset.row);
  const col = Number(event.currentTarget.dataset.col);

  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    suppressNextTap = true;
    clearTimeout(singleTapTimer);
    singleTapTimer = null;
    lastTap = null;

    if (gameOver || gameWon || isPeeking) return;

    ensureMinesPlaced(row, col);
    toggleFlag(row, col);
  }, LONG_PRESS_MS);
}

function onCellTouchMove() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function onCellTouchCancel() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function onCellTouchEnd(event) {
  if (!isTouchDevice()) return;

  const row = Number(event.currentTarget.dataset.row);
  const col = Number(event.currentTarget.dataset.col);

  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  if (suppressNextTap) {
    suppressNextTap = false;
    return;
  }

  if (gameOver || gameWon || isPeeking) return;

  const now = Date.now();
  const cellKey = `${row},${col}`;

  if (lastTap?.key === cellKey && now - lastTap.time < DOUBLE_TAP_MS) {
    clearTimeout(singleTapTimer);
    singleTapTimer = null;
    lastTap = null;
    requestPeek(row, col);
    return;
  }

  lastTap = { key: cellKey, time: now };
  singleTapTimer = setTimeout(() => {
    singleTapTimer = null;
    lastTap = null;
    revealCell(row, col);
  }, DOUBLE_TAP_MS);
}

function onCellContextMenu(event) {
  event.preventDefault();
}

function onCellMouseDown(event) {
  if (event.button === 2) {
    event.preventDefault();
    handleRightClick(event);
    return;
  }

  if (event.button === 0 && !gameOver && !gameWon) {
    setFace(FACES.worried);
  }
}

function onCellMouseUp(event) {
  if (event.button === 0 && !gameOver && !gameWon) {
    setFace(FACES.idle);
  }
}

function ensureMinesPlaced(safeRow, safeCol) {
  if (!firstClick) return;
  firstClick = false;
  placeMines(safeRow, safeCol);
  startTimer();
}

function handleRightClick(event) {
  const row = Number(event.currentTarget.dataset.row);
  const col = Number(event.currentTarget.dataset.col);

  if (gameOver || gameWon || isPeeking) return;

  ensureMinesPlaced(row, col);

  if (event.shiftKey) {
    toggleFlag(row, col);
    return;
  }

  requestPeek(row, col);
}

function requestPeek(row, col) {
  if (gameOver || gameWon || isPeeking) return;

  ensureMinesPlaced(row, col);

  if (peekCount <= 0) {
    showMessage(`Walang peek na natira! (${PEEK_LIMIT}/${PEEK_LIMIT} nagamit na)`, "info");
    return;
  }

  peekBombs();
}

function peekBombs() {
  if (isPeeking || peekCount <= 0) return;

  peekCount--;
  updatePeekCounter();
  hideMessage();

  isPeeking = true;
  boardEl.classList.add("is-peeking");

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (!cell.isMine || cell.revealed) continue;
      const el = getCellEl(r, c);
      el.className = "cell peek-bomb";
      el.textContent = UNSAFE_EMOJI;
    }
  }

  clearTimeout(peekTimeout);
  peekTimeout = setTimeout(() => {
    isPeeking = false;
    peekTimeout = null;
    boardEl.classList.remove("is-peeking");
    refreshBoardDisplay();
  }, PEEK_DURATION_MS);
}

function cancelPeek() {
  clearTimeout(peekTimeout);
  peekTimeout = null;
  isPeeking = false;
  boardEl.classList.remove("is-peeking");
}

function refreshBoardDisplay() {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      updateCellDisplay(r, c);
    }
  }
}

function revealCell(row, col) {
  if (gameOver || gameWon) return;
  const cell = grid[row][col];
  if (cell.revealed || cell.flagged) return;

  if (firstClick) {
    firstClick = false;
    placeMines(row, col);
    startTimer();
  }

  cell.revealed = true;
  revealedCount++;
  updateCellDisplay(row, col);

  if (cell.isMine) {
    endGame(false, row, col);
    return;
  }

  if (cell.adjacentMines === 0) {
    floodReveal(row, col);
  }

  checkWin();
}

function floodReveal(row, col) {
  forEachNeighbor(row, col, (nr, nc) => {
    const neighbor = grid[nr][nc];
    if (neighbor.revealed || neighbor.flagged || neighbor.isMine) return;
    neighbor.revealed = true;
    revealedCount++;
    updateCellDisplay(nr, nc);
    if (neighbor.adjacentMines === 0) {
      floodReveal(nr, nc);
    }
  });
}

function toggleFlag(row, col) {
  if (gameOver || gameWon) return;
  const cell = grid[row][col];
  if (cell.revealed) return;

  cell.flagged = !cell.flagged;
  flaggedCount += cell.flagged ? 1 : -1;
  updateCellDisplay(row, col);
  updateMineCounter();
}

function updateCellDisplay(row, col) {
  const el = getCellEl(row, col);
  const cell = grid[row][col];
  el.className = "cell";
  el.textContent = "";

  if (cell.flagged && !cell.revealed) {
    el.classList.add("flagged");
    return;
  }

  if (!cell.revealed) return;

  el.classList.add("revealed");

  if (cell.isMine) {
    el.classList.add("mine");
    el.textContent = UNSAFE_EMOJI;
    return;
  }

  if (cell.adjacentMines > 0) {
    el.textContent = getSafeEmoji(cell.adjacentMines);
    el.classList.add("safe-emoji");
  }
}

function checkWin() {
  const totalSafe = rows * cols - mineCount;
  if (revealedCount === totalSafe) {
    endGame(true);
  }
}

function endGame(won, hitRow, hitCol) {
  gameOver = !won;
  gameWon = won;
  stopTimer();

  if (won) {
    setFace(FACES.win);
    showMessage("You win! All safe cells cleared.", "win");
    flagAllMines();
    showWinFireworks();
  } else {
    setFace(FACES.lose);
    showMessage("BOOM! You hit a mine.", "lose");
    revealAllMines(hitRow, hitCol);
    showBoomPopup();
  }
}

function flagAllMines() {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].isMine) {
        grid[r][c].flagged = true;
        updateCellDisplay(r, c);
      }
    }
  }
  updateMineCounter();
}

function revealAllMines(hitRow, hitCol) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.isMine) {
        cell.revealed = true;
        updateCellDisplay(r, c);
        if (r === hitRow && c === hitCol) {
          getCellEl(r, c).classList.add("mine-hit");
        }
      } else if (cell.flagged) {
        getCellEl(r, c).classList.add("revealed");
        getCellEl(r, c).textContent = "✕";
      }
    }
  }
}

function updateMineCounter() {
  const remaining = Math.max(0, mineCount - flaggedCount);
  mineCounterEl.textContent = String(remaining).padStart(3, "0");
}

function updatePeekCounter() {
  peekCounterEl.textContent = String(peekCount).padStart(3, "0");
  peekCounterEl.classList.toggle("peek-counter--empty", peekCount <= 0);
}

function updateTimerDisplay() {
  const display = Math.min(elapsedSeconds, 999);
  timerEl.textContent = String(display).padStart(3, "0");
}

function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    updateTimerDisplay();
    if (elapsedSeconds >= 999) stopTimer();
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function setFace(face) {
  faceBtn.textContent = face;
}

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
}

function hideMessage() {
  messageEl.className = "message hidden";
  messageEl.textContent = "";
}

function showBoomPopup() {
  boomOverlay.classList.remove("hidden");
  boomOverlay.setAttribute("aria-hidden", "false");
  restartBoomAnimations();
  playLoseMusic();
}

function hideBoomPopup() {
  stopBoomAnimations();
  stopGameMusic();
  boomOverlay.classList.add("hidden");
  boomOverlay.setAttribute("aria-hidden", "true");
}

function restartBoomAnimations() {
  const animated = boomOverlay.querySelectorAll(
    ".boom-light, .boom-flash, .boom-popup-ring, .boom-emoji, .boom-popup h2, #boom-retry"
  );
  animated.forEach((el) => {
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  });
}

function stopBoomAnimations() {
  const animated = boomOverlay.querySelectorAll(
    ".boom-light, .boom-flash, .boom-popup-ring, .boom-emoji, .boom-popup h2, #boom-retry"
  );
  animated.forEach((el) => {
    el.style.animation = "none";
  });
}

function resizeFireworksCanvas() {
  fireworksCanvas.width = window.innerWidth;
  fireworksCanvas.height = window.innerHeight;
}

function randomFireworkColor() {
  return FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
}

function launchFirework() {
  const width = fireworksCanvas.width;
  const height = fireworksCanvas.height;
  const intensity = fireworksBlinding ? 1.6 : 1;
  fireworksRockets.push({
    x: width * 0.05 + Math.random() * width * 0.9,
    y: height,
    targetY: height * 0.05 + Math.random() * height * 0.5,
    speed: (6 + Math.random() * 7) * intensity,
    color: randomFireworkColor(),
    size: fireworksBlinding ? 4 + Math.random() * 3 : 3,
  });
}

function explodeFirework(x, y, color, depth = 0) {
  const intensity = fireworksBlinding ? 1.8 : 1;
  const sparks = Math.floor((50 + Math.random() * 35) * intensity);
  for (let i = 0; i < sparks; i++) {
    const angle = (Math.PI * 2 * i) / sparks + Math.random() * 0.4;
    const speed = (2 + Math.random() * 6) * intensity;
    fireworksParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color,
      alpha: 1,
      decay: (0.006 + Math.random() * 0.01) / intensity,
      gravity: 0.03 + Math.random() * 0.025,
      size: (2 + Math.random() * 3) * intensity,
    });
  }

  if (fireworksBlinding && depth < 1 && Math.random() < 0.35) {
    explodeFirework(
      x + (Math.random() - 0.5) * 80,
      y + (Math.random() - 0.5) * 40,
      randomFireworkColor(),
      depth + 1
    );
  }
}

function updateFireworks() {
  const spawnChance = fireworksBlinding ? 0.16 : 0.06;
  if (Math.random() < spawnChance) {
    launchFirework();
  }
  if (fireworksBlinding && Math.random() < 0.08) {
    launchFirework();
  }

  fireworksRockets = fireworksRockets.filter((rocket) => {
    rocket.y -= rocket.speed;
    if (rocket.y <= rocket.targetY) {
      explodeFirework(rocket.x, rocket.y, rocket.color);
      return false;
    }
    return true;
  });

  fireworksParticles = fireworksParticles.filter((particle) => {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += particle.gravity;
    particle.vx *= 0.985;
    particle.alpha -= particle.decay;
    return particle.alpha > 0.02;
  });
}

function drawFireworks() {
  fireworksCtx.globalCompositeOperation = "source-over";
  fireworksCtx.fillStyle = fireworksBlinding
    ? "rgba(255, 255, 255, 0.18)"
    : "rgba(0, 0, 0, 0.12)";
  fireworksCtx.fillRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);

  fireworksRockets.forEach((rocket) => {
    fireworksCtx.save();
    fireworksCtx.shadowBlur = fireworksBlinding ? 20 : 0;
    fireworksCtx.shadowColor = rocket.color;
    fireworksCtx.beginPath();
    fireworksCtx.arc(rocket.x, rocket.y, rocket.size || 3, 0, Math.PI * 2);
    fireworksCtx.fillStyle = rocket.color;
    fireworksCtx.fill();
    fireworksCtx.restore();
  });

  fireworksParticles.forEach((particle) => {
    fireworksCtx.save();
    fireworksCtx.globalAlpha = Math.min(1, particle.alpha * (fireworksBlinding ? 1.2 : 1));
    fireworksCtx.shadowBlur = fireworksBlinding ? 16 : 6;
    fireworksCtx.shadowColor = particle.color;
    fireworksCtx.beginPath();
    fireworksCtx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    fireworksCtx.fillStyle = particle.color;
    fireworksCtx.fill();
    fireworksCtx.restore();
  });

  fireworksCtx.globalAlpha = 1;
  fireworksCtx.globalCompositeOperation = "source-over";
}

function fireworksLoop() {
  updateFireworks();
  drawFireworks();
  fireworksAnimId = requestAnimationFrame(fireworksLoop);
}

function showWinFireworks() {
  if (!fireworksCtx) {
    fireworksCtx = fireworksCanvas.getContext("2d");
  }

  clearTimeout(winFlashTimeout);
  fireworksBlinding = false;
  winOverlay.classList.remove("hidden");
  winOverlay.setAttribute("aria-hidden", "false");
  winBanner.classList.add("win-banner--waiting");
  winWhiteFlash.classList.remove("hidden");
  winWhiteFlash.classList.add("active");
  resizeFireworksCanvas();
  fireworksRockets = [];
  fireworksParticles = [];
  playWinMusic();

  if (!fireworksResizeHandler) {
    fireworksResizeHandler = resizeFireworksCanvas;
    window.addEventListener("resize", fireworksResizeHandler);
  }

  winFlashTimeout = setTimeout(() => {
    winWhiteFlash.classList.remove("active");
    winWhiteFlash.classList.add("hidden");
    winBanner.classList.remove("win-banner--waiting");
    winOverlay.classList.add("fireworks-blinding");
    fireworksBlinding = true;

    for (let i = 0; i < 12; i++) {
      setTimeout(launchFirework, i * 120);
    }

    if (!fireworksAnimId) {
      fireworksLoop();
    }
  }, WIN_FLASH_DURATION_MS);
}

function hideWinFireworks() {
  clearTimeout(winFlashTimeout);
  winFlashTimeout = null;
  fireworksBlinding = false;
  stopGameMusic();

  if (fireworksAnimId) {
    cancelAnimationFrame(fireworksAnimId);
    fireworksAnimId = null;
  }

  fireworksRockets = [];
  fireworksParticles = [];

  if (fireworksCtx) {
    fireworksCtx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
  }

  if (fireworksResizeHandler) {
    window.removeEventListener("resize", fireworksResizeHandler);
    fireworksResizeHandler = null;
  }

  winWhiteFlash.classList.remove("active");
  winWhiteFlash.classList.add("hidden");
  winBanner.classList.remove("win-banner--waiting");
  winOverlay.classList.remove("fireworks-blinding");
  winOverlay.classList.add("hidden");
  winOverlay.setAttribute("aria-hidden", "true");
}

init();
