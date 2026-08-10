import { generateFutoshikiPuzzle, cellSizeFor } from './generator.js';
import { t } from '../../core/i18n.js';

export const id = 'futoshiki';
export const apiVersion = 1;
export const moduleVersion = 1;
export const saveVersion = 1;
export const generatorVersion = 1;

export const LEVELS = Object.freeze([
  { id:1, labelKey:'common.difficulty.veryEasy', descKey:'game.futoshiki.levels.1.desc', n:5, givenCount:8,  constraintCount:6 },
  { id:2, labelKey:'common.difficulty.easy',      descKey:'game.futoshiki.levels.2.desc', n:6, givenCount:10, constraintCount:8 },
  { id:3, labelKey:'common.difficulty.medium',    descKey:'game.futoshiki.levels.3.desc', n:7, givenCount:10, constraintCount:16 },
  { id:4, labelKey:'common.difficulty.hard',      descKey:'game.futoshiki.levels.4.desc', n:8, givenCount:14, constraintCount:24 },
  { id:5, labelKey:'common.difficulty.expert',    descKey:'game.futoshiki.levels.5.desc', n:9, givenCount:18, constraintCount:26 },
]);

const SAVE_KEY = 'arkimis_game_futoshiki_v1';

let root = null;
let context = null;
let game = null; // { level, n, solution, given, values, constraints, hGap, vGap, cellSize, gapSize, hasInteracted, counted, inputMode, markedValue, activeCell, elapsedSeconds, startedAt }
let timerInterval = null;
let styleElement = null;
let listeners = [];

function listen(element, eventName, handler){
  element.addEventListener(eventName, handler);
  listeners.push(() => element.removeEventListener(eventName, handler));
}

function loadStyles(){
  styleElement = document.querySelector('[data-game-style="futoshiki"]');
  if(styleElement) return;
  styleElement = document.createElement('link');
  styleElement.rel = 'stylesheet';
  styleElement.href = new URL('./game.css', import.meta.url).href;
  styleElement.dataset.gameStyle = 'futoshiki';
  document.head.appendChild(styleElement);
}

/* ---------- Validierung eines gespeicherten Spielstands ---------- */
function validNumberMatrix(matrix, n, min, max){
  return Array.isArray(matrix) && matrix.length === n && matrix.every(row =>
    Array.isArray(row) && row.length === n && row.every(v => Number.isInteger(v) && v >= min && v <= max)
  );
}
function validBoolMatrix(matrix, n){
  return Array.isArray(matrix) && matrix.length === n && matrix.every(row =>
    Array.isArray(row) && row.length === n && row.every(v => typeof v === 'boolean')
  );
}
function validConstraints(constraints, n){
  return Array.isArray(constraints) && constraints.every(con =>
    con && typeof con === 'object' &&
    typeof con.horizontal === 'boolean' &&
    (con.sign === '<' || con.sign === '>') &&
    Number.isInteger(con.r1) && con.r1 >= 0 && con.r1 < n &&
    Number.isInteger(con.c1) && con.c1 >= 0 && con.c1 < n &&
    Number.isInteger(con.r2) && con.r2 >= 0 && con.r2 < n &&
    Number.isInteger(con.c2) && con.c2 >= 0 && con.c2 < n
  );
}
export function validateSave(save){
  if(!save || typeof save !== 'object') return false;
  if(save.gameId !== id || save.saveVersion !== saveVersion) return false;
  if(!Number.isInteger(save.generatorVersion) || save.generatorVersion <= 0) return false;
  if(!LEVELS.some(level => level.id === save.levelId)) return false;
  if(!Number.isInteger(save.n) || save.n < 5 || save.n > 9) return false;
  if(!validNumberMatrix(save.solution, save.n, 1, save.n)) return false;
  if(!validBoolMatrix(save.given, save.n)) return false;
  if(!validNumberMatrix(save.values, save.n, 0, save.n)) return false;
  if(!validConstraints(save.constraints, save.n)) return false;
  if(typeof save.elapsedSeconds !== 'number' || save.elapsedSeconds < 0) return false;
  if(typeof save.savedAt !== 'number' || save.savedAt <= 0) return false;
  if(typeof save.counted !== 'boolean') return false;
  if(typeof save.hasInteracted !== 'boolean') return false;
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
  if(game.counted){ clearSave(); return; }
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    gameId:id, saveVersion, generatorVersion, levelId:game.level.id,
    n:game.n, solution:game.solution, given:game.given, values:game.values, constraints:game.constraints,
    hasInteracted:game.hasInteracted, counted:game.counted,
    elapsedSeconds:currentElapsed(), savedAt:Date.now(),
    attemptId:game.attemptId, attemptCreatedAt:game.attemptCreatedAt,
    attemptFirstActionAt:game.attemptFirstActionAt, attemptHintsUsed:game.attemptHintsUsed,
    // Backlog: Notizzahlen-Anpassung — additiv, siehe games/sudoku/game.js.
    candidates:game.candidates,
  }));
}
function clearSave(){ localStorage.removeItem(SAVE_KEY); }

// Globale Zählregel (für alle sieben Spiele einheitlich): siehe
// games/sudoku/game.js für die vollständige Begründung.
function markInteracted(){
  if(game.hasInteracted) return;
  game.hasInteracted = true;
  if(!game.attemptFirstActionAt) game.attemptFirstActionAt = Date.now(); // Backlog Punkt 17
  context.stats.bump('futoshiki', 'played');
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

function gapsFromConstraints(n, constraints){
  const hGap = Array.from({length:n}, () => Array(n - 1).fill(null));
  const vGap = Array.from({length:n - 1}, () => Array(n).fill(null));
  constraints.forEach(con => {
    if(con.horizontal) hGap[con.r1][con.c1] = con.sign;
    else vGap[con.r1][con.c1] = con.sign;
  });
  return { hGap, vGap };
}

function markup(){
  return `<section class="game-root game-futoshiki">
    <div class="game-header">
      <button class="icon-btn" data-action="back">←</button><h2>${t('games.futoshiki.title')}</h2>
      <span class="level-chip" data-role="level"></span>
    </div>
    <div class="hint-row">
      <button class="hint-btn" data-action="hint">💡 <span data-role="hint-count">3</span> ${t('common.hintsSuffix')}</button>
      <div class="timer-chip">⏱ <span data-role="timer">00:00</span></div>
      <button class="reveal-btn" data-action="reveal" title="${t('common.reveal')}">${t('common.revealLabel')}</button>
    </div>
    <div class="cage-style-row" data-role="toggle-strip">
      <div class="toggle-group" title="${t('common.inputModeToggleTitle')}">
        <span class="toggle-name">${t('common.toggleInput')}</span>
        <label class="switch">
          <input type="checkbox" data-action="input-mode" checked aria-label="${t('common.toggleInput')}">
          <span class="slider"></span>
        </label>
      </div>
    </div>
    <div class="futo-wrap">
      <div class="futo-grid" data-role="grid"></div>
      <div class="numpad-backdrop hidden" data-role="backdrop">
        <div class="numpad" data-role="numpad"></div>
      </div>
    </div>
    <div class="grid-actions">
      <button class="btn secondary block" data-action="new">${t('common.newPuzzle')}</button>
      <button class="btn block" data-action="check" disabled>${t('common.check')}</button>
    </div>
    <div class="inline-input hidden" data-role="inline-input">
      <div class="inline-input-toolbar">
        <button class="note-mode-btn" data-action="note-mode" title="${t('common.noteMode')}" aria-label="${t('common.noteMode')}">✏️</button>
        <div class="inline-input-row" data-role="inline-numpad"></div>
      </div>
    </div>
  </section>`;
}

export async function mount(container, appContext){
  if(root) await unmount();
  context = appContext;
  loadStyles();
  container.innerHTML = markup();
  root = container.querySelector('.game-futoshiki');
  bindEvents();
}

function buildNumpad(){
  const el = root.querySelector('[data-role="numpad"]');
  el.innerHTML = '';
  for(let v = 1; v <= game.n; v++){
    const button = document.createElement('button');
    button.textContent = v;
    listen(button, 'click', () => onPopupNumberTap(v));
    el.appendChild(button);
  }
  const noteToggle = document.createElement('button');
  noteToggle.className = 'note-toggle-btn';
  noteToggle.dataset.action = 'note-mode-popup';
  noteToggle.textContent = '✏️';
  noteToggle.title = t('common.noteMode');
  noteToggle.setAttribute('aria-label', t('common.noteMode'));
  listen(noteToggle, 'click', toggleNoteMode);
  el.appendChild(noteToggle);
  const clearButton = document.createElement('button');
  clearButton.className = 'clear-btn';
  clearButton.textContent = t('common.clearField');
  listen(clearButton, 'click', onPopupClearTap);
  el.appendChild(clearButton);
}
function buildInlineNumpad(){
  const el = root.querySelector('[data-role="inline-numpad"]');
  el.innerHTML = '';
  for(let v = 1; v <= game.n; v++){
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
  listen(root.querySelector('[data-action="input-mode"]'), 'change', (event) => {
    if(!game) return;
    game.inputMode = event.target.checked ? 'popup' : 'direct';
    context.preferences.set('inputMode', game.inputMode);
    root.querySelector('[data-role="inline-input"]').classList.toggle('hidden', game.inputMode === 'popup');
    if(game.inputMode === 'popup'){ game.markedValue = null; refreshInlineMarks(); }
  });
  listen(root.querySelector('[data-action="note-mode"]'), 'click', toggleNoteMode);
}

export async function start(level){
  if(!root) throw new Error('Futoshiki muss vor start() gemountet werden.');
  stopTimer();
  // Backlog Punkt 17: siehe games/sudoku/game.js für die Begründung.
  if(game && game.attemptFirstActionAt && !game.counted){
    context.attempts.finish({
      attemptId: game.attemptId, difficulty: game.level.id,
      generatorRef: generatorVersion, schemaRef: saveVersion,
      createdAt: game.attemptCreatedAt, firstActionAt: game.attemptFirstActionAt,
      status: 'abandoned', hintsUsed: game.attemptHintsUsed || 0,
    });
  }
  const puzzle = generateFutoshikiPuzzle(level.n, level.givenCount, level.constraintCount);
  const { hGap, vGap } = gapsFromConstraints(level.n, puzzle.constraints);
  const { mainSize, gapSize } = cellSizeFor(level.n);
  const attempt = context.attempts.begin();
  game = {
    level, n: level.n,
    solution: puzzle.solution, given: puzzle.given, constraints: puzzle.constraints,
    values: puzzle.given.map((row, r) => row.map((isGiven, c) => isGiven ? puzzle.solution[r][c] : 0)),
    hGap, vGap, cellSize: mainSize, gapSize,
    hasInteracted:false, counted:false, activeCell:null,
    inputMode: context.preferences.get('inputMode', 'popup'), markedValue:null,
    elapsedSeconds:0, startedAt:null,
    candidates:emptyCandidates(level.n), noteMode:context.preferences.get('noteMode', false),
    attemptId:attempt.attemptId, attemptCreatedAt:attempt.createdAt,
    attemptFirstActionAt:null, attemptHintsUsed:0,
  };
  applyGameToUi();
  writeSave();
  startTimer();
}

export async function restore(savedState = readSave()){
  if(!validateSave(savedState)) return false;
  const level = LEVELS.find(item => item.id === savedState.levelId);
  const { hGap, vGap } = gapsFromConstraints(savedState.n, savedState.constraints);
  const { mainSize, gapSize } = cellSizeFor(savedState.n);
  const hasAttemptData = typeof savedState.attemptId === 'string';
  const fallbackCreatedAt = Date.now() - savedState.elapsedSeconds * 1000;
  game = {
    level, n: savedState.n,
    solution: savedState.solution, given: savedState.given, constraints: savedState.constraints,
    values: savedState.values,
    hGap, vGap, cellSize: mainSize, gapSize,
    hasInteracted: savedState.hasInteracted, counted: savedState.counted, activeCell:null,
    inputMode: context.preferences.get('inputMode', 'popup'), markedValue:null,
    elapsedSeconds: savedState.elapsedSeconds + Math.max(0, Math.floor((Date.now() - savedState.savedAt) / 1000)),
    startedAt:null,
    candidates: savedState.candidates || emptyCandidates(savedState.n),
    noteMode: context.preferences.get('noteMode', false),
    attemptId: hasAttemptData ? savedState.attemptId : context.attempts.begin().attemptId,
    attemptCreatedAt: hasAttemptData ? savedState.attemptCreatedAt : fallbackCreatedAt,
    attemptFirstActionAt: hasAttemptData ? (savedState.attemptFirstActionAt || null) : (savedState.hasInteracted ? fallbackCreatedAt : null),
    attemptHintsUsed: hasAttemptData ? (savedState.attemptHintsUsed || 0) : 0,
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
  root.querySelector('[data-action="input-mode"]').checked = game.inputMode === 'popup';
  root.querySelector('[data-role="inline-input"]').classList.toggle('hidden', game.inputMode === 'popup');
  refreshHintButton();
  buildNumpad();
  buildInlineNumpad();
  refreshNoteModeUi();
  renderBoard();
  updateCheckButton();
}

function renderBoard(){
  const gridEl = root.querySelector('[data-role="grid"]');
  gridEl.innerHTML = '';
  const n = game.n, main = game.cellSize, gap = game.gapSize;
  const sizes = [];
  for(let i = 0; i < n; i++){ sizes.push(main + 'px'); if(i < n - 1) sizes.push(gap + 'px'); }
  gridEl.style.gridTemplateColumns = sizes.join(' ');
  gridEl.style.gridTemplateRows = sizes.join(' ');
  const fragment = document.createDocumentFragment();
  for(let gr = 0; gr < 2*n - 1; gr++){
    for(let gc = 0; gc < 2*n - 1; gc++){
      const rowIsCell = gr % 2 === 0, colIsCell = gc % 2 === 0;
      const el = document.createElement('div');
      if(rowIsCell && colIsCell){
        const r = gr/2, c = gc/2;
        const isGiven = game.given[r][c];
        el.className = 'futo-cell ' + (isGiven ? 'given' : 'editable');
        el.style.width = main + 'px'; el.style.height = main + 'px';
        el.style.fontSize = Math.max(12, Math.floor(main * 0.45)) + 'px';
        el.dataset.row = r; el.dataset.col = c;
        if(isGiven){
          el.textContent = game.values[r][c];
        } else {
          el.addEventListener('click', () => handleCellTap(r, c, el));
          renderCellContent(r, c, el);
        }
      } else if(rowIsCell && !colIsCell){
        const r = gr/2, c = (gc-1)/2;
        el.className = 'futo-gap';
        el.style.width = gap + 'px'; el.style.height = main + 'px';
        const sign = game.hGap[r][c];
        if(sign) el.innerHTML = `<span>${sign}</span>`;
      } else if(!rowIsCell && colIsCell){
        const r = (gr-1)/2, c = gc/2;
        el.className = 'futo-gap';
        el.style.width = main + 'px'; el.style.height = gap + 'px';
        const sign = game.vGap[r] ? game.vGap[r][c] : null;
        if(sign) el.innerHTML = `<span style="transform:rotate(90deg);">${sign}</span>`;
      } else {
        el.style.width = gap + 'px'; el.style.height = gap + 'px';
      }
      fragment.appendChild(el);
    }
  }
  gridEl.appendChild(fragment);
}

function handleCellTap(r, c, cellEl){
  if(game.inputMode === 'direct'){
    if(game.markedValue === null || game.markedValue === undefined) return;
    game.activeCell = { row:r, col:c, el:cellEl };
    if(game.noteMode){
      if(game.markedValue === 'delete') clearCandidates(r, c);
      else toggleCandidate(r, c, game.markedValue);
    } else {
      setCellValue(game.markedValue === 'delete' ? 0 : game.markedValue);
    }
  } else {
    openNumpad(r, c, cellEl);
  }
}
function openNumpad(r, c, cellEl){
  game.activeCell = { row:r, col:c, el:cellEl };
  root.querySelectorAll('.futo-cell.selected').forEach(el => el.classList.remove('selected'));
  cellEl.classList.add('selected');
  root.querySelector('[data-role="backdrop"]').classList.remove('hidden');
  root.querySelector('[data-role="toggle-strip"]').classList.add('toggles-locked');
}
function closeNumpad(){
  root.querySelector('[data-role="backdrop"]').classList.add('hidden');
  root.querySelector('[data-role="toggle-strip"]').classList.remove('toggles-locked');
  if(game.activeCell) game.activeCell.el.classList.remove('selected');
}
function onPopupNumberTap(v){
  if(!game.activeCell) return;
  if(game.noteMode){
    const { row, col } = game.activeCell;
    toggleCandidate(row, col, v);
    return;
  }
  setCellValue(v);
}
function onPopupClearTap(){
  if(!game.activeCell) return;
  if(game.noteMode){
    const { row, col } = game.activeCell;
    clearCandidates(row, col);
    return;
  }
  setCellValue(0);
}
function setCellValue(v){
  const { row, col, el } = game.activeCell;
  game.values[row][col] = v;
  if(v) game.candidates[row][col] = [];
  markInteracted();
  renderCellContent(row, col, el);
  el.classList.remove('wrong');
  closeNumpad();
  updateCheckButton();
  writeSave();
}
// Backlog: Notizzahlen-Anpassung — Kandidatenbereich richtet sich nach
// game.n (5–9 je Schwierigkeitsstufe), nicht fix 1–9 wie bei Sudoku/Kakuro.
function toggleCandidate(row, col, value){
  if(game.values[row][col]) return;
  const list = game.candidates[row][col];
  const idx = list.indexOf(value);
  if(idx >= 0) list.splice(idx, 1);
  else { list.push(value); list.sort((a,b) => a - b); }
  markInteracted();
  const cellEl = root.querySelector(`.futo-cell[data-row="${row}"][data-col="${col}"]`);
  if(cellEl) renderCellContent(row, col, cellEl);
  writeSave();
}
function clearCandidates(row, col){
  if(!game.candidates[row][col].length) return;
  game.candidates[row][col] = [];
  markInteracted();
  const cellEl = root.querySelector(`.futo-cell[data-row="${row}"][data-col="${col}"]`);
  if(cellEl) renderCellContent(row, col, cellEl);
  writeSave();
}
function toggleNoteMode(){
  game.noteMode = !game.noteMode;
  context.preferences.set('noteMode', game.noteMode);
  refreshNoteModeUi();
}
function refreshNoteModeUi(){
  if(!root || !game) return;
  root.querySelectorAll('[data-action="note-mode"], [data-action="note-mode-popup"]').forEach(btn =>
    btn.classList.toggle('active', game.noteMode)
  );
}
function renderCellContent(row, col, cellEl){
  const value = game.values[row][col];
  if(value){
    cellEl.textContent = value;
    cellEl.classList.remove('has-candidates');
    return;
  }
  const candidates = game.candidates[row][col];
  if(!candidates || !candidates.length){
    cellEl.textContent = '';
    cellEl.classList.remove('has-candidates');
    return;
  }
  cellEl.classList.add('has-candidates');
  cellEl.innerHTML = '<div class="candidate-grid">' +
    Array.from({ length: game.n }, (_, i) => {
      const n = i + 1;
      return `<span class="candidate-slot">${candidates.includes(n) ? n : ''}</span>`;
    }).join('') +
    '</div>';
}
function emptyCandidates(n){
  return Array.from({ length: n }, () => Array.from({ length: n }, () => []));
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
  root.querySelectorAll('.futo-cell').forEach(cell => {
    const r = +cell.dataset.row, c = +cell.dataset.col;
    if(game.given[r][c]) return;
    const correct = game.values[r][c] === game.solution[r][c];
    cell.classList.toggle('wrong', !correct);
    if(!correct) allCorrect = false;
  });
  if(!allCorrect || game.counted) return;
  context.stats.bump('futoshiki', 'won');
  game.counted = true; stopTimer(); clearSave();
  context.attempts.finish({ // Backlog Punkt 17
    attemptId: game.attemptId, difficulty: game.level.id,
    generatorRef: generatorVersion, schemaRef: saveVersion,
    createdAt: game.attemptCreatedAt, firstActionAt: game.attemptFirstActionAt,
    status: 'solved', hintsUsed: game.attemptHintsUsed || 0,
  });
  context.showSuccess(t('game.futoshiki.success'));
}

function refreshHintButton(){
  const remaining = context.hints.remaining('futoshiki');
  root.querySelector('[data-role="hint-count"]').textContent = remaining;
  root.querySelector('[data-action="hint"]').disabled = remaining <= 0;
}
// Tipp und "Lösung anzeigen": in der Vorgänger-Version war hierfür nie ein
// Klick-Handler verdrahtet (die Buttons taten nichts) — hier vollständig
// nachgerüstet, konsistent mit den übrigen Modulen.
function useHint(){
  if(!game) return;
  if(context.hints.remaining('futoshiki') <= 0) return;
  const empty = [];
  for(let r = 0; r < game.n; r++){
    for(let c = 0; c < game.n; c++){
      if(!game.given[r][c] && game.values[r][c] !== game.solution[r][c]) empty.push([r,c]);
    }
  }
  if(!empty.length || !context.hints.consume('futoshiki')) return;
  const [r,c] = empty[Math.floor(Math.random() * empty.length)];
  game.values[r][c] = game.solution[r][c];
  game.candidates[r][c] = [];
  game.attemptHintsUsed = (game.attemptHintsUsed || 0) + 1; // Backlog Punkt 17
  markInteracted();
  renderBoard(); updateCheckButton(); refreshHintButton(); writeSave();
}
function revealSolution(){
  if(!game) return;
  for(let r = 0; r < game.n; r++) for(let c = 0; c < game.n; c++) game.values[r][c] = game.solution[r][c];
  game.candidates = emptyCandidates(game.n);
  markInteracted();
  game.counted = true;
  stopTimer(); clearSave(); renderBoard(); updateCheckButton();
  context.attempts.finish({ // Backlog Punkt 17
    attemptId: game.attemptId, difficulty: game.level.id,
    generatorRef: generatorVersion, schemaRef: saveVersion,
    createdAt: game.attemptCreatedAt, firstActionAt: game.attemptFirstActionAt,
    status: 'revealed', hintsUsed: game.attemptHintsUsed || 0,
  });
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
    button.innerHTML = `<div class="dots">${dots}</div><div class="label"><b>${t(level.labelKey)}</b></div><div class="arrow">›</div>`;
    button.addEventListener('click', () => {
      // Backlog Punkt 17: siehe games/sudoku/game.js für die Begründung.
      if(saved && saved.attemptId && saved.attemptFirstActionAt){
        actions.abandonAttempt({
          attemptId: saved.attemptId, difficulty: saved.levelId,
          generatorRef: generatorVersion, schemaRef: saveVersion,
          createdAt: saved.attemptCreatedAt, firstActionAt: saved.attemptFirstActionAt,
          hintsUsed: saved.attemptHintsUsed || 0,
        });
      }
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
