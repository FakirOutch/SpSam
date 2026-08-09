import { countSolutions } from './solver.js';

function shuffle(values){
  const result = values.slice();
  for(let i = result.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Erzeugt schwarz/weiß-Layout; Läufe der Länge 1 werden zu schwarz gemacht,
// da sie in Kakuro nicht erlaubt sind (kein sinnvoller Lauf).
function generateLayout(size, blackRatio){
  const grid = Array.from({length:size}, () => Array(size).fill('white'));
  for(let c = 0; c < size; c++) grid[0][c] = 'black';
  for(let r = 0; r < size; r++) grid[r][0] = 'black';
  for(let r = 1; r < size; r++){
    for(let c = 1; c < size; c++){
      if(Math.random() < blackRatio) grid[r][c] = 'black';
    }
  }
  let changed = true, guard = 0;
  while(changed && guard < 10){
    changed = false; guard++;
    for(let r = 1; r < size; r++){
      for(let c = 1; c < size; c++){
        if(grid[r][c] !== 'white') continue;
        const leftBlack = grid[r][c-1] === 'black';
        const rightWhite = c+1 < size && grid[r][c+1] === 'white';
        const horizLen1 = leftBlack && !rightWhite;
        const topBlack = grid[r-1][c] === 'black';
        const bottomWhite = r+1 < size && grid[r+1][c] === 'white';
        const vertLen1 = topBlack && !bottomWhite;
        if(horizLen1 && vertLen1){ grid[r][c] = 'black'; changed = true; }
      }
    }
  }
  return grid;
}

export function getRuns(grid, size){
  const runs = [];
  for(let r = 1; r < size; r++){
    let run = [];
    for(let c = 1; c <= size; c++){
      const isWhite = c < size && grid[r][c] === 'white';
      if(isWhite) run.push({r,c});
      else { if(run.length >= 2) runs.push({ cells:run.slice(), horizontal:true }); run = []; }
    }
  }
  for(let c = 1; c < size; c++){
    let run = [];
    for(let r = 1; r <= size; r++){
      const isWhite = r < size && grid[r][c] === 'white';
      if(isWhite) run.push({r,c});
      else { if(run.length >= 2) runs.push({ cells:run.slice(), horizontal:false }); run = []; }
    }
  }
  return runs;
}

// Backtracking mit MRV-Heuristik (immer die am stärksten eingeschränkte
// Zelle zuerst) plus Schrittlimit, damit ein aussichtsloses Layout schnell
// abgebrochen und neu versucht wird statt die App zu blockieren.
function fillBoard(grid, size, runs, stepBudget){
  const board = Array.from({length:size}, () => Array(size).fill(0));
  const cellRuns = new Map();
  runs.forEach((run, idx) => {
    run.cells.forEach(({r,c}) => {
      const key = r+','+c;
      if(!cellRuns.has(key)) cellRuns.set(key, []);
      cellRuns.get(key).push(idx);
    });
  });
  const whiteCells = [];
  for(let r = 1; r < size; r++) for(let c = 1; c < size; c++) if(grid[r][c] === 'white') whiteCells.push({r,c});
  const remaining = new Set(whiteCells.map(({r,c}) => r+','+c));

  function candidatesFor(r, c){
    const myRuns = cellRuns.get(r+','+c) || [];
    const used = new Set();
    myRuns.forEach(idx => runs[idx].cells.forEach(cell => { const v = board[cell.r][cell.c]; if(v !== 0) used.add(v); }));
    const out = [];
    for(let v = 1; v <= 9; v++) if(!used.has(v)) out.push(v);
    return out;
  }
  let steps = 0;
  function pickNext(){
    let best = null, bestCount = 10;
    for(const key of remaining){
      const [r,c] = key.split(',').map(Number);
      const cands = candidatesFor(r,c);
      if(cands.length < bestCount){ bestCount = cands.length; best = {r,c,cands}; if(bestCount <= 1) break; }
    }
    return best;
  }
  function backtrack(){
    steps++;
    if(steps > stepBudget) return false;
    if(remaining.size === 0) return true;
    const next = pickNext();
    if(!next || next.cands.length === 0) return false;
    const { r, c, cands } = next;
    const key = r+','+c;
    remaining.delete(key);
    const order = shuffle(cands.slice());
    for(const v of order){
      board[r][c] = v;
      if(backtrack()) return true;
      board[r][c] = 0;
    }
    remaining.add(key);
    return false;
  }
  return backtrack() ? board : null;
}

// timeBudgetMs: Sicherheitsnetz gegen die beobachtete hohe Streuung der
// Generierungsdauer (gemessen: einzelne Läufe bis zu ~44s). Weder die
// Layout-Wiederholungsversuche noch die Ausgraben-Phase hatten bisher eine
// GESAMT-Zeitgrenze, nur einzelne Schrittbudgets pro Versuch — bei Pech
// summierten sich mehrere teure Versuche/Aufrufe unbegrenzt auf. Beide
// Phasen teilen sich jetzt ein gemeinsames Zeitbudget ab Funktionsstart;
// wird es überschritten, bricht die jeweilige Phase kontrolliert ab und
// liefert das bis dahin beste Ergebnis (im schlimmsten Fall: etwas mehr
// vorgegebene Zahlen als sonst üblich — spielbar, aber etwas leichter,
// statt eines unbegrenzt langen Wartens).
export function generateKakuroPuzzle(size, blackRatio, stepBudget, timeBudgetMs = 10000){
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  const elapsed = () => now() - t0;

  let grid, runs, board;
  let found = false;
  for(let attempt = 0; attempt < 15 && elapsed() < timeBudgetMs; attempt++){
    grid = generateLayout(size, blackRatio);
    runs = getRuns(grid, size);
    let whiteCount = 0;
    for(let r = 1; r < size; r++) for(let c = 1; c < size; c++) if(grid[r][c] === 'white') whiteCount++;
    if(whiteCount < (size-1)*(size-1)*0.3) continue;
    board = fillBoard(grid, size, runs, stepBudget);
    if(board){ found = true; break; }
  }
  if(!found){
    grid = generateLayout(size, blackRatio);
    runs = getRuns(grid, size);
    board = fillBoard(grid, size, runs, stepBudget * 3) || Array.from({length:size}, () => Array(size).fill(1));
  }
  // Ausgraben-Technik: alle Felder starten sichtbar (garantiert eindeutig),
  // dann werden in zufälliger Reihenfolge einzelne Zahlen ausgeblendet, aber
  // NUR wenn das Rätsel danach nachweislich weiterhin eindeutig lösbar bleibt.
  const given = Array.from({length:size}, () => Array(size).fill(true));
  const whiteCells = [];
  for(let r = 1; r < size; r++) for(let c = 1; c < size; c++) if(grid[r][c] === 'white') whiteCells.push(r*size+c);
  shuffle(whiteCells);
  const digStepBudget = 8000;
  for(const idx of whiteCells){
    if(elapsed() > timeBudgetMs) break; // restliche Zellen bleiben vorgegeben — spielbar, nur etwas leichter
    const r = Math.floor(idx/size), c = idx % size;
    given[r][c] = false;
    const solutions = countSolutions(grid, size, runs, board, given, 2, digStepBudget);
    if(solutions !== 1) given[r][c] = true;
  }
  return { size, grid, runs, board, given };
}

export function computeClues(grid, size, runs, board){
  const clue = Array.from({length:size}, () => Array.from({length:size}, () => ({ right:null, down:null })));
  runs.forEach(run => {
    const sum = run.cells.reduce((s, {r,c}) => s + board[r][c], 0);
    const first = run.cells[0];
    if(run.horizontal) clue[first.r][first.c - 1].right = sum;
    else clue[first.r - 1][first.c].down = sum;
  });
  return clue;
}

export function cellSizeFor(size){
  const referenceWidth = 360;
  return Math.max(24, Math.min(42, Math.floor(referenceWidth / size)));
}
