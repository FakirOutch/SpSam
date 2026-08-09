// Reiner Solver, unabhängig vom Generator: zählt Lösungen eines fertigen
// Kakuro-Rätsels (Layout + Summen-Hinweise) per MRV-Backtracking, bricht
// aber bereits bei der ZWEITEN gefundenen Lösung ab. Muss zusätzlich zu
// "keine Wiederholung im Lauf" auch die bereits feststehenden
// Summen-Hinweise exakt einhalten.
//
// Bewusst als eigene Datei: kann so isoliert getestet werden (ohne den
// Generator), und im Worker unabhängig importiert werden.
export function countSolutions(grid, size, runs, targetBoard, given, limit, stepBudget){
  const runSums = runs.map(run => run.cells.reduce((s,{r,c}) => s + targetBoard[r][c], 0));
  const cellRuns = new Map();
  runs.forEach((run, idx) => {
    run.cells.forEach(({r,c}) => {
      const key = r+','+c;
      if(!cellRuns.has(key)) cellRuns.set(key, []);
      cellRuns.get(key).push(idx);
    });
  });
  const values = Array.from({length:size}, () => Array(size).fill(0));
  const remaining = new Set();
  for(let r = 1; r < size; r++){
    for(let c = 1; c < size; c++){
      if(grid[r][c] !== 'white') continue;
      if(given && given[r][c]){ values[r][c] = targetBoard[r][c]; }
      else remaining.add(r+','+c);
    }
  }

  function candidatesFor(r, c){
    const myRuns = cellRuns.get(r+','+c) || [];
    let allowed = null;
    for(const idx of myRuns){
      const run = runs[idx];
      const used = new Set();
      let sum = 0, filledCount = 0;
      run.cells.forEach(({r:rr,c:cc}) => {
        const v = values[rr][cc];
        if(v !== 0){ used.add(v); sum += v; filledCount++; }
      });
      const remainingCells = run.cells.length - filledCount - 1;
      const remainingSum = runSums[idx] - sum;
      const localAllowed = new Set();
      for(let v = 1; v <= 9; v++){
        if(used.has(v)) continue;
        if(v > remainingSum) continue;
        if(remainingCells === 0 && v !== remainingSum) continue;
        localAllowed.add(v);
      }
      allowed = allowed === null ? localAllowed : new Set([...allowed].filter(v => localAllowed.has(v)));
    }
    return allowed ? [...allowed] : [];
  }
  function pickNext(){
    let best = null, bestCount = 10;
    for(const key of remaining){
      const [r,c] = key.split(',').map(Number);
      const cands = candidatesFor(r,c);
      if(cands.length < bestCount){ bestCount = cands.length; best = {r,c,cands}; if(bestCount <= 1) break; }
    }
    return best;
  }
  let count = 0;
  let steps = 0;
  let budgetExceeded = false;
  function solve(){
    if(count >= limit || budgetExceeded) return;
    if(stepBudget !== undefined){
      steps++;
      if(steps > stepBudget){ budgetExceeded = true; return; }
    }
    if(remaining.size === 0){ count++; return; }
    const next = pickNext();
    if(!next || next.cands.length === 0) return;
    const { r, c, cands } = next;
    const key = r+','+c;
    remaining.delete(key);
    for(const v of cands){
      values[r][c] = v;
      solve();
      values[r][c] = 0;
      if(count >= limit || budgetExceeded) break;
    }
    remaining.add(key);
  }
  solve();
  // Bei Budget-Überschreitung konservativ als "nicht eindeutig" werten —
  // lieber neu generieren als ein unentdeckt mehrdeutiges Rätsel ausliefern.
  return budgetExceeded ? limit + 1 : count;
}
