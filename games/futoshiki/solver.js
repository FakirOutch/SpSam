// Reiner Solver, unabhängig vom Generator: zählt Lösungen eines
// Futoshiki-Rätsels per Backtracking, bricht aber bereits bei der
// ZWEITEN gefundenen Lösung ab (mehr brauchen wir nicht zu wissen, um
// Mehrdeutigkeit festzustellen — spart Rechenzeit).
//
// Bewusst als eigene Datei, gleiches Prinzip wie bei Kakuro: eigenständig
// testbar, unabhängig vom Generator importierbar. Anders als bei Kakuro
// bislang bewusst OHNE Web Worker — die gemessene Generierungsdauer liegt
// selbst bei der schwersten Stufe (9×9) im Bereich weniger Millisekunden
// (siehe games/futoshiki/README bzw. Commit-Notiz), ein Worker würde hier
// mehr Overhead verursachen als er einspart.
export function countSolutions(n, given, solution, constraints, limit, stepBudget){
  const grid = given.map((row, r) => row.map((g, c) => g ? solution[r][c] : 0));
  const hSign = Array.from({length:n}, () => Array(n-1).fill(null));
  const vSign = Array.from({length:n-1}, () => Array(n).fill(null));
  constraints.forEach(con => {
    if(con.horizontal) hSign[con.r1][con.c1] = con.sign;
    else vSign[con.r1][con.c1] = con.sign;
  });
  let count = 0;
  let steps = 0;
  let budgetExceeded = false;
  function fits(r, c, v){
    for(let i = 0; i < n; i++){
      if(grid[r][i] === v) return false;
      if(grid[i][c] === v) return false;
    }
    if(c > 0 && grid[r][c-1] !== 0){
      const s = hSign[r][c-1];
      if(s === '<' && !(grid[r][c-1] < v)) return false;
      if(s === '>' && !(grid[r][c-1] > v)) return false;
    }
    if(c < n-1 && grid[r][c+1] !== 0){
      const s = hSign[r][c];
      if(s === '<' && !(v < grid[r][c+1])) return false;
      if(s === '>' && !(v > grid[r][c+1])) return false;
    }
    if(r > 0 && grid[r-1][c] !== 0){
      const s = vSign[r-1][c];
      if(s === '<' && !(grid[r-1][c] < v)) return false;
      if(s === '>' && !(grid[r-1][c] > v)) return false;
    }
    if(r < n-1 && grid[r+1][c] !== 0){
      const s = vSign[r][c];
      if(s === '<' && !(v < grid[r+1][c])) return false;
      if(s === '>' && !(v > grid[r+1][c])) return false;
    }
    return true;
  }
  function solve(pos){
    if(count >= limit || budgetExceeded) return;
    if(stepBudget !== undefined){
      steps++;
      if(steps > stepBudget){ budgetExceeded = true; return; }
    }
    if(pos === n*n){ count++; return; }
    const r = Math.floor(pos/n), c = pos % n;
    if(grid[r][c] !== 0){ solve(pos+1); return; }
    for(let v = 1; v <= n; v++){
      if(fits(r, c, v)){
        grid[r][c] = v;
        solve(pos+1);
        grid[r][c] = 0;
        if(count >= limit || budgetExceeded) return;
      }
    }
  }
  solve(0);
  // Bei Budget-Überschreitung konnte NICHT vollständig geprüft werden, ob
  // noch eine zweite Lösung existiert — das wird sicherheitshalber wie
  // "nicht eindeutig" behandelt (lieber eine vorgegebene Zahl zu viel als
  // ein unentdeckt mehrdeutiges Rätsel).
  return budgetExceeded ? limit + 1 : count;
}
