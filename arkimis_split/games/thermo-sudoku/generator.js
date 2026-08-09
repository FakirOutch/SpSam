function shuffle(arr){
  for(let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function isSafe(board, row, col, num){
  for(let x = 0; x < 9; x++){
    if(board[row][x] === num) return false;
    if(board[x][col] === num) return false;
  }
  const br = row - row % 3, bc = col - col % 3;
  for(let r = 0; r < 3; r++)
    for(let c = 0; c < 3; c++)
      if(board[br+r][bc+c] === num) return false;
  return true;
}
function fillBoard(board, pos = 0){
  if(pos === 81) return true;
  const row = Math.floor(pos / 9), col = pos % 9;
  const nums = shuffle([1,2,3,4,5,6,7,8,9]);
  for(const n of nums){
    if(isSafe(board, row, col, n)){
      board[row][col] = n;
      if(fillBoard(board, pos + 1)) return true;
      board[row][col] = 0;
    }
  }
  return false;
}
export function generateFullBoard(){
  const board = Array.from({length:9}, () => Array(9).fill(0));
  fillBoard(board);
  return board;
}

// Prüft, ob eine Zelle (auch diagonal) direkt an eine bereits belegte
// Zelle eines ANDEREN Thermometers angrenzt, OHNE dass es eine gewollte
// Kreuzung ist (myPathSet = eigene, bereits belegte Zellen — die zählen
// nicht als "fremd"). Nur relevant, wenn Berühren generell nicht erlaubt ist.
function thermoHasForeignNeighbor(r, c, cellUse, myPathSet, size){
  for(let dr = -1; dr <= 1; dr++){
    for(let dc = -1; dc <= 1; dc++){
      if(dr === 0 && dc === 0) continue;
      const nr = r+dr, nc = c+dc;
      if(nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const key = nr + ',' + nc;
      if(cellUse[key] && !myPathSet.has(key)) return true;
    }
  }
  return false;
}
// Prüft, ob eine neue diagonale Verbindung (r1,c1)-(r2,c2) genau die
// GEGENLÄUFIGE Diagonale eines 2x2-Blocks wäre, den bereits ein anderes
// Thermometer diagonal durchquert — das wäre eine "unsichtbare" X-Kreuzung
// ohne gemeinsame Zelle (schlechter als eine normale Kreuzung, da nicht als
// solche erkennbar). Wird verhindert, statt zugelassen.
function thermoWouldCrossDiagonally(r1, c1, r2, c2, diagSegments){
  if(Math.abs(r1-r2) !== 1 || Math.abs(c1-c2) !== 1) return false;
  const minR = Math.min(r1,r2), minC = Math.min(c1,c2);
  const isMainDiag = (r1===minR && c1===minC) || (r2===minR && c2===minC);
  return diagSegments.some(seg => {
    if(seg.minR !== minR || seg.minC !== minC) return false;
    return seg.isMainDiag !== isMainDiag;
  });
}
// Wächst Thermometer als zufälligen Pfad benachbarter Zellen, wobei die
// Lösungswerte entlang des Pfads immer strikt ansteigen müssen — dadurch
// ist die Lösung garantiert mit den Thermometern konsistent. Je nach
// Schwierigkeit dürfen sich Thermometer eine Zelle teilen (echte
// Kreuzung, max. 2 Thermometer je Zelle).
export function generateThermometers(solution, opts){
  const size = 9;
  const cellUse = {};
  const diagSegments = [];
  const thermos = [];
  const dirs8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const targetCount = opts.countMin + Math.floor(Math.random() * (opts.countMax - opts.countMin + 1));
  let attempts = 0;
  const maxAttempts = targetCount * 150;
  while(thermos.length < targetCount && attempts < maxAttempts){
    attempts++;
    const r0 = Math.floor(Math.random() * size), c0 = Math.floor(Math.random() * size);
    const startKey = r0 + ',' + c0;
    const pathUsed = new Set();
    const startForeignUse = cellUse[startKey] || 0;
    if(startForeignUse > 0){
      if(!opts.allowCrossings || startForeignUse >= 2) continue;
    } else if(!opts.allowTouching && thermoHasForeignNeighbor(r0, c0, cellUse, pathUsed, size)){
      continue;
    }
    const targetLen = opts.minLen + Math.floor(Math.random() * (opts.maxLen - opts.minLen + 1));
    const path = [[r0, c0]];
    pathUsed.add(startKey);
    let crossingsInPath = startForeignUse > 0 ? 1 : 0;
    const pathDiagSegments = [];
    let cr = r0, cc = c0;
    while(path.length < targetLen){
      const dirs = shuffle(dirs8.slice());
      let placed = false;
      for(const [dr, dc] of dirs){
        const nr = cr + dr, nc = cc + dc;
        if(nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const key = nr + ',' + nc;
        if(pathUsed.has(key)) continue;
        if(solution[nr][nc] <= solution[cr][cc]) continue;
        if(thermoWouldCrossDiagonally(cr, cc, nr, nc, diagSegments)) continue;
        const foreignUse = cellUse[key] || 0;
        if(foreignUse > 0){
          if(!opts.allowCrossings) continue;
          if(foreignUse >= 2) continue;
          if(crossingsInPath >= opts.maxCrossPerThermo) continue;
          if(Math.random() > opts.crossChance) continue;
        } else if(!opts.allowTouching && thermoHasForeignNeighbor(nr, nc, cellUse, pathUsed, size)){
          continue;
        }
        path.push([nr, nc]);
        pathUsed.add(key);
        if(foreignUse > 0) crossingsInPath++;
        if(dr !== 0 && dc !== 0){
          const minR = Math.min(cr,nr), minC = Math.min(cc,nc);
          const isMainDiag = (cr===minR && cc===minC) || (nr===minR && nc===minC);
          pathDiagSegments.push({ minR, minC, isMainDiag });
        }
        cr = nr; cc = nc;
        placed = true;
        break;
      }
      if(!placed) break;
    }
    if(path.length >= 2){
      path.forEach(([r,c]) => { cellUse[r+','+c] = (cellUse[r+','+c] || 0) + 1; });
      diagSegments.push(...pathDiagSegments);
      thermos.push(path);
    }
  }
  return thermos;
}

// Weist jedem Thermometer eine Farbe zu, sodass zwei Thermometer, die sich
// eine Zelle teilen (Kreuzung), nie dieselbe Farbe bekommen — sonst wäre an
// der Kreuzung nicht mehr erkennbar, dass dort zwei verschiedene Thermometer
// verlaufen. Gleiche Greedy-Graph-Färbung wie bei den Killer-Sudoku-Käfigen.
export const THERMO_COLOR_PALETTE = [
  'var(--lilac)', 'var(--accent-dark)', 'var(--primary-dark)',
  'var(--danger-ink)', 'var(--success)', '#4A6FA5',
];
function assignThermoColors(thermos){
  const neighborIds = thermos.map(() => new Set());
  for(let i = 0; i < thermos.length; i++){
    const setI = new Set(thermos[i].map(([r,c]) => r+','+c));
    for(let j = i+1; j < thermos.length; j++){
      const shareCell = thermos[j].some(([r,c]) => setI.has(r+','+c));
      if(shareCell){ neighborIds[i].add(j); neighborIds[j].add(i); }
    }
  }
  const colorIndexOf = {};
  const order = thermos.map((_,i) => i).sort((a,b) => neighborIds[b].size - neighborIds[a].size);
  order.forEach(i => {
    const used = new Set();
    neighborIds[i].forEach(j => { if(colorIndexOf[j] !== undefined) used.add(colorIndexOf[j]); });
    let chosen = 0;
    while(used.has(chosen) && chosen < THERMO_COLOR_PALETTE.length - 1) chosen++;
    colorIndexOf[i] = chosen;
  });
  return thermos.map((path, i) => ({ path, color: THERMO_COLOR_PALETTE[colorIndexOf[i]] }));
}

// Baut ein komplettes Thermo-Sudoku-Rätsel: volles Lösungsgitter,
// Thermometer (mit Farben), Vorgaben nur außerhalb der Thermometer-Felder.
export function generateThermoPuzzle(level){
  const solution = generateFullBoard();
  const thermometersRaw = generateThermometers(solution, level);
  const thermoCellSet = new Set();
  thermometersRaw.forEach(path => path.forEach(([r,c]) => thermoCellSet.add(r+','+c)));
  const thermometers = assignThermoColors(thermometersRaw);
  const puzzle = Array.from({length:9}, () => Array(9).fill(0));
  const cellIdx = shuffle(Array.from({length:81}, (_,i) => i))
    .filter(idx => !thermoCellSet.has(Math.floor(idx/9)+','+(idx%9)));
  const givensWanted = level.givensMin + Math.floor(Math.random() * (level.givensMax - level.givensMin + 1));
  for(let i = 0; i < Math.min(givensWanted, cellIdx.length); i++){
    const idx = cellIdx[i];
    const r = Math.floor(idx / 9), c = idx % 9;
    puzzle[r][c] = solution[r][c];
  }
  return { puzzle, solution, thermometers };
}
