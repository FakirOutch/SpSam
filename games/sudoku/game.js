import { generatePuzzle } from './generator.js';
import { sudokuBlockLines } from '../../core/sudoku-grid-utils.js';
import { readSave as sharedReadSave, clearSave as sharedClearSave } from '../../core/save-utils.js';
import { t } from '../../core/i18n.js';

export const id = 'sudoku';
export const apiVersion = 1;
export const moduleVersion = 1;
export const saveVersion = 2;
export const generatorVersion = 1;

// label/desc werden erst beim Rendern der Levelauswahl über t() aufgelöst
// (labelKey/descKey), nicht hier beim Modul-Import — sonst bliebe ein
// Sprachwechsel ohne Reload wirkungslos, da LEVELS als Object.freeze()
// einmalig beim ersten Laden des Moduls ausgewertet wird.
export const LEVELS = Object.freeze([
  { id:1, labelKey:'common.difficulty.veryEasy', descKey:'game.sudoku.levels.1.desc', clues:46 },
  { id:2, labelKey:'common.difficulty.easy', descKey:'game.sudoku.levels.2.desc', clues:40 },
  { id:3, labelKey:'common.difficulty.medium', descKey:'game.sudoku.levels.3.desc', clues:34 },
  { id:4, labelKey:'common.difficulty.hard', descKey:'game.sudoku.levels.4.desc', clues:28 },
  { id:5, labelKey:'common.difficulty.expert', descKey:'game.sudoku.levels.5.desc', clues:23 },
]);

const SAVE_KEY = 'arkimis_game_sudoku_v1';
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
  styleElement = document.querySelector('[data-game-style="sudoku"]');
  if(styleElement) return;
  styleElement = document.createElement('link');
  styleElement.rel = 'stylesheet';
  styleElement.href = new URL('./game.css', import.meta.url).href;
  styleElement.dataset.gameStyle = 'sudoku';
  document.head.appendChild(styleElement);
}

function validMatrix(matrix, min = 0, max = 9){
  return Array.isArray(matrix) && matrix.length === 9 && matrix.every(row =>
    Array.isArray(row) && row.length === 9 && row.every(value => Number.isInteger(value) && value >= min && value <= max)
  );
}

export function validateSave(save){
  return !!save && typeof save === 'object' && save.gameId === id &&
    save.saveVersion === saveVersion && Number.isInteger(save.generatorVersion) && save.generatorVersion > 0 &&
    LEVELS.some(level => level.id === save.levelId) && validMatrix(save.puzzle) &&
    validMatrix(save.solution) && validMatrix(save.values) &&
    typeof save.elapsedSeconds === 'number' && save.elapsedSeconds >= 0 &&
    typeof save.savedAt === 'number' && save.savedAt > 0 &&
    typeof save.counted === 'boolean' &&
    typeof save.hasInteracted === 'boolean';
}

// Prüft, ob sich der aktuelle Spielstand (values) irgendwo von den
// ursprünglichen Vorgaben (puzzle) unterscheidet — dient nur der Migration
// weiter unten, um hasInteracted für ältere Speicherstände nachträglich
// abzuleiten, da diese das Feld noch nicht kannten.
function valuesDifferFromPuzzle(puzzle, values){
  if(!Array.isArray(puzzle) || !Array.isArray(values) || puzzle.length !== values.length) return false;
  for(let r = 0; r < puzzle.length; r++){
    const puzzleRow = puzzle[r], valuesRow = values[r];
    if(!Array.isArray(puzzleRow) || !Array.isArray(valuesRow) || puzzleRow.length !== valuesRow.length) return false;
    for(let c = 0; c < puzzleRow.length; c++){
      if(puzzleRow[c] !== valuesRow[c]) return true;
    }
  }
  return false;
}

// Migriert einen Speicherstand im alten Format (saveVersion 1, ohne
// hasInteracted) auf das aktuelle Format (saveVersion 2). hasInteracted wird
// dabei aus dem vorhandenen Spielstand abgeleitet: true, wenn sich values
// bereits irgendwo von puzzle unterscheidet, sonst false. Andere
// saveVersion-Werte bleiben unverändert — dafür ist keine Migration bekannt,
// validateSave() lehnt sie danach wie gewohnt ab.
//
// Folgt dem Vertrag von core/save-utils.js: liefert IMMER { value, migrated },
// niemals nur den Wert direkt — das macht die Migrationsabsicht explizit,
// statt sie implizit über Objekt-Referenzgleichheit erraten zu lassen.
function migrateSave(save){
  if(!save || typeof save !== 'object' || save.saveVersion !== 1){
    return { value: save, migrated: false };
  }
  return {
    value: {
      ...save,
      saveVersion: 2,
      hasInteracted: valuesDifferFromPuzzle(save.puzzle, save.values),
    },
    migrated: true,
  };
}

function readSave(){
  return sharedReadSave(SAVE_KEY, { migrate: migrateSave, validate: validateSave });
}

function writeSave(){
  if(!game) return;
  if(game.counted){ clearSave(); return; }
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    gameId:id, saveVersion, generatorVersion, levelId:game.level.id,
    puzzle:game.puzzle, solution:game.solution, values:game.values,
    hasInteracted:game.hasInteracted,
    elapsedSeconds:currentElapsed(), savedAt:Date.now(), counted:game.counted,
    // Backlog Punkt 17 — additive Felder, ältere Speicherstände ohne sie
    // bleiben gültig (siehe restore()-Fallback).
    attemptId:game.attemptId, attemptCreatedAt:game.attemptCreatedAt,
    attemptFirstActionAt:game.attemptFirstActionAt, attemptHintsUsed:game.attemptHintsUsed,
    // Backlog: Notizzahlen-Anpassung — additiv, ältere Speicherstände ohne
    // dieses Feld bleiben gültig (siehe restore()-Fallback). noteMode
    // selbst wird NICHT gespeichert (folgt wie highlightEnabled/inputMode
    // einer geräteweiten Präferenz, kein Teil des einzelnen Spielstands).
    candidates:game.candidates,
  }));
}

function clearSave(){ sharedClearSave(SAVE_KEY); }

// Globale Zählregel (für alle sieben Spiele einheitlich): NICHT das
// Öffnen/Starten eines Rätsels zählt als Fehlversuch, sondern die ERSTE
// spielrelevante Aktion darin — dann sofort und genau einmal +1 "gespielt".
// Weitere Aktionen im selben Rätsel, Abbrechen, Neu mischen, "Neues Spiel"
// oder Fortsetzen lösen keine weitere Zählung aus. Wird sofort gespeichert,
// damit auch ein Fortsetzen nach dem ersten Zug nicht erneut zählen kann.
function markInteracted(){
  if(game.hasInteracted) return;
  game.hasInteracted = true;
  if(!game.attemptFirstActionAt) game.attemptFirstActionAt = Date.now(); // Backlog Punkt 17
  context.stats.bump('sudoku', 'played');
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
  return `<section class="game-root game-sudoku">
    <div class="sudoku-module-header">
      <button class="icon-btn" data-action="back">←</button><h2>${t('games.sudoku.title')}</h2>
      <span class="level-chip" data-role="level"></span>
    </div>
    <div class="hint-row">
      <button class="hint-btn" data-action="hint">💡 <span data-role="hint-count">3</span> ${t('common.hintsSuffix')}</button>
      <div class="timer-chip">⏱ <span data-role="timer">00:00</span></div>
      <button class="reveal-btn" data-action="reveal" title="${t('common.reveal')}">${t('common.revealLabel')}</button>
    </div>
    <div class="cage-style-row" data-role="toggle-strip">
      <div class="toggle-group"><span class="toggle-name">${t('common.toggleFocus')}</span>
        <label class="switch"><input type="checkbox" data-action="highlight" aria-label="${t('common.toggleFocus')}"><span class="slider"></span></label>
      </div>
      <div class="toggle-group"><span class="toggle-name">${t('common.toggleInput')}</span>
        <label class="switch"><input type="checkbox" data-action="input-mode" aria-label="${t('common.toggleInput')}"><span class="slider"></span></label>
      </div>
    </div>
    <div class="sudoku-module-wrap"><div class="sudoku-module-ratio">
      <div class="sudoku-module-grid" data-role="grid"></div>
      <div class="sudoku-module-numpad-backdrop hidden" data-role="backdrop"><div class="numpad" data-role="numpad"></div></div>
    </div></div>
    <div class="grid-actions"><button class="btn secondary block" data-action="new">${t('common.newPuzzle')}</button>
      <button class="btn block" data-action="check" disabled>${t('common.check')}</button></div>
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
  root = container.querySelector('.game-sudoku');
  buildPopupNumpad();
  buildInlineNumpad();
  bindEvents();
}

// Popup-Zifferblock (Variante 1). Reihe 4 (Backlog: Notizzahlen-Anpassung):
// Notiz-Umschalter (1×1, unten links) + vergrößertes Löschfeld (2×1) —
// dieselbe Reihe wie zuvor nur das Löschfeld allein belegte.
function buildPopupNumpad(){
  const popup = root.querySelector('[data-role="numpad"]');
  for(let value = 1; value <= 9; value++){
    const button = document.createElement('button');
    button.textContent = value;
    listen(button, 'click', () => onPopupNumberTap(value));
    popup.appendChild(button);
  }
  const noteToggle = document.createElement('button');
  noteToggle.className = 'note-toggle-btn';
  noteToggle.dataset.action = 'note-mode-popup';
  noteToggle.textContent = '✏️';
  noteToggle.title = t('common.noteMode');
  noteToggle.setAttribute('aria-label', t('common.noteMode'));
  listen(noteToggle, 'click', toggleNoteMode);
  popup.appendChild(noteToggle);
  const clear = document.createElement('button');
  clear.className = 'clear-btn'; clear.textContent = t('common.clearField');
  listen(clear, 'click', onPopupClearTap);
  popup.appendChild(clear);
}

// Feste Zahlenreihe (Variante 2) — 1–9 plus Löschfeld als zehntes Element,
// alle zehn als gleichrangige Geschwister in EINER Reihe (kein Umbruch,
// kein separater Button darunter). Endgültige Optik (Farben, Abstände,
// Form des Löschfelds) bleibt bewusst der späteren Designrunde vorbehalten
// — hier zählt nur die Funktion: Ziffer setzt den Wert, Löschfeld leert ihn.
function buildInlineNumpad(){
  const row = root.querySelector('[data-role="inline-numpad"]');
  for(let value = 1; value <= 9; value++){
    const button = document.createElement('button');
    button.textContent = value;
    listen(button, 'click', () => markInlineValue(value));
    row.appendChild(button);
  }
  const deleteButton = document.createElement('button');
  deleteButton.textContent = '⌫';
  deleteButton.dataset.action = 'inline-delete';
  listen(deleteButton, 'click', () => markInlineValue('delete'));
  row.appendChild(deleteButton);
}

function bindEvents(){
  listen(root.querySelector('[data-action="back"]'), 'click', async () => {
    writeSave(); await context.goToLevels();
  });
  listen(root.querySelector('[data-action="new"]'), 'click', () => start(game.level));
  listen(root.querySelector('[data-action="check"]'), 'click', checkPuzzle);
  listen(root.querySelector('[data-action="hint"]'), 'click', useHint);
  listen(root.querySelector('[data-action="reveal"]'), 'click', revealSolution);
  listen(root.querySelector('[data-action="highlight"]'), 'change', event => {
    game.highlightEnabled = event.target.checked;
    context.preferences.set('highlight', game.highlightEnabled);
    if(game.activeCell){
      highlight(game.activeCell.row, game.activeCell.col);
    }
  });
  listen(root.querySelector('[data-action="input-mode"]'), 'change', event => {
    game.inputMode = event.target.checked ? 'popup' : 'direct';
    context.preferences.set('inputMode', game.inputMode);
    root.querySelector('[data-role="inline-input"]').classList.toggle('hidden', game.inputMode === 'popup');
    closeNumpad(); refreshInlineMarks();
  });
  listen(root.querySelector('[data-action="note-mode"]'), 'click', toggleNoteMode);
  listen(root.querySelector('[data-role="backdrop"]'), 'click', event => {
    if(event.target === event.currentTarget) closeNumpad();
  });
}

function emptyCandidates(){
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => []));
}

export async function start(level){
  if(!root) throw new Error('Sudoku muss vor start() gemountet werden.');
  stopTimer();
  // Backlog Punkt 17: "Neu mischen" ersetzt ein evtl. laufendes Rätsel
  // durch ein neues — der alte Versuch wird genau einmal als "abandoned"
  // abgeschlossen, aber NUR, wenn er überhaupt eine reguläre Aktion hatte
  // (sonst zählt er laut Vorgabe gar nicht erst). Der Fall "Stufenwechsel
  // aus der Levelliste" wird separat in renderLevelsList() behandelt, da
  // dort game bereits null ist (frischer mount()).
  if(game && game.attemptFirstActionAt && !game.counted){
    context.attempts.finish({
      attemptId: game.attemptId, difficulty: game.level.id,
      generatorRef: generatorVersion, schemaRef: saveVersion,
      createdAt: game.attemptCreatedAt, firstActionAt: game.attemptFirstActionAt,
      status: 'abandoned', hintsUsed: game.attemptHintsUsed || 0,
    });
  }
  const generated = generatePuzzle(level.clues);
  const attempt = context.attempts.begin();
  game = {
    level, puzzle:generated.puzzle, solution:generated.solution,
    values:generated.puzzle.map(row => row.slice()), activeCell:null,
    counted:false, hasInteracted:false, elapsedSeconds:0, startedAt:null,
    highlightEnabled:context.preferences.get('highlight', false),
    inputMode:context.preferences.get('inputMode', 'popup'), markedValue:null,
    candidates:emptyCandidates(), noteMode:context.preferences.get('noteMode', false),
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
  // Backlog Punkt 17: ältere Speicherstände ohne attemptId bekommen einen
  // best-effort nachträglich erzeugten Versuch (Rückwärtskompatibilität —
  // kein Absturz, keine verlorene Fortsetzbarkeit, nur ohne exakt
  // rekonstruierbare ursprüngliche Anzeigezeit).
  const hasAttemptData = typeof savedState.attemptId === 'string';
  const fallbackCreatedAt = Date.now() - savedState.elapsedSeconds * 1000;
  game = {
    level, puzzle:savedState.puzzle, solution:savedState.solution, values:savedState.values,
    activeCell:null, counted:savedState.counted, hasInteracted:savedState.hasInteracted,
    elapsedSeconds:savedState.elapsedSeconds + Math.max(0, Math.floor((Date.now() - savedState.savedAt) / 1000)),
    startedAt:null, highlightEnabled:context.preferences.get('highlight', false),
    inputMode:context.preferences.get('inputMode', 'popup'), markedValue:null,
    // Backlog: Notizzahlen-Anpassung — ältere Speicherstände ohne
    // Kandidatenfeld bekommen ein leeres Raster (additive Erweiterung,
    // bricht validateSave() nicht, siehe dort).
    candidates: savedState.candidates || emptyCandidates(),
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
  root.querySelector('[data-action="highlight"]').checked = game.highlightEnabled;
  root.querySelector('[data-action="input-mode"]').checked = game.inputMode === 'popup';
  root.querySelector('[data-role="inline-input"]').classList.toggle('hidden', game.inputMode === 'popup');
  root.querySelector('[data-role="timer"]').textContent = formatTime(game.elapsedSeconds);
  const reveal = root.querySelector('[data-action="reveal"]');
  reveal.title = t('common.reveal'); reveal.disabled = false; reveal.classList.remove('used');
  refreshHintButton(); refreshInlineMarks(); refreshNoteModeUi(); renderGrid(); updateCheckButton();
}

function renderGrid(){
  const grid = root.querySelector('[data-role="grid"]');
  grid.innerHTML = '';
  for(let row = 0; row < 9; row++){
    for(let col = 0; col < 9; col++){
      const given = game.puzzle[row][col] !== 0;
      const cell = document.createElement('div');
      cell.className = `sudoku-module-cell ${given ? 'given' : 'editable'}`;
      cell.dataset.row = row; cell.dataset.col = col;
      cell.style.setProperty('--lines', sudokuBlockLines(row, col).join(', '));
      if(given) cell.textContent = game.values[row][col];
      else renderCellContent(row, col, cell);
      if(!given) listen(cell, 'click', () => handleCellTap(row, col, cell));
      grid.appendChild(cell);
    }
  }
}

// Backlog: Notizzahlen-Anpassung. Zeigt entweder die gesetzte Lösungszahl,
// ein kleines 3×3-Kandidatenraster (nur belegte Positionen sichtbar) oder
// ein leeres Feld. Kandidaten sind rein visuell — siehe toggleCandidate().
function renderCellContent(row, col, cell){
  const value = game.values[row][col];
  if(value){
    cell.textContent = value;
    cell.classList.remove('has-candidates');
    return;
  }
  const candidates = game.candidates[row][col];
  if(!candidates || !candidates.length){
    cell.textContent = '';
    cell.classList.remove('has-candidates');
    return;
  }
  cell.classList.add('has-candidates');
  cell.innerHTML = '<div class="candidate-grid">' +
    Array.from({ length: 9 }, (_, i) => {
      const n = i + 1;
      return `<span class="candidate-slot">${candidates.includes(n) ? n : ''}</span>`;
    }).join('') +
    '</div>';
}

function handleCellTap(row, col, cell){
  if(game.inputMode === 'direct'){
    if(game.markedValue === null) return;
    game.activeCell = { row, col, cell };
    if(game.noteMode){
      if(game.markedValue === 'delete') clearCandidates(row, col);
      else toggleCandidate(row, col, game.markedValue);
    } else {
      setCellValue(game.markedValue === 'delete' ? 0 : game.markedValue);
    }
    highlight(row, col);
    return;
  }
  game.activeCell = { row, col, cell };
  cell.classList.add('selected');
  root.querySelector('[data-role="backdrop"]').classList.remove('hidden');
  root.querySelector('[data-role="toggle-strip"]').classList.add('toggles-locked');
  highlight(row, col);
}

// Popup-Zifferblock: im Notizmodus wird die Zahl als Kandidat ein-/
// ausgetragen und das Popup bleibt offen (mehrere Kandidaten nacheinander
// möglich); ohne Notizmodus unverändertes Verhalten (Wert setzen, Popup
// schließt). Backlog: Notizzahlen-Anpassung.
function onPopupNumberTap(value){
  if(!game.activeCell) return;
  if(game.noteMode){
    const { row, col } = game.activeCell;
    toggleCandidate(row, col, value);
    return;
  }
  setCellValue(value);
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

function setCellValue(value){
  if(!game.activeCell) return;
  const { row, col, cell } = game.activeCell;
  game.values[row][col] = value;
  // Eine gesetzte Lösungszahl verwirft die Kandidaten dieses Feldes
  // (Backlog: Notizzahlen-Anpassung) — nur beim Setzen eines echten Werts,
  // nicht beim Löschen (value===0 lässt evtl. vorhandene Kandidaten in Ruhe).
  if(value) game.candidates[row][col] = [];
  markInteracted();
  renderCellContent(row, col, cell);
  cell.classList.remove('wrong');
  closeNumpad(); updateCheckButton(); writeSave();
}

// Backlog: Notizzahlen-Anpassung — Kandidaten sind reine Spielerhilfe,
// fließen nie in Prüfen/Solver/Statistik ein (siehe checkPuzzle()).
function toggleCandidate(row, col, value){
  if(game.values[row][col]) return; // Kandidaten nur auf leeren Feldern sinnvoll
  const list = game.candidates[row][col];
  const idx = list.indexOf(value);
  if(idx >= 0) list.splice(idx, 1);
  else { list.push(value); list.sort((a,b) => a - b); }
  markInteracted();
  const cell = root.querySelector(`.sudoku-module-cell[data-row="${row}"][data-col="${col}"]`);
  if(cell) renderCellContent(row, col, cell);
  writeSave();
}
function clearCandidates(row, col){
  if(!game.candidates[row][col].length) return;
  game.candidates[row][col] = [];
  markInteracted();
  const cell = root.querySelector(`.sudoku-module-cell[data-row="${row}"][data-col="${col}"]`);
  if(cell) renderCellContent(row, col, cell);
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

function closeNumpad(){
  if(!root) return;
  root.querySelector('[data-role="backdrop"]').classList.add('hidden');
  root.querySelector('[data-role="toggle-strip"]').classList.remove('toggles-locked');
  root.querySelectorAll('.sudoku-module-cell.selected').forEach(cell => cell.classList.remove('selected'));
  clearHighlights();
  if(game) game.activeCell = null;
}

function highlight(row, col){
  clearHighlights();
  if(!game.highlightEnabled) return;
  root.querySelectorAll('.sudoku-module-cell').forEach(cell => {
    const r = Number(cell.dataset.row), c = Number(cell.dataset.col);
    if((r === row || c === col) && !(r === row && c === col)) cell.classList.add('rc-highlight');
  });
}

function clearHighlights(){
  if(root) root.querySelectorAll('.rc-highlight').forEach(cell => cell.classList.remove('rc-highlight'));
}

function markInlineValue(value){
  game.markedValue = game.markedValue === value ? null : value;
  refreshInlineMarks();
}

function refreshInlineMarks(){
  if(!root || !game) return;
  root.querySelectorAll('[data-role="inline-numpad"] button').forEach(button =>
    button.classList.toggle('marked', game.markedValue === Number(button.textContent))
  );
  const deleteButton = root.querySelector('[data-action="inline-delete"]');
  if(deleteButton) deleteButton.classList.toggle('marked', game.markedValue === 'delete');
}

function updateCheckButton(){
  root.querySelector('[data-action="check"]').disabled = !game.values.every(row => row.every(Boolean));
}

function checkPuzzle(){
  let correct = true;
  root.querySelectorAll('.sudoku-module-cell.editable').forEach(cell => {
    const row = Number(cell.dataset.row), col = Number(cell.dataset.col);
    const cellCorrect = game.values[row][col] === game.solution[row][col];
    cell.classList.toggle('wrong', !cellCorrect);
    correct = correct && cellCorrect;
  });
  if(!correct || game.counted) return;
  context.stats.bump('sudoku', 'won');
  game.counted = true; stopTimer(); clearSave();
  context.attempts.finish({ // Backlog Punkt 17
    attemptId: game.attemptId, difficulty: game.level.id,
    generatorRef: generatorVersion, schemaRef: saveVersion,
    createdAt: game.attemptCreatedAt, firstActionAt: game.attemptFirstActionAt,
    status: 'solved', hintsUsed: game.attemptHintsUsed || 0,
  });
  context.showSuccess(t('game.sudoku.success'));
}

function refreshHintButton(){
  const remaining = context.hints.remaining('sudoku');
  root.querySelector('[data-role="hint-count"]').textContent = remaining;
  root.querySelector('[data-action="hint"]').disabled = remaining <= 0;
}

function useHint(){
  if(context.hints.remaining('sudoku') <= 0) return;
  const candidates = [];
  for(let row = 0; row < 9; row++) for(let col = 0; col < 9; col++){
    if(!game.puzzle[row][col] && game.values[row][col] !== game.solution[row][col]) candidates.push([row,col]);
  }
  if(!candidates.length || !context.hints.consume('sudoku')) return;
  const [row,col] = candidates[Math.floor(Math.random() * candidates.length)];
  game.values[row][col] = game.solution[row][col];
  game.candidates[row][col] = []; // echter Wert gesetzt -> Kandidaten dieses Felds verwerfen
  game.attemptHintsUsed = (game.attemptHintsUsed || 0) + 1; // Backlog Punkt 17
  markInteracted();
  renderGrid(); updateCheckButton(); refreshHintButton(); writeSave();
}

function revealSolution(){
  game.values = game.solution.map(row => row.slice());
  game.candidates = emptyCandidates(); // alle Felder sind jetzt gefüllt, Kandidaten sind hinfällig
  markInteracted();
  game.counted = true;
  stopTimer(); clearSave(); renderGrid(); updateCheckButton();
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
      // Backlog Punkt 17: nur abschließen, wenn der pausierte Stand
      // überhaupt eine reguläre Aktion hatte — ein nie angefasstes
      // Rätsel zählt laut Vorgabe nicht als abgebrochener Versuch.
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
