import { computeClues, cellSizeFor } from './generator.js';
import { t } from '../../core/i18n.js';

export const id = 'kakuro';
export const apiVersion = 1;
export const moduleVersion = 1;
export const saveVersion = 1;
export const generatorVersion = 1;

export const LEVELS = Object.freeze([
  { id:1, labelKey:'common.difficulty.veryEasy', descKey:'game.kakuro.levels.1.desc', size:7,  blackRatio:0.22, stepBudget:15000 },
  { id:2, labelKey:'common.difficulty.easy',      descKey:'game.kakuro.levels.2.desc', size:9,  blackRatio:0.25, stepBudget:25000 },
  { id:3, labelKey:'common.difficulty.medium',    descKey:'game.kakuro.levels.3.desc', size:11, blackRatio:0.27, stepBudget:35000 },
  { id:4, labelKey:'common.difficulty.hard',      descKey:'game.kakuro.levels.4.desc', size:12, blackRatio:0.29, stepBudget:45000 },
  { id:5, labelKey:'common.difficulty.expert',    descKey:'game.kakuro.levels.5.desc', size:13, blackRatio:0.31, stepBudget:60000 },
]);

const SAVE_KEY = 'arkimis_game_kakuro_v1';

let root = null;
let context = null;
let game = null;
let timerInterval = null;
let styleElement = null;
let listeners = [];
let activeAbortController = null;     // steuert den Abbruch der Vordergrund-Generierung (start())
let backgroundAbortController = null; // steuert den Abbruch der Hintergrund-Nachproduktion (Cache-Vorrat)

function listen(element, eventName, handler){
  element.addEventListener(eventName, handler);
  listeners.push(() => element.removeEventListener(eventName, handler));
}

function loadStyles(){
  styleElement = document.querySelector('[data-game-style="kakuro"]');
  if(styleElement) return;
  styleElement = document.createElement('link');
  styleElement.rel = 'stylesheet';
  styleElement.href = new URL('./game.css', import.meta.url).href;
  styleElement.dataset.gameStyle = 'kakuro';
  document.head.appendChild(styleElement);
}

/* ---------- Validierung eines gespeicherten Spielstands ---------- */
function validGrid(grid, size){
  return Array.isArray(grid) && grid.length === size && grid.every(row =>
    Array.isArray(row) && row.length === size && row.every(cell => cell === 'white' || cell === 'black')
  );
}
function validNumberMatrix(matrix, size, min, max){
  return Array.isArray(matrix) && matrix.length === size && matrix.every(row =>
    Array.isArray(row) && row.length === size && row.every(v => Number.isInteger(v) && v >= min && v <= max)
  );
}
function validBoolMatrix(matrix, size){
  return Array.isArray(matrix) && matrix.length === size && matrix.every(row =>
    Array.isArray(row) && row.length === size && row.every(v => typeof v === 'boolean')
  );
}
function validRuns(runs, size){
  return Array.isArray(runs) && runs.length > 0 && runs.every(run =>
    run && typeof run === 'object' && typeof run.horizontal === 'boolean' &&
    Array.isArray(run.cells) && run.cells.length >= 2 &&
    run.cells.every(cell => cell && Number.isInteger(cell.r) && Number.isInteger(cell.c) &&
      cell.r >= 0 && cell.r < size && cell.c >= 0 && cell.c < size)
  );
}
export function validateSave(save){
  if(!save || typeof save !== 'object') return false;
  if(save.gameId !== id || save.saveVersion !== saveVersion) return false;
  if(!Number.isInteger(save.generatorVersion) || save.generatorVersion <= 0) return false;
  if(!LEVELS.some(level => level.id === save.levelId)) return false;
  if(!Number.isInteger(save.size) || save.size < 5) return false;
  if(!validGrid(save.grid, save.size)) return false;
  if(!validRuns(save.runs, save.size)) return false;
  if(!validNumberMatrix(save.solution, save.size, 0, 9)) return false;
  if(!validBoolMatrix(save.given, save.size)) return false;
  if(!validNumberMatrix(save.values, save.size, 0, 9)) return false;
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
    size:game.size, grid:game.grid, runs:game.runs, solution:game.solution,
    given:game.given, values:game.values,
    hasInteracted:game.hasInteracted, counted:game.counted,
    elapsedSeconds:currentElapsed(), savedAt:Date.now(),
  }));
}
function clearSave(){ localStorage.removeItem(SAVE_KEY); }

// Globale Zählregel (für alle sieben Spiele einheitlich): siehe
// games/sudoku/game.js für die vollständige Begründung.
function markInteracted(){
  if(game.hasInteracted) return;
  game.hasInteracted = true;
  context.stats.bump('kakuro', 'played');
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
  return `<section class="game-root game-kakuro">
    <div class="game-header">
      <button class="icon-btn" data-action="back">←</button><h2>${t('games.kakuro.title')}</h2>
      <span class="level-chip" data-role="level"></span>
    </div>
    <div class="hint-row">
      <button class="hint-btn" data-action="hint">💡 <span data-role="hint-count">3</span> ${t('common.hintsSuffix')}</button>
      <div class="timer-chip">⏱ <span data-role="timer">00:00</span></div>
      <button class="reveal-btn" data-action="reveal" title="${t('common.reveal')}" aria-label="${t('common.reveal')}">🔍</button>
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
    <div class="kakuro-wrap">
      <div class="kakuro-grid" data-role="grid"></div>
      <div class="numpad-backdrop hidden" data-role="backdrop">
        <div class="numpad" data-role="numpad"></div>
      </div>
    </div>
    <div class="grid-actions">
      <button class="btn secondary block" data-action="new">${t('common.newPuzzle')}</button>
      <button class="btn block" data-action="check" disabled>${t('common.check')}</button>
    </div>
    <div class="inline-input hidden" data-role="inline-input">
      <div class="numpad" data-role="inline-numpad"></div>
      <button class="inline-delete-btn" data-action="inline-delete">🗑️ ${t('common.deleteNumber')}</button>
    </div>
  </section>`;
}

export async function mount(container, appContext){
  if(root) await unmount();
  context = appContext;
  loadStyles();
  container.innerHTML = markup();
  root = container.querySelector('.game-kakuro');
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
  listen(root.querySelector('[data-action="inline-delete"]'), 'click', () => {
    if(!game) return;
    game.markedValue = game.markedValue === 'delete' ? null : 'delete';
    refreshInlineMarks();
  });
}

// Führt die Generierung im Worker aus und liefert eine Promise, die entweder
// mit dem fertigen Rätsel erfüllt oder — bei Abbruch über das AbortSignal —
// mit einem Fehler namens "AbortError" verworfen wird. Der Worker bekommt
// NIE Zugriff auf Speicher/DOM (siehe generator.worker.js) — er liefert
// ausschließlich das fertige Ergebnis zurück, alles andere (Speichern,
// Rendern, Cachen) bleibt hier im Hauptthread. Bewusst OHNE geteilte
// Worker-Referenz — Vordergrund (start()) und Hintergrund (Cache-
// Nachproduktion) können dadurch unabhängig voneinander laufen, ohne sich
// gegenseitig zu überschreiben.
let requestCounter = 0;
const GENERATION_TIME_BUDGET_MS = 10000;
function generateInWorker(level, signal){
  return new Promise((resolve, reject) => {
    if(signal.aborted){
      const err = new Error('Generierung abgebrochen'); err.name = 'AbortError';
      reject(err); return;
    }
    const requestId = ++requestCounter;
    const worker = new Worker(new URL('./generator.worker.js', import.meta.url), { type:'module' });

    function cleanup(){
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    }
    function onMessage(event){
      const data = event.data || {};
      if(data.requestId !== requestId) return; // Antwort einer bereits verworfenen, älteren Anfrage
      cleanup();
      worker.terminate();
      if(data.type === 'generated') resolve(data.puzzle);
      else reject(new Error(data.message || 'Unbekannter Fehler im Generator-Worker.'));
    }
    function onError(event){
      cleanup();
      worker.terminate();
      reject(new Error('Worker-Fehler: ' + (event.message || 'unbekannt')));
    }
    function onAbort(){
      cleanup();
      worker.terminate(); // sofortiger, sauberer Abbruch — der Worker hat nie etwas gespeichert
      const err = new Error('Generierung abgebrochen'); err.name = 'AbortError';
      reject(err);
    }
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort, { once:true });
    worker.postMessage({
      command:'generate', requestId,
      size:level.size, blackRatio:level.blackRatio, stepBudget:level.stepBudget,
      timeBudgetMs: GENERATION_TIME_BUDGET_MS,
    });
  });
}

function cancelActiveGeneration(){
  if(activeAbortController){ activeAbortController.abort(); activeAbortController = null; }
}
function cancelBackgroundGeneration(){
  if(backgroundAbortController){ backgroundAbortController.abort(); backgroundAbortController = null; }
}

/* ---------- Rätsel-Vorrat: 1–3 fertige Rätsel je Stufe lokal zwischen-
   speichern, damit ein Rätselstart meist ohne Wartezeit möglich ist. ---- */
const CACHE_KEY = 'arkimis_kakuro_puzzle_cache_v1';
const CACHE_TARGET_PER_LEVEL = 3;

function readCacheStore(){
  try{
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY));
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  }catch(_error){
    return {}; // beschädigter Cache-Inhalt wird stillschweigend verworfen, kein Absturz
  }
}
function writeCacheStore(store){
  try{ localStorage.setItem(CACHE_KEY, JSON.stringify(store)); }catch(_error){ /* Speicher voll o.ä. — Cache ist nur eine Beschleunigung, kein Muss */ }
}
// Strukturprüfung eines Cache-Eintrags — bewusst ähnlich streng wie
// validateSave(), da auch Cache-Daten beschädigt/veraltet sein können.
function validCacheEntry(entry, level){
  if(!entry || typeof entry !== 'object') return false;
  if(entry.generatorVersion !== generatorVersion) return false; // Generator hat sich seitdem geändert
  const puzzle = entry.puzzle;
  if(!puzzle || typeof puzzle !== 'object') return false;
  if(puzzle.size !== level.size) return false;
  if(!Array.isArray(puzzle.grid) || !Array.isArray(puzzle.runs) || !Array.isArray(puzzle.board) || !Array.isArray(puzzle.given)) return false;
  return true;
}
function cacheListFor(store, levelId){
  return Array.isArray(store[levelId]) ? store[levelId] : [];
}
function takeCachedPuzzle(level){
  const store = readCacheStore();
  const list = cacheListFor(store, level.id);
  const validList = list.filter(entry => validCacheEntry(entry, level));
  if(validList.length !== list.length){ store[level.id] = validList; writeCacheStore(store); } // beschädigte/veraltete Einträge aufräumen
  if(validList.length === 0) return null;
  const [taken, ...rest] = validList;
  store[level.id] = rest;
  writeCacheStore(store);
  return taken.puzzle;
}
function addPuzzleToCache(level, puzzle){
  const store = readCacheStore();
  const list = cacheListFor(store, level.id).filter(entry => validCacheEntry(entry, level));
  if(list.length >= CACHE_TARGET_PER_LEVEL) return;
  list.push({ generatorVersion, puzzle, createdAt: Date.now() });
  store[level.id] = list;
  writeCacheStore(store);
}
function cachedCountFor(level){
  const store = readCacheStore();
  return cacheListFor(store, level.id).filter(entry => validCacheEntry(entry, level)).length;
}

// Füllt den Vorrat für eine Stufe unsichtbar im Hintergrund nach, EIN
// Rätsel nach dem anderen, bis das Ziel erreicht ist oder das Modul
// inzwischen verlassen wurde (root === null). Läuft nie parallel zu sich
// selbst (backgroundAbortController als einfache "läuft bereits"-Sperre)
// und blockiert nie die Vordergrund-Generierung, da beide unabhängige
// Worker-Instanzen verwenden.
function refillCacheInBackground(level){
  if(backgroundAbortController) return; // schon eine Nachproduktion aktiv
  if(cachedCountFor(level) >= CACHE_TARGET_PER_LEVEL) return;
  const controller = new AbortController();
  backgroundAbortController = controller;
  generateInWorker(level, controller.signal)
    .then(puzzle => {
      if(controller.signal.aborted) return; // Modul inzwischen verlassen — nicht mehr cachen
      addPuzzleToCache(level, puzzle);
    })
    .catch(() => { /* AbortError = normal (Modul verlassen); andere Fehler: niemand wartet aktiv, still ignorieren */ })
    .finally(() => {
      if(backgroundAbortController === controller) backgroundAbortController = null;
      if(root) refillCacheInBackground(level); // weiter auffüllen, sofern das Modul noch aktiv ist
    });
}

export async function start(level){
  if(!root) throw new Error('Kakuro muss vor start() gemountet werden.');
  stopTimer();
  cancelActiveGeneration(); // z.B. schnelles zweifaches "Neu mischen"

  const cached = takeCachedPuzzle(level);
  let puzzle;
  if(cached){
    puzzle = cached; // sofort verfügbar — keine Ladeanzeige nötig, kein Warten
  } else {
    const controller = new AbortController();
    activeAbortController = controller;
    context.loading.show(t('loading.generating'));
    try{
      puzzle = await generateInWorker(level, controller.signal);
    }catch(error){
      if(error && error.name === 'AbortError') return; // sauber abgebrochen, kein Fehlerzustand
      throw error;
    }finally{
      if(activeAbortController === controller) activeAbortController = null;
      // context kann bereits null sein, wenn unmount() WÄHREND der laufenden
      // Generierung aufgerufen wurde (z.B. Zurück-Knopf mitten in der
      // Generierung) — unmount() hat dann bereits selbst context.loading.hide()
      // aufgerufen, bevor context genullt wurde. Hier nur noch defensiv, für
      // den Fall, dass start() aus einem anderen Grund als Abbruch endet.
      if(context && context.loading) context.loading.hide();
    }
  }

  const clue = computeClues(puzzle.grid, puzzle.size, puzzle.runs, puzzle.board);
  game = {
    level, size:puzzle.size, grid:puzzle.grid, runs:puzzle.runs, solution:puzzle.board,
    clue, given:puzzle.given,
    values: puzzle.given.map((row, r) => row.map((isGiven, c) => isGiven ? puzzle.board[r][c] : 0)),
    cellSize: cellSizeFor(puzzle.size),
    hasInteracted:false, counted:false, activeCell:null,
    inputMode: context.preferences.get('inputMode', 'popup'), markedValue:null,
    elapsedSeconds:0, startedAt:null,
  };
  applyGameToUi();
  writeSave();
  startTimer();

  refillCacheInBackground(level); // bewusst nicht awaiten — läuft unsichtbar nebenbei
}

export async function restore(savedState = readSave()){
  if(!validateSave(savedState)) return false;
  const level = LEVELS.find(item => item.id === savedState.levelId);
  const clue = computeClues(savedState.grid, savedState.size, savedState.runs, savedState.solution);
  game = {
    level, size:savedState.size, grid:savedState.grid, runs:savedState.runs, solution:savedState.solution,
    clue, given:savedState.given, values:savedState.values,
    cellSize: cellSizeFor(savedState.size),
    hasInteracted:savedState.hasInteracted, counted:savedState.counted, activeCell:null,
    inputMode: context.preferences.get('inputMode', 'popup'), markedValue:null,
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
  root.querySelector('[data-action="input-mode"]').checked = game.inputMode === 'popup';
  root.querySelector('[data-role="inline-input"]').classList.toggle('hidden', game.inputMode === 'popup');
  refreshHintButton();
  refreshInlineMarks();
  renderBoard();
  updateCheckButton();
}

function renderBoard(){
  const gridEl = root.querySelector('[data-role="grid"]');
  gridEl.innerHTML = '';
  const size = game.size, cellSize = game.cellSize;
  gridEl.style.gridTemplateColumns = 'repeat(' + size + ', ' + cellSize + 'px)';
  const fragment = document.createDocumentFragment();
  for(let r = 0; r < size; r++){
    for(let c = 0; c < size; c++){
      const cell = document.createElement('div');
      cell.style.width = cellSize + 'px'; cell.style.height = cellSize + 'px';
      if(game.grid[r][c] === 'black'){
        const clue = game.clue[r][c];
        if(clue.right === null && clue.down === null){
          cell.className = 'kakuro-clue empty';
        } else {
          cell.className = 'kakuro-clue';
          const clueFontSize = Math.max(10, Math.floor(cellSize * 0.26)) + 'px';
          if(clue.down !== null){
            const down = document.createElement('span'); down.className = 'down'; down.textContent = clue.down;
            down.style.fontSize = clueFontSize;
            cell.appendChild(down);
          }
          if(clue.right !== null){
            const right = document.createElement('span'); right.className = 'right'; right.textContent = clue.right;
            right.style.fontSize = clueFontSize;
            cell.appendChild(right);
          }
        }
      } else {
        const isGiven = game.given && game.given[r][c];
        cell.className = 'kakuro-cell ' + (isGiven ? 'given' : 'editable');
        cell.style.fontSize = Math.max(11, Math.floor(cellSize * 0.5)) + 'px';
        cell.dataset.row = r; cell.dataset.col = c;
        const value = game.values[r][c];
        cell.textContent = value === 0 ? '' : value;
        if(!isGiven) cell.addEventListener('click', () => handleCellTap(r, c, cell));
      }
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
  } else {
    openNumpad(r, c, cellEl);
  }
}
function openNumpad(r, c, cellEl){
  game.activeCell = { row:r, col:c, el:cellEl };
  root.querySelectorAll('.kakuro-cell.selected').forEach(el => el.classList.remove('selected'));
  cellEl.classList.add('selected');
  root.querySelector('[data-role="backdrop"]').classList.remove('hidden');
  root.querySelector('[data-role="toggle-strip"]').classList.add('toggles-locked');
}
function closeNumpad(){
  root.querySelector('[data-role="backdrop"]').classList.add('hidden');
  root.querySelector('[data-role="toggle-strip"]').classList.remove('toggles-locked');
  if(game.activeCell) game.activeCell.el.classList.remove('selected');
}
function setCellValue(v){
  const { row, col, el } = game.activeCell;
  game.values[row][col] = v;
  markInteracted();
  el.textContent = v === 0 ? '' : v;
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
  let complete = true;
  for(let r = 0; r < game.size; r++){
    for(let c = 0; c < game.size; c++){
      if(game.grid[r][c] === 'white' && game.values[r][c] === 0) complete = false;
    }
  }
  root.querySelector('[data-action="check"]').disabled = !complete;
}

function checkPuzzle(){
  if(!game) return;
  let allCorrect = true;
  root.querySelectorAll('.kakuro-cell').forEach(cell => {
    const r = +cell.dataset.row, c = +cell.dataset.col;
    const correct = game.values[r][c] === game.solution[r][c];
    cell.classList.toggle('wrong', !correct);
    if(!correct) allCorrect = false;
  });
  if(!allCorrect || game.counted) return;
  context.stats.bump('kakuro', 'won');
  game.counted = true; stopTimer(); clearSave();
  context.showSuccess(t('game.kakuro.success'));
}

function refreshHintButton(){
  const remaining = context.hints.remaining('kakuro');
  root.querySelector('[data-role="hint-count"]').textContent = remaining;
  root.querySelector('[data-action="hint"]').disabled = remaining <= 0;
}
function useHint(){
  if(!game) return;
  if(context.hints.remaining('kakuro') <= 0) return;
  const empty = [];
  for(let r = 0; r < game.size; r++){
    for(let c = 0; c < game.size; c++){
      if(game.grid[r][c] === 'white' && game.values[r][c] !== game.solution[r][c]) empty.push([r,c]);
    }
  }
  if(!empty.length || !context.hints.consume('kakuro')) return;
  const [r,c] = empty[Math.floor(Math.random() * empty.length)];
  game.values[r][c] = game.solution[r][c];
  markInteracted();
  renderBoard(); updateCheckButton(); refreshHintButton(); writeSave();
}
function revealSolution(){
  if(!game) return;
  for(let r = 0; r < game.size; r++){
    for(let c = 0; c < game.size; c++){
      if(game.grid[r][c] === 'white') game.values[r][c] = game.solution[r][c];
    }
  }
  markInteracted();
  game.counted = true;
  stopTimer(); clearSave(); renderBoard(); updateCheckButton();
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
      if(confirm(t('common.discardConfirmNamed', { game: t('games.kakuro.title') }))){ clearSave(); renderLevelsList(container, actions); }
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
  cancelActiveGeneration();     // laufende Vordergrund-Generierung sofort abbrechen, falls vorhanden
  cancelBackgroundGeneration(); // laufende Hintergrund-Nachproduktion ebenfalls abbrechen
  context && context.loading && context.loading.hide();
  stopTimer(); writeSave();
  listeners.splice(0).forEach(remove => remove());
  if(root && root.parentElement) root.parentElement.innerHTML = '';
  if(styleElement && styleElement.parentElement) styleElement.remove();
  root = null; context = null; game = null; styleElement = null;
}

export default { id, apiVersion, moduleVersion, saveVersion, generatorVersion, mount, renderLevelsList, start, restore, validateSave, unmount, getCurrentLevel };
