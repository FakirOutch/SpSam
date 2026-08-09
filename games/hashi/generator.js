function shuffle(values){
  const result = values.slice();
  for(let i = result.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/* Prinzip: das Lösungsnetz wächst schrittweise. Jede neue Insel wird per
   Zufallsrichtung direkt an eine bereits platzierte Insel angehängt (mit
   2-4 Feldern Abstand) und sofort mit einer Brücke verbunden. Dadurch ist
   der gesamte Inselgraph automatisch immer zusammenhängend, und jede neue
   Insel wird nur akzeptiert, wenn sie zu KEINER bestehenden Insel direkt
   angrenzt (auch nicht diagonal). Aus dem fertigen Brückennetz werden die
   Insel-Zahlen abgeleitet (= Summe der Brücken an dieser Insel). */
export function generateHashiPuzzle(level){
  const size = level.size;
  const target = level.islands;
  const islands = [{ id:0, r: Math.floor(Math.random()*size), c: Math.floor(Math.random()*size) }];
  const bridges = []; // { a, b, count, horizontal, r1,c1,r2,c2 }
  const bridgeCells = new Set();

  function markBridgeCells(r1, c1, r2, c2, horizontal){
    if(horizontal){
      const cMin = Math.min(c1,c2), cMax = Math.max(c1,c2);
      for(let c = cMin+1; c < cMax; c++) bridgeCells.add(r1 + ',' + c);
    } else {
      const rMin = Math.min(r1,r2), rMax = Math.max(r1,r2);
      for(let r = rMin+1; r < rMax; r++) bridgeCells.add(r + ',' + c1);
    }
  }
  function isFree(r, c){
    if(r < 0 || r >= size || c < 0 || c >= size) return false;
    if(bridgeCells.has(r + ',' + c)) return false;
    return !islands.some(isl => Math.abs(isl.r - r) <= 1 && Math.abs(isl.c - c) <= 1);
  }
  function crosses(newB){
    return bridges.some(b => {
      if(b.horizontal === newB.horizontal) return false;
      const h = b.horizontal ? b : newB;
      const v = b.horizontal ? newB : b;
      const hr = h.r1, hc1 = Math.min(h.c1,h.c2), hc2 = Math.max(h.c1,h.c2);
      const vc = v.c1, vr1 = Math.min(v.r1,v.r2), vr2 = Math.max(v.r1,v.r2);
      return vc > hc1 && vc < hc2 && hr > vr1 && hr < vr2;
    });
  }

  let guard = 0;
  while(islands.length < target && guard < 4000){
    guard++;
    const anchor = islands[Math.floor(Math.random() * islands.length)];
    const dirs = shuffle([[1,0],[-1,0],[0,1],[0,-1]]);
    let placed = false;
    for(const [dr,dc] of dirs){
      const dists = shuffle([2,3,4]);
      for(const dist of dists){
        const r = anchor.r + dr*dist, c = anchor.c + dc*dist;
        if(r < 0 || r >= size || c < 0 || c >= size) continue;
        let blocked = false;
        for(let s = 1; s < dist; s++){
          const pr = anchor.r + dr*s, pc = anchor.c + dc*s;
          if(islands.some(isl => isl.r === pr && isl.c === pc)){ blocked = true; break; }
          if(bridgeCells.has(pr + ',' + pc)){ blocked = true; break; }
        }
        if(blocked) continue;
        if(!isFree(r, c)) continue;
        const horizontal = dr === 0;
        const candidate = { r1:anchor.r, c1:anchor.c, r2:r, c2:c, horizontal };
        if(crosses(candidate)) continue;
        const newIsl = { id: islands.length, r, c };
        islands.push(newIsl);
        const count = Math.random() < 0.7 ? 1 : 2;
        bridges.push({ a:anchor.id, b:newIsl.id, count, horizontal, r1:anchor.r, c1:anchor.c, r2:r, c2:c });
        markBridgeCells(anchor.r, anchor.c, r, c, horizontal);
        placed = true;
        break;
      }
      if(placed) break;
    }
  }

  islands.forEach(isl => { isl.target = 0; });
  bridges.forEach(b => {
    islands[b.a].target += b.count;
    islands[b.b].target += b.count;
  });

  return { size, islands, solutionBridges: bridges };
}

// Versucht mehrfach, falls der Zufallslauf zu wenige Inseln erreicht hat.
export function generateHashiPuzzleWithRetry(level){
  let puzzle = null;
  for(let i = 0; i < 8 && !puzzle; i++){
    const candidate = generateHashiPuzzle(level);
    if(candidate.islands.length >= level.islands) puzzle = candidate;
  }
  return puzzle || generateHashiPuzzle(level);
}
