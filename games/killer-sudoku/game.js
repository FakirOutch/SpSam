import { generateKillerPuzzle, CAGE_COLOR_PALETTE, CAGE_BG_PALETTE } from './generator.js';
import { sudokuBlockLines } from '../../core/sudoku-grid-utils.js';
import { readSave as sharedReadSave, clearSave as sharedClearSave } from '../../core/save-utils.js';
import { t } from '../../core/i18n.js';

export const id = 'killer-sudoku';
export const apiVersion = 1;
export const moduleVersion = 1;
export const saveVersion = 1;
export const generatorVersion = 1;

export const LEVELS = Object.freeze([
  { id:1, labelKey:'common.difficulty.veryEasy', descKey:'game.killerSudoku.levels.1.desc', minCage:2, maxCage:3, givens:6 },
  { id:2, labelKey:'common.difficulty.easy',      descKey:'game.killerSudoku.levels.2.desc', minCage:2, maxCage:3, givens:4 },
  { id:3, labelKey:'common.difficulty.medium',    descKey:'game.killerSudoku.levels.3.desc', minCage:2, maxCage:4, givens:1 },
  { id:4, labelKey:'common.difficulty.hard',      descKey:'game.killerSudoku.levels.4.desc', minCage:3, maxCage:4, givens:0 },
  { id:5, labelKey:'common.difficulty.expert',    descKey:'game.killerSudoku.levels.5.desc', minCage:2, maxCage:5, givens:0 },
]);

const SAVE_KEY = 'arkimis_game_killer-sudoku_v1';

let root = null;
let context = null;
let game = null; // { level, puzzle, solution, values, cages, cageStyle, highlightEnabled, inputMode, markedValue, activeCell, hasInteracted, counted, elapsedSeconds, startedAt }
let timerInterval = null;
let styleElement = null;
let listeners = [];

function listen(element, eventName, handler){
  element.addEventListener(eventName, handler);
  listeners.push(() => element.removeEventListener(eventName, handler));
}

function loadStyles(){
  styleElement = document.querySelector('[data-game-style="killer-sudoku"]');
  if(styleElement) return;
  styleElement = document.createElement('link');
  styleElement.rel = 'stylesheet';
  styleElement.href = new URL('./game.css', import.meta.url).href;
  styleElement.dataset.gameStyle = 'killer-sudoku';
  document.head.appendChild(styleElement);
}

/* ---------- Validierung eines gespeicherten Spielstands ---------- */
function validMatrix(matrix, min, max){
  return Array.isArray(matrix) && matrix.length === 9 && matrix.every(row =>
    Array.isArray(row) && row.length === 9 && row.every(v => Number.isInteger(v) && v >= min && v <= max)
  );
}
function validCages(cages){
  if(!cages || typeof cages !== 'object') return false;
  if(!validMatrix(cages.cageId, -1, 80)) return false;
  if(!Array.isArray(cages.cages) || !cages.cages.length) return false;
  return cages.cages.every(cage =>
    cage && typeof cage === 'object' &&
    Number.isInteger(cage.id) &&
    Number.isInteger(cage.sum) && cage.sum >= 1 && cage.sum <= 45 &&
    Array.isArray(cage.cells) && cage.cells.length >= 1 &&
    cage.cells.every(cell => Array.isArray(cell) && cell.length === 2 &&
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
  if(!validCages(save.cages)) return false;
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
    puzzle:game.puzzle, solution:game.solution, values:game.values, cages:game.cages,
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
  context.stats.bump('killer-sudoku', 'played');
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
  return `<section class="game-root game-killer-sudoku">
    <div class="game-header">
      <button class="icon-btn" data-action="back">←</button><h2>${t('games.killerSudoku.title')}</h2>
      <span class="level-chip" data-role="level"></span>
    </div>
    <div class="hint-row">
      <button class="hint-btn" data-action="hint">💡 <span data-role="hint-count">3</span> ${t('common.hintsSuffix')}</button>
      <div class="timer-chip">⏱ <span data-role="timer">00:00</span></div>
      <button class="reveal-btn" data-action="reveal" title="${t('common.reveal')}">${t('common.revealLabel')}</button>
    </div>
    <div class="cage-style-row" data-role="toggle-strip">
      <div class="toggle-group" title="${t('common.focusToggleTitle')}">
        <span class="toggle-name">${t('common.toggleFocus')}</span>
        <label class="switch"><input type="checkbox" data-action="highlight" aria-label="${t('common.toggleFocus')}"><span class="slider"></span></label>
      </div>
      <div class="toggle-group">
        <span class="toggle-name">${t('game.killerSudoku.styleToggle')}</span>
        <label class="switch"><input type="checkbox" data-action="cage-style" aria-label="${t('game.killerSudoku.styleToggle')}"><span class="slider"></span></label>
      </div>
      <div class="toggle-group" title="${t('common.inputModeToggleTitle')}">
        <span class="toggle-name">${t('common.toggleInput')}</span>
        <label class="switch"><input type="checkbox" data-action="input-mode" checked aria-label="${t('common.toggleInput')}"><span class="slider"></span></label>
      </div>
    </div>
    <div class="killer-wrap">
      <div class="killer-grid" data-role="grid"></div>
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
  root = container.querySelector('.game-killer-sudoku');
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
  listen(root.querySelector('[data-action="cage-style"]'), 'change', (event) => {
    if(!game) return;
    game.cageStyle = event.target.checked ? 'fill' : 'lines';
    context.preferences.set('cageStyle', game.cageStyle);
    renderGrid();
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
  if(!root) throw new Error('Killer Sudoku muss vor start() gemountet werden.');
  stopTimer();
  const puzzle = generateKillerPuzzle(level);
  game = {
    level, puzzle:puzzle.puzzle, solution:puzzle.solution,
    values: puzzle.puzzle.map(row => row.slice()),
    cages: puzzle.cages,
    cageStyle: context.preferences.get('cageStyle', 'fill'),
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
    cages:savedState.cages,
    cageStyle: context.preferences.get('cageStyle', 'fill'),
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
  reveal.title = t('common.reveal'); reveal.disabled = false; reveal.classList.remove('used');
  root.querySelector('[data-action="highlight"]').checked = game.highlightEnabled;
  root.querySelector('[data-action="cage-style"]').checked = game.cageStyle === 'fill';
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
  const cageIdAt = game.cages.cageId;
  const cageAnchor = new Set();
  const cageSumAt = {};
  const cageColorOf = {};
  const cageBgColorOf = {};
  game.cages.cages.forEach(cage => {
    const sorted = cage.cells.slice().sort((a,b) => a[0]-b[0] || a[1]-b[1]);
    const [ar,ac] = sorted[0];
    cageAnchor.add(ar+','+ac);
    cageSumAt[ar+','+ac] = cage.sum;
    cageColorOf[cage.id] = cage.color || CAGE_COLOR_PALETTE[0];
    cageBgColorOf[cage.id] = cage.bgColor || CAGE_BG_PALETTE[0];
  });

  for(let r = 0; r < 9; r++){
    for(let c = 0; c < 9; c++){
      const val = game.values[r][c];
      const given = game.puzzle[r][c] !== 0;
      const cell = document.createElement('div');
      cell.className = 'killer-cell ' + (given ? 'given' : 'editable');
      cell.dataset.row = r; cell.dataset.col = c;
      if(given && game.cageStyle === 'fill') cell.style.color = 'var(--ink)';

      const lines = sudokuBlockLines(r, c);

      const myId = cageIdAt[r][c];
      const myColor = cageColorOf[myId] || CAGE_COLOR_PALETTE[0];
      if(game.cageStyle === 'fill'){
        const bg = cageBgColorOf[myId] || CAGE_BG_PALETTE[0];
        cell.style.backgroundColor = bg;
        cell.dataset.cageBg = bg;
      } else {
        if(c > 0 && cageIdAt[r][c-1] !== myId) lines.push(`inset 1.5px 0 0 ${myColor}`);
        if(r > 0 && cageIdAt[r-1][c] !== myId) lines.push(`inset 0 1.5px 0 0 ${myColor}`);
        if(c < 8 && cageIdAt[r][c+1] !== myId) lines.push(`inset -1.5px 0 0 ${myColor}`);
        if(r < 8 && cageIdAt[r+1][c] !== myId) lines.push(`inset 0 -1.5px 0 ${myColor}`);
      }
      const sum = cageSumAt[r+','+c];
      if(sum !== undefined){
        const label = document.createElement('span');
        label.className = 'cage-sum';
        label.textContent = sum;
        label.style.color = myColor;
        cell.appendChild(label);
      }
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
  root.querySelectorAll('.killer-cell.selected').forEach(el => el.classList.remove('selected'));
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
  root.querySelectorAll('.killer-cell').forEach(cell => {
    const r = +cell.dataset.row, c = +cell.dataset.col;
    if((r === row || c === col) && !(r === row && c === col)) cell.classList.add('rc-highlight');
  });
}
function clearRowColHighlight(){
  root.querySelectorAll('.killer-cell.rc-highlight').forEach(cell => cell.classList.remove('rc-highlight'));
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
  if(game.cageStyle === 'fill') el.style.backgroundColor = el.dataset.cageBg || '';
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
  root.querySelectorAll('.killer-cell').forEach(cell => {
    const r = +cell.dataset.row, c = +cell.dataset.col;
    if(game.puzzle[r][c] !== 0) return;
    const correct = game.values[r][c] === game.solution[r][c];
    cell.classList.toggle('wrong', !correct);
    if(game.cageStyle === 'fill'){
      cell.style.backgroundColor = correct ? (cell.dataset.cageBg || '') : 'var(--danger-bg)';
    }
    if(!correct) allCorrect = false;
  });
  if(!allCorrect || game.counted) return;
  context.stats.bump('killer-sudoku', 'won');
  game.counted = true; stopTimer(); clearSave();
  context.showSuccess(t('game.killerSudoku.success'));
}

function refreshHintButton(){
  const remaining = context.hints.remaining('killer-sudoku');
  root.querySelector('[data-role="hint-count"]').textContent = remaining;
  root.querySelector('[data-action="hint"]').disabled = remaining <= 0;
}
// Tipp und "Lösung anzeigen": im Legacy-Screen war für diese beiden Buttons
// nie ein Klick-Handler verdrahtet (sie taten nichts) — hier vollständig
// nachgerüstet, konsistent mit den übrigen Modulen.
function useHint(){
  if(!game) return;
  if(context.hints.remaining('killer-sudoku') <= 0) return;
  const empty = [];
  for(let r = 0; r < 9; r++){
    for(let c = 0; c < 9; c++){
      if(game.puzzle[r][c] === 0 && game.values[r][c] !== game.solution[r][c]) empty.push([r,c]);
    }
  }
  if(!empty.length || !context.hints.consume('killer-sudoku')) return;
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
  reveal.title = t('common.revealed'); reveal.disabled = true; reveal.classList.add('used');
}

export function renderLevelsList(container, actions){
  container.innerHTML = '';
  const saved = readSave();
  // Backlog Punkt 10: Fortsetzen und alle Stufen stehen gemeinsam
  // untereinander, kein Verwerfen-Dialog mehr — das direkte Antippen
  // einer Stufe ist die Aktion (verwirft einen evtl. pausierten Stand
  // implizit, ohne Rückfrage; "Fortsetzen" bleibt der einzige Weg,
  // den pausierten Stand tatsächlich weiterzuspielen).
  if(saved){
    const continueBtn = document.createElement('button');
    continueBtn.className = 'btn block';
    continueBtn.textContent = t('common.continueGame');
    continueBtn.addEventListener('click', () => actions.continue(saved));
    container.appendChild(continueBtn);
  }
  LEVELS.forEach(level => {
    const button = document.createElement('button');
    button.className = 'level-btn';
    const dots = Array.from({length:5}, (_, index) => `<span class="${index < level.id ? 'on' : ''}"></span>`).join('');
    button.innerHTML = `<div class="dots">${dots}</div><div class="label"><b>${t(level.labelKey)}</b><small>${t(level.descKey)}</small></div><div class="arrow">›</div>`;
    button.addEventListener('click', () => {
      if(saved) clearSave();
      actions.start(level);
    });
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
