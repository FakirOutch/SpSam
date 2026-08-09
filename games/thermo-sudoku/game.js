import { generateThermoPuzzle, THERMO_COLOR_PALETTE } from './generator.js';
import { sudokuBlockLines } from '../../core/sudoku-grid-utils.js';
import { readSave as sharedReadSave, clearSave as sharedClearSave } from '../../core/save-utils.js';
import { t } from '../../core/i18n.js';

export const id = 'thermo-sudoku';
export const apiVersion = 1;
export const moduleVersion = 1;
export const saveVersion = 1;
export const generatorVersion = 1;

export const LEVELS = Object.freeze([
  { id:1, labelKey:'common.difficulty.veryEasy', descKey:'game.thermoSudoku.levels.1.desc',
    countMin:3,  countMax:5,  minLen:3, maxLen:5, givensMin:35, givensMax:40,
    allowTouching:false, allowCrossings:false, maxCrossPerThermo:0, crossChance:0 },
  { id:2, labelKey:'common.difficulty.easy', descKey:'game.thermoSudoku.levels.2.desc',
    countMin:5,  countMax:7,  minLen:3, maxLen:6, givensMin:28, givensMax:35,
    allowTouching:true,  allowCrossings:true,  maxCrossPerThermo:1, crossChance:0.15 },
  { id:3, labelKey:'common.difficulty.medium', descKey:'game.thermoSudoku.levels.3.desc',
    countMin:7,  countMax:10, minLen:3, maxLen:6, givensMin:22, givensMax:28,
    allowTouching:true,  allowCrossings:true,  maxCrossPerThermo:2, crossChance:0.25 },
  { id:4, labelKey:'common.difficulty.hard', descKey:'game.thermoSudoku.levels.4.desc',
    countMin:10, countMax:13, minLen:4, maxLen:8, givensMin:18, givensMax:22,
    allowTouching:true,  allowCrossings:true,  maxCrossPerThermo:2, crossChance:0.30 },
  { id:5, labelKey:'common.difficulty.expert', descKey:'game.thermoSudoku.levels.5.desc',
    countMin:12, countMax:16, minLen:3, maxLen:8, givensMin:15, givensMax:20,
    allowTouching:true,  allowCrossings:true,  maxCrossPerThermo:3, crossChance:0.40 },
]);

const SAVE_KEY = 'arkimis_game_thermo-sudoku_v1';

let root = null;
let context = null;
let game = null; // { level, puzzle, solution, values, thermometers, highlightEnabled, inputMode, markedValue, activeCell, hasInteracted, counted, elapsedSeconds, startedAt }
let timerInterval = null;
let styleElement = null;
let listeners = [];

function listen(element, eventName, handler){
  element.addEventListener(eventName, handler);
  listeners.push(() => element.removeEventListener(eventName, handler));
}

function loadStyles(){
  styleElement = document.querySelector('[data-game-style="thermo-sudoku"]');
  if(styleElement) return;
  styleElement = document.createElement('link');
  styleElement.rel = 'stylesheet';
  styleElement.href = new URL('./game.css', import.meta.url).href;
  styleElement.dataset.gameStyle = 'thermo-sudoku';
  document.head.appendChild(styleElement);
}

/* ---------- Validierung eines gespeicherten Spielstands ---------- */
function validMatrix(matrix, min, max){
  return Array.isArray(matrix) && matrix.length === 9 && matrix.every(row =>
    Array.isArray(row) && row.length === 9 && row.every(v => Number.isInteger(v) && v >= min && v <= max)
  );
}
function validThermometers(thermometers){
  return Array.isArray(thermometers) && thermometers.length > 0 && thermometers.every(th =>
    th && typeof th === 'object' && typeof th.color === 'string' &&
    Array.isArray(th.path) && th.path.length >= 2 &&
    th.path.every(cell => Array.isArray(cell) && cell.length === 2 &&
      Number.isInteger(cell[0]) && cell[0] >= 0 && cell[0] < 9 &&
      Number.isInteger(cell[1]) && cell[1] >= 0 && cell[1] < 9)
  );
}
export function validateSave(save){
  if(!save || typeof save !== 'object') return false;
  if(save.gameId !== id || save.saveVersion !== saveVersion) return false;
  if(!Number.isInteger(save.generatorVersion) || save.generatorVersion <= 0) return false;
  if(!LEVELS.some(level => level.id === save.levelId)) return false;
  if(!validMatrix(save.puzzle, 0, 9)) return false;
  if(!validMatrix(save.solution, 1, 9)) return false;
  if(!validMatrix(save.values, 0, 9)) return false;
  if(!validThermometers(save.thermometers)) return false;
  if(typeof save.elapsedSeconds !== 'number' || save.elapsedSeconds < 0) return false;
  if(typeof save.savedAt !== 'number' || save.savedAt <= 0) return false;
  if(typeof save.counted !== 'boolean') return false;
  if(typeof save.hasInteracted !== 'boolean') return false;
  return true;
}

function readSave(){
  return sharedReadSave(SAVE_KEY, { validate: validateSave });
}
function writeSave(){
  if(!game) return;
  if(game.counted){ clearSave(); return; }
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    gameId:id, saveVersion, generatorVersion, levelId:game.level.id,
    puzzle:game.puzzle, solution:game.solution, values:game.values, thermometers:game.thermometers,
    hasInteracted:game.hasInteracted, counted:game.counted,
    elapsedSeconds:currentElapsed(), savedAt:Date.now(),
  }));
}
function clearSave(){ sharedClearSave(SAVE_KEY); }

// Globale Zählregel (für alle sieben Spiele einheitlich): siehe
// games/sudoku/game.js für die vollständige Begründung.
function markInteracted(){
  if(game.hasInteracted) return;
  game.hasInteracted = true;
  context.stats.bump('thermo-sudoku', 'played');
  writeSave();
}

function currentElapsed(){
  if(!game) return 0;
  return game.elapsedSeconds + (game.startedAt ? Math.floor((Date.now() - game.startedAt) / 1000) : 0);
}
function formatTime(seconds){
  return String(Math.floor(seconds / 60)).padStart(2,'0') + ':' + String(seconds % 60).padStart(2,'0');
}
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
  return `<section class="game-root game-thermo-sudoku">
    <div class="game-header">
      <button class="icon-btn" data-action="back">←</button><h2>${t('games.thermoSudoku.title')}</h2>
      <span class="level-chip" data-role="level"></span>
    </div>
    <div class="hint-row">
      <button class="hint-btn" data-action="hint">💡 <span data-role="hint-count">3</span> ${t('common.hintsSuffix')}</button>
      <div class="timer-chip">⏱ <span data-role="timer">00:00</span></div>
      <button class="reveal-btn" data-action="reveal" title="${t('common.reveal')}" aria-label="${t('common.reveal')}">🔍</button>
    </div>
    <div class="cage-style-row" data-role="toggle-strip">
      <div class="toggle-group" title="${t('common.focusToggleTitle')}">
        <span class="toggle-name">${t('common.toggleFocus')}</span>
        <label class="switch"><input type="checkbox" data-action="highlight" aria-label="${t('common.toggleFocus')}"><span class="slider"></span></label>
      </div>
      <div class="toggle-group" title="${t('common.inputModeToggleTitle')}">
        <span class="toggle-name">${t('common.toggleInput')}</span>
        <label class="switch"><input type="checkbox" data-action="input-mode" checked aria-label="${t('common.toggleInput')}"><span class="slider"></span></label>
      </div>
    </div>
    <div class="thermo-wrap">
      <div class="thermo-grid" data-role="grid"></div>
      <svg class="thermo-overlay" data-role="overlay" viewBox="0 0 396 396"></svg>
      <div class="numpad-backdrop hidden" data-role="backdrop">
        <div class="numpad" data-role="numpad"></div>
      </div>
    </div>
    <div class="grid-actions">
      <button class="btn secondary block" data-action="new">${t('common.newPuzzle')}</button>
      <button class="btn block" data-action="check" disabled>${t('common.check')}</button>
    </div>
    <div class="inline-input hidden" data-role="inline-input">
      <div class="inline-input-row" data-role="inline-numpad"></div>
    </div>
  </section>`;
}

export async function mount(container, appContext){
  if(root) await unmount();
  context = appContext;
  loadStyles();
  container.innerHTML = markup();
  root = container.querySelector('.game-thermo-sudoku');
  buildNumpad();
  buildInlineNumpad();
  bindEvents();
}

function buildNumpad(){
  const el = root.querySelector('[data-role="numpad"]');
  for(let v = 1; v <= 9; v++){
    const button = document.createElement('button');
    button.textContent = v;
    listen(button, 'click', () => setCellValue(v));
    el.appendChild(button);
  }
  const clearButton = document.createElement('button');
  clearButton.className = 'clear-btn';
  clearButton.textContent = t('common.clearField');
  listen(clearButton, 'click', () => setCellValue(0));
  el.appendChild(clearButton);
}
function buildInlineNumpad(){
  const el = root.querySelector('[data-role="inline-numpad"]');
  for(let v = 1; v <= 9; v++){
    const button = document.createElement('button');
    button.textContent = v;
    listen(button, 'click', () => markInlineValue(v));
    el.appendChild(button);
  }
  const deleteButton = document.createElement('button');
  deleteButton.textContent = '⌫';
  deleteButton.dataset.action = 'inline-delete';
  listen(deleteButton, 'click', () => markInlineValue('delete'));
  el.appendChild(deleteButton);
  refreshInlineMarks();
}

function bindEvents(){
  listen(root.querySelector('[data-action="back"]'), 'click', async () => {
    writeSave(); await context.goToLevels();
  });
  listen(root.querySelector('[data-action="new"]'), 'click', () => { if(game) start(game.level); });
  listen(root.querySelector('[data-action="check"]'), 'click', checkPuzzle);
  listen(root.querySelector('[data-action="hint"]'), 'click', useHint);
  listen(root.querySelector('[data-action="reveal"]'), 'click', revealSolution);
  listen(root.querySelector('[data-role="backdrop"]'), 'click', (event) => {
    if(event.target === root.querySelector('[data-role="backdrop"]')) closeNumpad();
  });
  listen(root.querySelector('[data-action="highlight"]'), 'change', (event) => {
    if(!game) return;
    game.highlightEnabled = event.target.checked;
    context.preferences.set('highlight', game.highlightEnabled);
    if(game.activeCell){
      clearRowColHighlight();
      highlightRowCol(game.activeCell.row, game.activeCell.col);
    }
  });
  listen(root.querySelector('[data-action="input-mode"]'), 'change', (event) => {
    if(!game) return;
    game.inputMode = event.target.checked ? 'popup' : 'direct';
    context.preferences.set('inputMode', game.inputMode);
    root.querySelector('[data-role="inline-input"]').classList.toggle('hidden', game.inputMode === 'popup');
    if(game.inputMode === 'popup'){ game.markedValue = null; refreshInlineMarks(); }
  });
}

export async function start(level){
  if(!root) throw new Error('Thermo Sudoku muss vor start() gemountet werden.');
  stopTimer();
  const puzzle = generateThermoPuzzle(level);
  game = {
    level, puzzle:puzzle.puzzle, solution:puzzle.solution,
    values: puzzle.puzzle.map(row => row.slice()),
    thermometers: puzzle.thermometers,
    highlightEnabled: context.preferences.get('highlight', false),
    inputMode: context.preferences.get('inputMode', 'popup'), markedValue:null,
    hasInteracted:false, counted:false, activeCell:null,
    elapsedSeconds:0, startedAt:null,
  };
  applyGameToUi();
  writeSave();
  startTimer();
}

export async function restore(savedState = readSave()){
  if(!validateSave(savedState)) return false;
  const level = LEVELS.find(item => item.id === savedState.levelId);
  game = {
    level, puzzle:savedState.puzzle, solution:savedState.solution, values:savedState.values,
    thermometers:savedState.thermometers,
    highlightEnabled: context.preferences.get('highlight', false),
    inputMode: context.preferences.get('inputMode', 'popup'), markedValue:null,
    hasInteracted:savedState.hasInteracted, counted:savedState.counted, activeCell:null,
    elapsedSeconds:savedState.elapsedSeconds + Math.max(0, Math.floor((Date.now() - savedState.savedAt) / 1000)),
    startedAt:null,
  };
  applyGameToUi();
  if(!game.counted) startTimer();
  return true;
}

function applyGameToUi(){
  root.querySelector('[data-role="level"]').textContent = context.starsFor(game.level.id);
  root.querySelector('[data-role="timer"]').textContent = formatTime(game.elapsedSeconds);
  const reveal = root.querySelector('[data-action="reveal"]');
  reveal.title = t('common.reveal'); reveal.setAttribute('aria-label', t('common.reveal')); reveal.disabled = false; reveal.classList.remove('used');
  root.querySelector('[data-action="highlight"]').checked = game.highlightEnabled;
  root.querySelector('[data-action="input-mode"]').checked = game.inputMode === 'popup';
  root.querySelector('[data-role="inline-input"]').classList.toggle('hidden', game.inputMode === 'popup');
  refreshHintButton();
  refreshInlineMarks();
  renderGrid();
  updateCheckButton();
}

function renderGrid(){
  const gridEl = root.querySelector('[data-role="grid"]');
  gridEl.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for(let r = 0; r < 9; r++){
    for(let c = 0; c < 9; c++){
      const val = game.values[r][c];
      const given = game.puzzle[r][c] !== 0;
      const cell = document.createElement('div');
      cell.className = 'thermo-cell ' + (given ? 'given' : 'editable');
      cell.dataset.row = r; cell.dataset.col = c;

      const lines = sudokuBlockLines(r, c);
      cell.style.setProperty('--lines', lines.join(', '));

      if(val !== 0){
        const numSpan = document.createElement('span');
        numSpan.className = 'cell-value';
        numSpan.textContent = val;
        cell.appendChild(numSpan);
      }
      if(!given) cell.addEventListener('click', () => handleCellTap(r, c, cell));
      fragment.appendChild(cell);
    }
  }
  gridEl.appendChild(fragment);
  renderThermoOverlay();
}

// Zeichnet die Thermometer als SVG-Ebene über dem Gitter: dicker runder
// Balken je Thermometer mit einem großen Kolben-Kreis am Startpunkt.
function renderThermoOverlay(){
  const svg = root.querySelector('[data-role="overlay"]');
  svg.innerHTML = '';
  if(!game || !game.thermometers || !game.thermometers.length) return;
  const cell = 396 / 9;
  const center = (r, c) => ({ x: c * cell + cell/2, y: r * cell + cell/2 });
  const ns = 'http://www.w3.org/2000/svg';
  game.thermometers.forEach(th => {
    const pts = th.path.map(([r,c]) => center(r,c));
    const poly = document.createElementNS(ns, 'polyline');
    poly.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
    poly.setAttribute('class', 'thermo-line');
    poly.style.stroke = th.color;
    svg.appendChild(poly);
    const bulb = document.createElementNS(ns, 'circle');
    bulb.setAttribute('cx', pts[0].x);
    bulb.setAttribute('cy', pts[0].y);
    bulb.setAttribute('r', cell * 0.32);
    bulb.setAttribute('class', 'thermo-bulb');
    bulb.style.fill = th.color;
    svg.appendChild(bulb);
  });
}

function handleCellTap(r, c, cellEl){
  if(game.inputMode === 'direct'){
    if(game.markedValue === null || game.markedValue === undefined) return;
    game.activeCell = { row:r, col:c, el:cellEl };
    setCellValue(game.markedValue === 'delete' ? 0 : game.markedValue);
    highlightRowCol(r, c);
  } else {
    openNumpad(r, c, cellEl);
  }
}
function openNumpad(r, c, cellEl){
  game.activeCell = { row:r, col:c, el:cellEl };
  root.querySelectorAll('.thermo-cell.selected').forEach(el => el.classList.remove('selected'));
  cellEl.classList.add('selected');
  root.querySelector('[data-role="backdrop"]').classList.remove('hidden');
  root.querySelector('[data-role="toggle-strip"]').classList.add('toggles-locked');
  highlightRowCol(r, c);
}
function closeNumpad(){
  root.querySelector('[data-role="backdrop"]').classList.add('hidden');
  root.querySelector('[data-role="toggle-strip"]').classList.remove('toggles-locked');
  if(game.activeCell) game.activeCell.el.classList.remove('selected');
  clearRowColHighlight();
}
function highlightRowCol(row, col){
  if(!game || !game.highlightEnabled) return;
  root.querySelectorAll('.thermo-cell').forEach(cell => {
    const r = +cell.dataset.row, c = +cell.dataset.col;
    if((r === row || c === col) && !(r === row && c === col)) cell.classList.add('rc-highlight');
  });
}
function clearRowColHighlight(){
  root.querySelectorAll('.thermo-cell.rc-highlight').forEach(cell => cell.classList.remove('rc-highlight'));
}
function setCellValue(v){
  const { row, col, el } = game.activeCell;
  game.values[row][col] = v;
  markInteracted();
  let valueSpan = el.querySelector('.cell-value');
  if(v === 0){
    if(valueSpan) valueSpan.remove();
  } else {
    if(!valueSpan){
      valueSpan = document.createElement('span');
      valueSpan.className = 'cell-value';
      el.appendChild(valueSpan);
    }
    valueSpan.textContent = v;
  }
  el.classList.remove('wrong');
  closeNumpad();
  updateCheckButton();
  writeSave();
}
function markInlineValue(value){
  game.markedValue = game.markedValue === value ? null : value;
  refreshInlineMarks();
}
function refreshInlineMarks(){
  if(!root) return;
  root.querySelectorAll('[data-role="inline-numpad"] button').forEach(button => {
    button.classList.toggle('marked', game && game.markedValue === Number(button.textContent));
  });
  const deleteBtn = root.querySelector('[data-action="inline-delete"]');
  if(deleteBtn) deleteBtn.classList.toggle('marked', !!game && game.markedValue === 'delete');
}

function updateCheckButton(){
  const complete = game.values.every(row => row.every(v => v !== 0));
  root.querySelector('[data-action="check"]').disabled = !complete;
}

function checkPuzzle(){
  if(!game) return;
  let allCorrect = true;
  root.querySelectorAll('.thermo-cell').forEach(cell => {
    const r = +cell.dataset.row, c = +cell.dataset.col;
    if(game.puzzle[r][c] !== 0) return;
    const correct = game.values[r][c] === game.solution[r][c];
    cell.classList.toggle('wrong', !correct);
    if(!correct) allCorrect = false;
  });
  if(!allCorrect || game.counted) return;
  context.stats.bump('thermo-sudoku', 'won');
  game.counted = true; stopTimer(); clearSave();
  context.showSuccess(t('game.thermoSudoku.success'));
}

function refreshHintButton(){
  const remaining = context.hints.remaining('thermo-sudoku');
  root.querySelector('[data-role="hint-count"]').textContent = remaining;
  root.querySelector('[data-action="hint"]').disabled = remaining <= 0;
}
// Tipp und "Lösung anzeigen": im Legacy-Screen war für diese beiden Buttons
// nie ein Klick-Handler verdrahtet (sie taten nichts) — hier vollständig
// nachgerüstet, konsistent mit den übrigen Modulen.
function useHint(){
  if(!game) return;
  if(context.hints.remaining('thermo-sudoku') <= 0) return;
  const empty = [];
  for(let r = 0; r < 9; r++){
    for(let c = 0; c < 9; c++){
      if(game.puzzle[r][c] === 0 && game.values[r][c] !== game.solution[r][c]) empty.push([r,c]);
    }
  }
  if(!empty.length || !context.hints.consume('thermo-sudoku')) return;
  const [r,c] = empty[Math.floor(Math.random() * empty.length)];
  game.values[r][c] = game.solution[r][c];
  markInteracted();
  renderGrid(); updateCheckButton(); refreshHintButton(); writeSave();
}
function revealSolution(){
  if(!game) return;
  for(let r = 0; r < 9; r++) for(let c = 0; c < 9; c++) game.values[r][c] = game.solution[r][c];
  markInteracted();
  game.counted = true;
  stopTimer(); clearSave(); renderGrid(); updateCheckButton();
  const reveal = root.querySelector('[data-action="reveal"]');
  reveal.title = t('common.revealed'); reveal.setAttribute('aria-label', t('common.revealed')); reveal.disabled = true; reveal.classList.add('used');
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
      if(confirm(t('common.discardConfirmNamed', { game: t('games.thermoSudoku.title') }))){ clearSave(); renderLevelsList(container, actions); }
    });
    container.appendChild(controls);
    return;
  }
  LEVELS.forEach(level => {
    const button = document.createElement('button');
    button.className = 'level-btn';
    const dots = Array.from({length:5}, (_, index) => `<span class="${index < level.id ? 'on' : ''}"></span>`).join('');
    button.innerHTML = `<div class="dots">${dots}</div><div class="label"><b>${t(level.labelKey)}</b><small>${t(level.descKey)}</small></div><div class="arrow">›</div>`;
    button.addEventListener('click', () => actions.start(level));
    container.appendChild(button);
  });
}

export function getCurrentLevel(){ return game ? game.level : null; }

export async function unmount(){
  stopTimer(); writeSave();
  listeners.splice(0).forEach(remove => remove());
  if(root && root.parentElement) root.parentElement.innerHTML = '';
  if(styleElement && styleElement.parentElement) styleElement.remove();
  root = null; context = null; game = null; styleElement = null;
}

export default { id, apiVersion, moduleVersion, saveVersion, generatorVersion, mount, renderLevelsList, start, restore, validateSave, unmount, getCurrentLevel };
