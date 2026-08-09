export function buildEmptyBoard(rows, cols){
  const grid = [];
  for(let r = 0; r < rows; r++){
    const row = [];
    for(let c = 0; c < cols; c++){
      row.push({ r, c, isMine:false, revealed:false, flagged:false, adjacent:0 });
    }
    grid.push(row);
  }
  return grid;
}

// Platziert Minen erst NACH dem ersten Klick, außerhalb des 3x3-Bereichs um
// das angeklickte Feld, damit der Einstieg immer fair ist (kein sofortiger
// Verlust durch reinen Zufall beim allerersten Zug).
export function placeMines(grid, rows, cols, mineCount, safeR, safeC){
  const forbidden = new Set();
  for(let dr = -1; dr <= 1; dr++){
    for(let dc = -1; dc <= 1; dc++){
      const r = safeR + dr, c = safeC + dc;
      if(r >= 0 && r < rows && c >= 0 && c < cols) forbidden.add(r + ',' + c);
    }
  }
  const maxPlaceable = Math.max(0, rows * cols - forbidden.size);
  const target = Math.min(mineCount, maxPlaceable);
  let placed = 0;
  let guard = 0;
  while(placed < target && guard < target * 50 + 500){
    guard++;
    const r = Math.floor(Math.random() * rows), c = Math.floor(Math.random() * cols);
    if(forbidden.has(r + ',' + c) || grid[r][c].isMine) continue;
    grid[r][c].isMine = true;
    placed++;
  }
  for(let r = 0; r < rows; r++){
    for(let c = 0; c < cols; c++){
      if(grid[r][c].isMine) continue;
      let count = 0;
      for(let dr = -1; dr <= 1; dr++){
        for(let dc = -1; dc <= 1; dc++){
          if(dr === 0 && dc === 0) continue;
          const rr = r + dr, cc = c + dc;
          if(rr >= 0 && rr < rows && cc >= 0 && cc < cols && grid[rr][cc].isMine) count++;
        }
      }
      grid[r][c].adjacent = count;
    }
  }
  return placed;
}

// Deckt (r,c) auf und setzt die Flutfüllung rekursiv fort, solange
// benachbarte Felder ebenfalls keine Minen in der Nähe haben (adjacent===0).
export function revealCell(grid, rows, cols, r, c){
  const cell = grid[r][c];
  if(cell.revealed || cell.flagged) return;
  cell.revealed = true;
  if(!cell.isMine && cell.adjacent === 0){
    for(let dr = -1; dr <= 1; dr++){
      for(let dc = -1; dc <= 1; dc++){
        if(dr === 0 && dc === 0) continue;
        const rr = r + dr, cc = c + dc;
        if(rr >= 0 && rr < rows && cc >= 0 && cc < cols){
          const n = grid[rr][cc];
          if(!n.revealed && !n.flagged) revealCell(grid, rows, cols, rr, cc);
        }
      }
    }
  }
}

export function cellSizeFor(cols){
  const referenceWidth = 360; // sichere Bezugsbreite (App-Inhalt max. 480px, abzüglich Padding)
  return Math.max(14, Math.min(34, Math.floor(referenceWidth / cols)));
}
