import { buildEmptyBoard, placeMines, revealCell, cellSizeFor } from './generator.js';
import { t } from '../../core/i18n.js';

export const id = 'minesweeper';
export const apiVersion = 1;
export const moduleVersion = 1;
export const saveVersion = 1;
export const generatorVersion = 1;

// label bleibt zusätzlich zu labelKey als reiner Text erhalten — es wird
// unverändert in game.label/save.label persistiert (Speicherformat-
// Kompatibilität, siehe validateSave/writeSave). labelKey ist additiv:
// neue Spielstände nutzen ihn für sprachaktuelle Anzeige (applyGameToUi),
// alte Spielstände ohne labelKey fallen auf den gespeicherten Text zurück.
export const DIFFICULTIES = Object.freeze([
  { id:'beginner',     emoji:'🟢', label:'Anfänger',        labelKey:'game.minesweeper.difficulties.beginner.label',     descKey:'game.minesweeper.difficulties.beginner.desc',     cols:9,  rows:9,  mines:10 },
  { id:'intermediate', emoji:'🟡', label:'Fortgeschritten', labelKey:'game.minesweeper.difficulties.intermediate.label', descKey:'game.minesweeper.difficulties.intermediate.desc', cols:16, rows:16, mines:40 },
  { id:'expert',       emoji:'🔴', label:'Experte',         labelKey:'game.minesweeper.difficulties.expert.label',       descKey:'game.minesweeper.difficulties.expert.desc',       cols:30, rows:16, mines:99 },
  { id:'custom',       emoji:'⚙️', label:'Benutzerdefiniert', labelKey:'game.minesweeper.difficulties.custom.label',     descKey:'game.minesweeper.difficulties.custom.desc',       cols:null, rows:null, mines:null },
]);

const NUMBER_COLORS = ['', '#4F9682', '#4E9C7C', '#B8505C', '#9683C7', '#DD8B62', '#3E8E8A', '#6B4A4A', '#33414E'];
const SAVE_KEY = 'arkimis_game_minesweeper_v1';

let root = null;
let context = null;
let game = null;
let timerInterval = null;
let styleElement = null;
let listeners = [];

function listen(element, eventName, handler){
  element.addEventListener(eventName, handler);
  listeners.push(() => element.removeEventListener(eventName, handler));
}

function loadStyles(){
  styleElement = document.querySelector('[data-game-style="minesweeper"]');
  if(styleElement) return;
  styleElement = document.createElement('link');
  styleElement.rel = 'stylesheet';
  styleElement.href = new URL('./game.css', import.meta.url).href;
  styleElement.dataset.gameStyle = 'minesweeper';
  document.head.appendChild(styleElement);
}

/* ---------- Validierung eines gespeicherten Spielstands ---------- */
function validGrid(grid, rows, cols){
  if(!Array.isArray(grid) || grid.length !== rows) return false;
  return grid.every((row, r) => Array.isArray(row) && row.length === cols && row.every((cell, c) =>
    cell && typeof cell === 'object' &&
    cell.r === r && cell.c === c &&
    typeof cell.isMine === 'boolean' &&
    typeof cell.revealed === 'boolean' &&
    typeof cell.flagged === 'boolean' &&
    Number.isInteger(cell.adjacent) && cell.adjacent >= 0 && cell.adjacent <= 8
  ));
}
export function validateSave(save){
  if(!save || typeof save !== 'object') return false;
  if(save.gameId !== id || save.saveVersion !== saveVersion) return false;
  if(!Number.isInteger(save.generatorVersion) || save.generatorVersion <= 0) return false;
  if(typeof save.difficultyId !== 'string' || typeof save.label !== 'string') return false;
  if(!Number.isInteger(save.cols) || save.cols < 5 || save.cols > 40) return false;
  if(!Number.isInteger(save.rows) || save.rows < 5 || save.rows > 24) return false;
  if(!Number.isInteger(save.mineCount) || save.mineCount < 1) return false;
  if(!validGrid(save.grid, save.rows, save.cols)) return false;
  if(typeof save.firstClickDone !== 'boolean') return false;
  if(typeof save.gameOver !== 'boolean') return false;
  if(typeof save.won !== 'boolean') return false;
  if(!Number.isInteger(save.actualMines) || save.actualMines < 0) return false;
  if(!Number.isInteger(save.revealedCount) || save.revealedCount < 0) return false;
  if(typeof save.flagMode !== 'boolean') return false;
  if(typeof save.hasInteracted !== 'boolean') return false;
  if(typeof save.counted !== 'boolean') return false;
  if(typeof save.elapsedSeconds !== 'number' || save.elapsedSeconds < 0) return false;
  if(typeof save.savedAt !== 'number' || save.savedAt <= 0) return false;
  return true;
}

function readSave(){
  try{
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY));
    return validateSave(parsed) ? parsed : null;
  }catch(_error){
    return null;
  }
}
function writeSave(){
  if(!game) return;
  if(game.gameOver){ clearSave(); return; } // beendetes Spiel gibt es nichts fortzusetzen
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    gameId:id, saveVersion, generatorVersion,
    difficultyId:game.difficultyId, label:game.label, labelKey:game.labelKey, cols:game.cols, rows:game.rows, mineCount:game.mineCount,
    grid:game.grid, firstClickDone:game.firstClickDone, gameOver:game.gameOver, won:game.won,
    actualMines:game.actualMines, revealedCount:game.revealedCount, flagMode:game.flagMode,
    hasInteracted:game.hasInteracted, counted:game.counted,
    elapsedSeconds:currentElapsed(), savedAt:Date.now(),
  }));
}
function clearSave(){ localStorage.removeItem(SAVE_KEY); }

// Globale Zählregel (für alle sieben Spiele einheitlich): siehe
// games/sudoku/game.js für die vollständige Begründung. Bei Minesweeper
// ist die erste spielrelevante Aktion das erste Aufdecken ODER Flaggen —
// je nachdem, was zuerst passiert.
function markInteracted(){
  if(game.hasInteracted) return;
  game.hasInteracted = true;
  context.stats.bump('minesweeper', 'played');
  writeSave();
}

/* ---------- Minesweeper-eigener 3-stelliger Timer (klassischer Stil,
   bewusst anders als das mm:ss der übrigen Spiele) ---------- */
function currentElapsed(){
  if(!game) return 0;
  return game.elapsedSeconds + (game.startedAt ? Math.floor((Date.now() - game.startedAt) / 1000) : 0);
}
function formatTime(seconds){ return String(Math.min(999, seconds)).padStart(3, '0'); }
function startTimer(){
  stopTimer(false);
  game.startedAt = Date.now();
  const display = root.querySelector('[data-role="timer"]');
  display.textContent = formatTime(currentElapsed());
  timerInterval = setInterval(() => { display.textContent = formatTime(currentElapsed()); }, 1000);
}
function stopTimer(commit = true){
  if(game && game.startedAt && commit){
    game.elapsedSeconds = currentElapsed();
    game.startedAt = null;
  }
  if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
}

function markup(){
  return `<section class="game-root game-minesweeper">
    <div class="game-header">
      <button class="icon-btn" data-action="back">←</button><h2>${t('games.minesweeper.title')}</h2>
      <span class="level-chip" data-role="level"></span>
    </div>
    <div class="hint-row">
      <button class="hint-btn" data-action="hint">💡 <span data-role="hint-count">3</span> ${t('common.hintsSuffix')}</button>
    </div>
    <div class="mine-hud">
      <div class="mine-hud-pill">💣 <span data-role="remaining">10</span></div>
      <button class="icon-btn" data-action="flag-mode" title="${t('game.minesweeper.flagModeTitle')}">🚩</button>
      <div class="mine-hud-pill">⏱ <span data-role="timer">000</span></div>
    </div>
    <div class="mine-status hidden" data-role="status"></div>
    <div class="mine-board-wrap">
      <div class="mine-grid" data-role="grid"></div>
    </div>
    <p class="mine-hint-text">${t('game.minesweeper.hintText')}</p>
    <div class="grid-actions">
      <button class="btn secondary block" data-action="new">${t('common.newGameLabel')}</button>
    </div>
  </section>`;
}

export async function mount(container, appContext){
  if(root) await unmount();
  context = appContext;
  loadStyles();
  container.innerHTML = markup();
  root = container.querySelector('.game-minesweeper');
  bindEvents();
}

function bindEvents(){
  listen(root.querySelector('[data-action="back"]'), 'click', async () => {
    writeSave(); await context.goToLevels();
  });
  listen(root.querySelector('[data-action="new"]'), 'click', () => { if(game) start(currentLevelFromGame()); });
  listen(root.querySelector('[data-action="hint"]'), 'click', useHint);
  listen(root.querySelector('[data-action="flag-mode"]'), 'click', () => {
    if(!game) return;
    game.flagMode = !game.flagMode;
    root.querySelector('[data-action="flag-mode"]').classList.toggle('active', game.flagMode);
  });
}

function currentLevelFromGame(){
  return { id:game.difficultyId, cols:game.cols, rows:game.rows, mines:game.mineCount, label:game.label, labelKey:game.labelKey };
}

export async function start(level){
  if(!root) throw new Error('Minesweeper muss vor start() gemountet werden.');
  stopTimer();
  const grid = buildEmptyBoard(level.rows, level.cols);
  game = {
    difficultyId: level.id, label: level.label, labelKey: level.labelKey, cols: level.cols, rows: level.rows, mineCount: level.mines,
    grid, firstClickDone:false, gameOver:false, won:false,
    actualMines: level.mines, revealedCount:0, flagMode:false,
    hasInteracted:false, counted:false,
    elapsedSeconds:0, startedAt:null,
    cellSize: cellSizeFor(level.cols),
  };
  applyGameToUi();
  writeSave();
  // Timer startet bewusst erst beim ersten Aufdecken, nicht schon hier —
  // Minen werden ebenfalls erst dann platziert (sicherer erster Klick).
}

export async function restore(savedState = readSave()){
  if(!validateSave(savedState)) return false;
  const alreadyRunning = savedState.firstClickDone && !savedState.gameOver;
  game = {
    difficultyId: savedState.difficultyId, label: savedState.label, labelKey: savedState.labelKey,
    cols: savedState.cols, rows: savedState.rows, mineCount: savedState.mineCount,
    grid: savedState.grid,
    firstClickDone: savedState.firstClickDone, gameOver: savedState.gameOver, won: savedState.won,
    actualMines: savedState.actualMines, revealedCount: savedState.revealedCount, flagMode: savedState.flagMode,
    hasInteracted: savedState.hasInteracted, counted: savedState.counted,
    elapsedSeconds: savedState.elapsedSeconds + (alreadyRunning ? Math.max(0, Math.floor((Date.now() - savedState.savedAt) / 1000)) : 0),
    startedAt: null,
    cellSize: cellSizeFor(savedState.cols),
    hitR: savedState.hitR, hitC: savedState.hitC,
  };
  applyGameToUi();
  if(alreadyRunning) startTimer();
  return true;
}

function applyGameToUi(){
  root.querySelector('[data-role="level"]').textContent = game.labelKey ? t(game.labelKey) : game.label;
  root.querySelector('[data-role="timer"]').textContent = formatTime(game.elapsedSeconds);
  root.querySelector('[data-action="flag-mode"]').classList.toggle('active', game.flagMode);
  const statusEl = root.querySelector('[data-role="status"]');
  statusEl.classList.add('hidden'); statusEl.classList.remove('won', 'lost');
  refreshHintButton();
  renderBoard();
  updateHud();
}

function updateHud(){
  let flags = 0;
  for(let r = 0; r < game.rows; r++) for(let c = 0; c < game.cols; c++) if(game.grid[r][c].flagged) flags++;
  root.querySelector('[data-role="remaining"]').textContent = game.mineCount - flags;
}

function checkWin(){
  const totalCells = game.rows * game.cols;
  const nonMineCells = totalCells - game.actualMines;
  let revealedNonMine = 0;
  for(let r = 0; r < game.rows; r++){
    for(let c = 0; c < game.cols; c++){
      const cell = game.grid[r][c];
      if(cell.revealed && !cell.isMine) revealedNonMine++;
    }
  }
  if(revealedNonMine === nonMineCells) endGame(true);
}

function endGame(won, hitR, hitC){
  game.gameOver = true;
  game.won = won;
  stopTimer();
  for(let r = 0; r < game.rows; r++) for(let c = 0; c < game.cols; c++) if(game.grid[r][c].isMine) game.grid[r][c].revealed = true;
  const statusEl = root.querySelector('[data-role="status"]');
  if(won){
    if(!game.counted){ context.stats.bump('minesweeper', 'won'); game.counted = true; }
    clearSave();
    context.showSuccess(t('game.minesweeper.success'));
  } else {
    game.hitR = hitR; game.hitC = hitC;
    game.counted = true;
    clearSave();
    statusEl.textContent = t('game.minesweeper.lost');
    statusEl.classList.remove('hidden');
    statusEl.classList.add('lost');
  }
}

function handleCellClick(r, c){
  if(!game || game.gameOver) return;
  const cell = game.grid[r][c];
  if(game.flagMode){ toggleFlag(r, c); return; }
  if(cell.flagged || cell.revealed) return;
  markInteracted();
  if(!game.firstClickDone){
    game.firstClickDone = true;
    game.actualMines = placeMines(game.grid, game.rows, game.cols, game.mineCount, r, c);
    startTimer();
  }
  revealCell(game.grid, game.rows, game.cols, r, c);
  if(cell.isMine) endGame(false, r, c);
  else checkWin();
  renderBoard();
  updateHud();
  writeSave();
}
function toggleFlag(r, c){
  if(!game || game.gameOver) return;
  const cell = game.grid[r][c];
  if(cell.revealed) return;
  cell.flagged = !cell.flagged;
  markInteracted();
  renderBoard();
  updateHud();
  writeSave();
}

function attachCellHandlers(el, r, c){
  let pressTimer = null;
  let longPressFired = false;
  el.addEventListener('pointerdown', (e) => {
    if(e.button === 2) return; // Rechtsklick übernimmt der contextmenu-Handler
    longPressFired = false;
    pressTimer = setTimeout(() => { longPressFired = true; toggleFlag(r, c); }, 450);
  });
  const cancelPress = () => { if(pressTimer){ clearTimeout(pressTimer); pressTimer = null; } };
  el.addEventListener('pointerup', () => { cancelPress(); if(!longPressFired) handleCellClick(r, c); });
  el.addEventListener('pointerleave', cancelPress);
  el.addEventListener('pointercancel', cancelPress);
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleFlag(r, c); });
}

function renderBoard(){
  const gridEl = root.querySelector('[data-role="grid"]');
  gridEl.innerHTML = '';
  const size = game.cellSize;
  gridEl.style.gridTemplateColumns = 'repeat(' + game.cols + ', ' + size + 'px)';
  const fragment = document.createDocumentFragment();
  for(let r = 0; r < game.rows; r++){
    for(let c = 0; c < game.cols; c++){
      const cell = game.grid[r][c];
      const el = document.createElement('div');
      el.className = 'mine-cell';
      el.style.width = size + 'px'; el.style.height = size + 'px';
      el.style.fontSize = Math.max(10, Math.floor(size * 0.55)) + 'px';
      if(cell.revealed){
        el.classList.add('revealed');
        if(cell.isMine){
          el.classList.add((game.gameOver && !game.won && cell.r === game.hitR && cell.c === game.hitC) ? 'mine-hit' : 'mine-shown');
          el.textContent = '💣';
        } else if(cell.adjacent > 0){
          el.textContent = cell.adjacent;
          el.style.color = NUMBER_COLORS[cell.adjacent];
        }
      } else if(cell.flagged){
        el.classList.add('flagged');
        el.textContent = (game.gameOver && !game.won && !cell.isMine) ? '❌' : '🚩';
      }
      attachCellHandlers(el, r, c);
      fragment.appendChild(el);
    }
  }
  gridEl.appendChild(fragment);
}

function refreshHintButton(){
  const remaining = context.hints.remaining('minesweeper');
  root.querySelector('[data-role="hint-count"]').textContent = remaining;
  root.querySelector('[data-action="hint"]').disabled = remaining <= 0;
}
// Tipp: deckt ein zufälliges, garantiert minenfreies verdecktes Feld auf.
// Vor dem allerersten Klick sind noch keine Minen platziert — in diesem
// Fall verhält sich der Tipp wie ein normaler (sicherer) erster Klick.
function useHint(){
  if(!game || game.gameOver) return;
  if(context.hints.remaining('minesweeper') <= 0) return;
  const candidates = [];
  for(let r = 0; r < game.rows; r++){
    for(let c = 0; c < game.cols; c++){
      const cell = game.grid[r][c];
      if(cell.revealed || cell.flagged) continue;
      if(game.firstClickDone && cell.isMine) continue;
      candidates.push([r, c]);
    }
  }
  if(!candidates.length) return;
  const [r, c] = candidates[Math.floor(Math.random() * candidates.length)];
  markInteracted();
  if(!game.firstClickDone){
    game.firstClickDone = true;
    game.actualMines = placeMines(game.grid, game.rows, game.cols, game.mineCount, r, c);
    startTimer();
  }
  revealCell(game.grid, game.rows, game.cols, r, c);
  if(!context.hints.consume('minesweeper')) return;
  checkWin();
  renderBoard();
  updateHud();
  refreshHintButton();
  writeSave();
}

function renderCustomPanel(container, actions){
  const panel = document.createElement('div');
  panel.className = 'mine-custom-panel';
  panel.innerHTML = `
    <div class="mine-custom-row">
      <label>${t('game.minesweeper.customPanel.width')}<input type="number" min="5" max="40" value="16" data-role="cols"></label>
      <label>${t('game.minesweeper.customPanel.height')}<input type="number" min="5" max="24" value="16" data-role="rows"></label>
      <label>${t('game.minesweeper.customPanel.mines')}<input type="number" min="1" max="600" value="40" data-role="mines"></label>
    </div>
    <p class="mine-custom-hint">${t('game.minesweeper.customPanel.hint')}</p>
    <button class="btn block" data-action="start-custom">${t('game.minesweeper.customPanel.start')}</button>
  `;
  container.appendChild(panel);
  panel.querySelector('[data-action="start-custom"]').addEventListener('click', () => {
    const colsInput = parseInt(panel.querySelector('[data-role="cols"]').value, 10);
    const rowsInput = parseInt(panel.querySelector('[data-role="rows"]').value, 10);
    const minesInput = parseInt(panel.querySelector('[data-role="mines"]').value, 10);
    const cols = Math.min(40, Math.max(5, colsInput || 9));
    const rows = Math.min(24, Math.max(5, rowsInput || 9));
    const maxMines = Math.max(1, cols * rows - 9); // mindestens 9 sichere Felder für einen fairen ersten Klick
    const mines = Math.min(maxMines, Math.max(1, minesInput || 10));
    actions.start({ id:'custom', cols, rows, mines, label:t('game.minesweeper.difficulties.custom.label'), labelKey:'game.minesweeper.difficulties.custom.label' });
  });
}

export function renderLevelsList(container, actions){
  container.innerHTML = '';
  const saved = readSave();
  if(saved){
    const controls = document.createElement('div');
    controls.className = 'grid-actions';
    controls.innerHTML = '<button class="btn block" data-action="continue">' + t('common.continueGame') + '</button><button class="btn secondary block" data-action="discard">' + t('common.newGameLabel') + '</button>';
    controls.querySelector('[data-action="continue"]').addEventListener('click', () => actions.continue(saved));
    controls.querySelector('[data-action="discard"]').addEventListener('click', () => {
      if(confirm(t('game.minesweeper.discardConfirm'))){ clearSave(); renderLevelsList(container, actions); }
    });
    container.appendChild(controls);
    return;
  }
  DIFFICULTIES.forEach(d => {
    const button = document.createElement('button');
    button.className = 'level-btn';
    button.innerHTML = `<span style="font-size:20px; width:20px; text-align:center;">${d.emoji}</span><div class="label"><b>${t(d.labelKey)}</b><small>${t(d.descKey)}</small></div><div class="arrow">›</div>`;
    button.addEventListener('click', () => {
      if(d.id === 'custom') renderCustomPanel(container, actions);
      else actions.start({ id:d.id, cols:d.cols, rows:d.rows, mines:d.mines, label:d.label, labelKey:d.labelKey });
    });
    container.appendChild(button);
  });
}

export function getCurrentLevel(){ return game ? currentLevelFromGame() : null; }

export async function unmount(){
  stopTimer(); writeSave();
  listeners.splice(0).forEach(remove => remove());
  if(root && root.parentElement) root.parentElement.innerHTML = '';
  if(styleElement && styleElement.parentElement) styleElement.remove();
  root = null; context = null; game = null; styleElement = null;
}

export default { id, apiVersion, moduleVersion, saveVersion, generatorVersion, mount, renderLevelsList, start, restore, validateSave, unmount, getCurrentLevel };
