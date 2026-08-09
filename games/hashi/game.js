import { generateHashiPuzzleWithRetry } from './generator.js';
import { t } from '../../core/i18n.js';

export const id = 'hashi';
export const apiVersion = 1;
export const moduleVersion = 1;
export const saveVersion = 1;
export const generatorVersion = 1;

export const LEVELS = Object.freeze([
  { id:1, labelKey:'common.difficulty.veryEasy', descKey:'game.hashi.levels.1.desc', islands:6,  size:7 },
  { id:2, labelKey:'common.difficulty.easy',      descKey:'game.hashi.levels.2.desc', islands:9,  size:8 },
  { id:3, labelKey:'common.difficulty.medium',    descKey:'game.hashi.levels.3.desc', islands:12, size:9 },
  { id:4, labelKey:'common.difficulty.hard',      descKey:'game.hashi.levels.4.desc', islands:15, size:10 },
  { id:5, labelKey:'common.difficulty.expert',    descKey:'game.hashi.levels.5.desc', islands:19, size:11 },
]);

const SAVE_KEY = 'arkimis_game_hashi_v1';
const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 30;
const CANVAS = 400;
const MIN_DRAG = 10;

let root = null;
let context = null;
let game = null; // { level, gridSize, islands, solutionBridges, userBridges, hasInteracted, counted, elapsedSeconds, startedAt, activeCell? }
let timerInterval = null;
let styleElement = null;
let listeners = [];
let drag = null; // { fromId, line }

function listen(element, eventName, handler){
  element.addEventListener(eventName, handler);
  listeners.push(() => element.removeEventListener(eventName, handler));
}

function loadStyles(){
  styleElement = document.querySelector('[data-game-style="hashi"]');
  if(styleElement) return;
  styleElement = document.createElement('link');
  styleElement.rel = 'stylesheet';
  styleElement.href = new URL('./game.css', import.meta.url).href;
  styleElement.dataset.gameStyle = 'hashi';
  document.head.appendChild(styleElement);
}

/* ---------- Validierung eines gespeicherten Spielstands ---------- */
function validIslands(islands, size){
  return Array.isArray(islands) && islands.length > 0 && islands.every(isl =>
    isl && typeof isl === 'object' &&
    Number.isInteger(isl.id) && isl.id >= 0 &&
    Number.isInteger(isl.r) && isl.r >= 0 && isl.r < size &&
    Number.isInteger(isl.c) && isl.c >= 0 && isl.c < size &&
    Number.isInteger(isl.target) && isl.target >= 0 && isl.target <= 8
  );
}
function validBridgeList(bridges){
  return Array.isArray(bridges) && bridges.every(b =>
    b && typeof b === 'object' &&
    Number.isInteger(b.a) && Number.isInteger(b.b) &&
    Number.isInteger(b.count) && b.count >= 1 && b.count <= 2 &&
    typeof b.horizontal === 'boolean' &&
    Number.isInteger(b.r1) && Number.isInteger(b.c1) && Number.isInteger(b.r2) && Number.isInteger(b.c2)
  );
}
function validUserBridgePairs(pairs){
  return Array.isArray(pairs) && pairs.every(entry =>
    Array.isArray(entry) && entry.length === 2 &&
    typeof entry[0] === 'string' && /^\d+-\d+$/.test(entry[0]) &&
    Number.isInteger(entry[1]) && entry[1] >= 1 && entry[1] <= 2
  );
}
export function validateSave(save){
  if(!save || typeof save !== 'object') return false;
  if(save.gameId !== id || save.saveVersion !== saveVersion) return false;
  if(!Number.isInteger(save.generatorVersion) || save.generatorVersion <= 0) return false;
  if(!LEVELS.some(level => level.id === save.levelId)) return false;
  if(!Number.isInteger(save.size) || save.size < 4) return false;
  if(!validIslands(save.islands, save.size)) return false;
  if(!validBridgeList(save.solutionBridges)) return false;
  if(!validUserBridgePairs(save.userBridges)) return false;
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
    size:game.gridSize, islands:game.islands, solutionBridges:game.solutionBridges,
    userBridges:Array.from(game.userBridges.entries()),
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
  context.stats.bump('hashi', 'played');
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
  return `<section class="game-root game-hashi">
    <div class="game-header">
      <button class="icon-btn" data-action="back">←</button><h2>${t('games.hashi.title')}</h2>
      <span class="level-chip" data-role="level"></span>
    </div>
    <div class="hint-row">
      <button class="hint-btn" data-action="hint">💡 <span data-role="hint-count">3</span> ${t('common.hintsSuffix')}</button>
      <div class="timer-chip">⏱ <span data-role="timer">00:00</span></div>
      <button class="reveal-btn" data-action="reveal" title="${t('common.reveal')}" aria-label="${t('common.reveal')}">🔍</button>
    </div>
    <div class="hashi-wrap">
      <div class="hashi-ratio-box">
        <svg data-role="svg" class="hashi-svg" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet"></svg>
      </div>
    </div>
    <div class="grid-actions">
      <button class="btn secondary block" data-action="new">${t('common.newPuzzle')}</button>
      <button class="btn block" data-action="check" disabled>${t('common.check')}</button>
    </div>
  </section>`;
}

export async function mount(container, appContext){
  if(root) await unmount();
  context = appContext;
  loadStyles();
  container.innerHTML = markup();
  root = container.querySelector('.game-hashi');
  bindEvents();
}

function bindEvents(){
  listen(root.querySelector('[data-action="back"]'), 'click', async () => {
    writeSave(); await context.goToLevels();
  });
  listen(root.querySelector('[data-action="new"]'), 'click', () => start(game.level));
  listen(root.querySelector('[data-action="check"]'), 'click', checkPuzzle);
  listen(root.querySelector('[data-action="hint"]'), 'click', useHint);
  listen(root.querySelector('[data-action="reveal"]'), 'click', revealSolution);
}

export async function start(level){
  if(!root) throw new Error('Hashi muss vor start() gemountet werden.');
  stopTimer();
  const puzzle = generateHashiPuzzleWithRetry(level);
  game = {
    level, gridSize:puzzle.size, islands:puzzle.islands, solutionBridges:puzzle.solutionBridges,
    userBridges:new Map(), hasInteracted:false, counted:false,
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
    level, gridSize:savedState.size, islands:savedState.islands, solutionBridges:savedState.solutionBridges,
    userBridges:new Map(savedState.userBridges),
    hasInteracted:savedState.hasInteracted, counted:savedState.counted,
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
  refreshHintButton();
  renderBoard();
  updateCheckButton();
}

/* ---------- Layout & Zeichnen ---------- */
function layout(){
  const size = game.gridSize;
  const usable = CANVAS - PAD * 2;
  const step = usable / (size - 1 || 1);
  return { pad: PAD, usable, step };
}
function posOf(island){
  const { pad, step } = layout();
  return { x: pad + island.c * step, y: pad + island.r * step };
}
function currentCount(islandId){
  let sum = 0;
  game.userBridges.forEach((count, key) => {
    const [a,b] = key.split('-').map(Number);
    if(a === islandId || b === islandId) sum += count;
  });
  return sum;
}
function pairKey(a, b){ return a < b ? a+'-'+b : b+'-'+a; }

function renderBoard(){
  const svg = root.querySelector('[data-role="svg"]');
  svg.innerHTML = '';
  const { pad, usable, step } = layout();
  const size = game.gridSize;

  for(let i = 0; i < size; i++){
    const yLine = document.createElementNS(SVG_NS,'line');
    yLine.setAttribute('class','hashi-gridline');
    yLine.setAttribute('x1', pad); yLine.setAttribute('y1', pad + i * step);
    yLine.setAttribute('x2', pad + usable); yLine.setAttribute('y2', pad + i * step);
    svg.appendChild(yLine);
    const xLine = document.createElementNS(SVG_NS,'line');
    xLine.setAttribute('class','hashi-gridline');
    xLine.setAttribute('x1', pad + i * step); xLine.setAttribute('y1', pad);
    xLine.setAttribute('x2', pad + i * step); xLine.setAttribute('y2', pad + usable);
    svg.appendChild(xLine);
  }

  game.userBridges.forEach((count, key) => {
    if(count === 0) return;
    const [a, b] = key.split('-').map(Number);
    const A = game.islands[a], B = game.islands[b];
    const pA = posOf(A), pB = posOf(B);
    const horizontal = A.r === B.r;
    for(let i = 0; i < count; i++){
      const offset = count === 2 ? (i === 0 ? -4 : 4) : 0;
      const line = document.createElementNS(SVG_NS,'line');
      line.setAttribute('class','hashi-bridge');
      if(horizontal){
        line.setAttribute('x1', pA.x); line.setAttribute('y1', pA.y + offset);
        line.setAttribute('x2', pB.x); line.setAttribute('y2', pB.y + offset);
      } else {
        line.setAttribute('x1', pA.x + offset); line.setAttribute('y1', pA.y);
        line.setAttribute('x2', pB.x + offset); line.setAttribute('y2', pB.y);
      }
      line.addEventListener('pointerdown', (event) => { event.stopPropagation(); toggleBridgeBetween(a, b); });
      svg.appendChild(line);
    }
  });

  game.islands.forEach(island => {
    const p = posOf(island);
    const g = document.createElementNS(SVG_NS,'g');
    g.setAttribute('class','hashi-island');
    if(currentCount(island.id) === island.target) g.classList.add('done');

    const circle = document.createElementNS(SVG_NS,'circle');
    circle.setAttribute('class','base');
    circle.setAttribute('cx', p.x); circle.setAttribute('cy', p.y); circle.setAttribute('r', 17);
    g.appendChild(circle);

    const text = document.createElementNS(SVG_NS,'text');
    text.setAttribute('x', p.x); text.setAttribute('y', p.y);
    text.textContent = island.target;
    g.appendChild(text);

    g.addEventListener('pointerdown', (event) => startDrag(island.id, event));
    svg.appendChild(g);
  });
}

/* ---------- Ziehen einer Verbindungslinie (Pointer-Events) ---------- */
function svgPoint(evt){
  const svg = root.querySelector('[data-role="svg"]');
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  const ctm = svg.getScreenCTM();
  if(!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function startDrag(islandId, evt){
  evt.preventDefault();
  evt.stopPropagation();
  const svg = root.querySelector('[data-role="svg"]');
  const p = posOf(game.islands[islandId]);
  const line = document.createElementNS(SVG_NS,'line');
  line.setAttribute('class','hashi-drag-preview');
  line.setAttribute('x1', p.x); line.setAttribute('y1', p.y);
  line.setAttribute('x2', p.x); line.setAttribute('y2', p.y);
  svg.appendChild(line);
  drag = { fromId: islandId, line };
  try{ svg.setPointerCapture(evt.pointerId); }catch(_error){}
  svg.addEventListener('pointermove', onDragMove);
  svg.addEventListener('pointerup', onDragEnd);
  svg.addEventListener('pointercancel', onDragEnd);
}

function onDragMove(evt){
  if(!drag) return;
  const start = game.islands[drag.fromId];
  const startPos = posOf(start);
  const p = svgPoint(evt);
  const dx = p.x - startPos.x, dy = p.y - startPos.y;
  let endX, endY;
  if(Math.abs(dx) >= Math.abs(dy)){ endX = p.x; endY = startPos.y; }
  else { endX = startPos.x; endY = p.y; }
  drag.line.setAttribute('x2', endX);
  drag.line.setAttribute('y2', endY);
}

function endDragListeners(){
  const svg = root.querySelector('[data-role="svg"]');
  svg.removeEventListener('pointermove', onDragMove);
  svg.removeEventListener('pointerup', onDragEnd);
  svg.removeEventListener('pointercancel', onDragEnd);
}

function onDragEnd(evt){
  if(!drag) return;
  const svg = root.querySelector('[data-role="svg"]');
  const start = game.islands[drag.fromId];
  const startPos = posOf(start);
  const p = svgPoint(evt);
  const dx = p.x - startPos.x, dy = p.y - startPos.y;

  let target = null;
  if(Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > MIN_DRAG){
    const dir = dx > 0 ? 1 : -1;
    const candidates = game.islands.filter(isl => isl.r === start.r && isl.id !== start.id && Math.sign(isl.c - start.c) === dir);
    if(candidates.length) target = candidates.reduce((best, isl) => Math.abs(isl.c - start.c) < Math.abs(best.c - start.c) ? isl : best);
  } else if(Math.abs(dy) > MIN_DRAG){
    const dir = dy > 0 ? 1 : -1;
    const candidates = game.islands.filter(isl => isl.c === start.c && isl.id !== start.id && Math.sign(isl.r - start.r) === dir);
    if(candidates.length) target = candidates.reduce((best, isl) => Math.abs(isl.r - start.r) < Math.abs(best.r - start.r) ? isl : best);
  }

  if(svg.contains(drag.line)) svg.removeChild(drag.line);
  try{ svg.releasePointerCapture(evt.pointerId); }catch(_error){}
  endDragListeners();
  drag = null;

  if(target !== null) toggleBridgeBetween(start.id, target.id);
  else renderBoard();
}

function bridgeGeom(a, b){
  const A = game.islands[a], B = game.islands[b];
  return { r1:A.r, c1:A.c, r2:B.r, c2:B.c, horizontal: A.r === B.r };
}
function bridgesCross(g1, g2){
  if(g1.horizontal === g2.horizontal) return false;
  const h = g1.horizontal ? g1 : g2;
  const v = g1.horizontal ? g2 : g1;
  const hr = h.r1, hc1 = Math.min(h.c1,h.c2), hc2 = Math.max(h.c1,h.c2);
  const vc = v.c1, vr1 = Math.min(v.r1,v.r2), vr2 = Math.max(v.r1,v.r2);
  return vc > hc1 && vc < hc2 && hr > vr1 && hr < vr2;
}

function toggleBridgeBetween(a, b){
  const key = pairKey(a, b);
  const current = game.userBridges.get(key) || 0;
  if(current === 0){
    const newGeom = bridgeGeom(a, b);
    let crossing = false;
    game.userBridges.forEach((cnt, k) => {
      if(cnt === 0 || crossing) return;
      const [x,y] = k.split('-').map(Number);
      if(bridgesCross(newGeom, bridgeGeom(x,y))) crossing = true;
    });
    if(crossing){ renderBoard(); return; } // abgelehnt: keine tatsächliche Änderung, zählt nicht als Interaktion
  }
  markInteracted();
  const next = (current + 1) % 3;
  if(next === 0) game.userBridges.delete(key);
  else game.userBridges.set(key, next);
  root.querySelectorAll('.hashi-island').forEach(el => el.classList.remove('wrong'));
  renderBoard();
  updateCheckButton();
  writeSave();
}

function updateCheckButton(){
  const allFilled = game.islands.every(isl => currentCount(isl.id) > 0 || isl.target === 0);
  root.querySelector('[data-action="check"]').disabled = !allFilled;
}

function isConnected(){
  const parent = game.islands.map((_, i) => i);
  function find(x){ return parent[x] === x ? x : (parent[x] = find(parent[x])); }
  function union(x,y){ parent[find(x)] = find(y); }
  game.userBridges.forEach((count, key) => {
    if(count === 0) return;
    const [a,b] = key.split('-').map(Number);
    union(a,b);
  });
  const rootId = find(0);
  return game.islands.every((_, i) => find(i) === rootId);
}

function checkPuzzle(){
  let sumsCorrect = true;
  root.querySelectorAll('.hashi-island').forEach((el, idx) => {
    const isl = game.islands[idx];
    const count = currentCount(isl.id);
    const wrong = count !== isl.target;
    el.classList.toggle('wrong', wrong);
    el.classList.toggle('done', !wrong);
    if(wrong) sumsCorrect = false;
  });
  const allCorrect = sumsCorrect && isConnected();
  if(!allCorrect || game.counted) return;
  context.stats.bump('hashi', 'won');
  game.counted = true; stopTimer(); clearSave();
  context.showSuccess(t('game.hashi.success'));
}

function refreshHintButton(){
  const remaining = context.hints.remaining('hashi');
  root.querySelector('[data-role="hint-count"]').textContent = remaining;
  root.querySelector('[data-action="hint"]').disabled = remaining <= 0;
}

function useHint(){
  if(context.hints.remaining('hashi') <= 0) return;
  const mismatched = game.solutionBridges.filter(b => (game.userBridges.get(pairKey(b.a,b.b)) || 0) !== b.count);
  if(!mismatched.length || !context.hints.consume('hashi')) return;
  const pick = mismatched[Math.floor(Math.random() * mismatched.length)];
  game.userBridges.set(pairKey(pick.a, pick.b), pick.count);
  markInteracted();
  renderBoard(); updateCheckButton(); refreshHintButton(); writeSave();
}

function revealSolution(){
  game.userBridges = new Map();
  game.solutionBridges.forEach(b => game.userBridges.set(pairKey(b.a, b.b), b.count));
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
      if(confirm(t('common.discardConfirmNamed', { game: t('games.hashi.title') }))){ clearSave(); renderLevelsList(container, actions); }
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
  if(drag){
    // Mitten in einer Ziehgeste verlassen — Vorschaulinie und ihre
    // Zusatz-Listener sauber entfernen, statt sie hängen zu lassen.
    const svg = root ? root.querySelector('[data-role="svg"]') : null;
    if(svg && drag.line && svg.contains(drag.line)) svg.removeChild(drag.line);
    endDragListeners();
    drag = null;
  }
  listeners.splice(0).forEach(remove => remove());
  if(root && root.parentElement) root.parentElement.innerHTML = '';
  if(styleElement && styleElement.parentElement) styleElement.remove();
  root = null; context = null; game = null; styleElement = null;
}

export default { id, apiVersion, moduleVersion, saveVersion, generatorVersion, mount, renderLevelsList, start, restore, validateSave, unmount, getCurrentLevel };
