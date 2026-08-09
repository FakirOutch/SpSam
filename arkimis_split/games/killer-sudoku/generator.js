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

// Weist jedem Käfig eine Linienfarbe zu, sodass zwei ANGRENZENDE Käfige nie
// dieselbe Farbe bekommen (Greedy-Graph-Färbung) — macht benachbarte Käfige
// auf einen Blick unterscheidbar statt einheitlich einfarbig.
export const CAGE_COLOR_PALETTE = [
  'var(--accent-dark)', 'var(--primary-dark)', 'var(--lilac-dark)',
  'var(--danger-ink)', 'var(--success)', '#4A6FA5',
];
// Passende helle Variante je Farbe (gleicher Index) — für die
// Flächen-Darstellung, wo die Zellfläche statt einer Linie eingefärbt wird.
export const CAGE_BG_PALETTE = [
  'var(--accent-bg)', 'var(--primary-bg)', 'var(--lilac-bg)',
  'var(--danger-bg)', 'var(--success-bg)', '#E4EBF5',
];
function assignCageColors(cages, cageId, size){
  const neighborIds = new Map();
  cages.forEach(cage => neighborIds.set(cage.id, new Set()));
  for(let r = 0; r < size; r++){
    for(let c = 0; c < size; c++){
      const id = cageId[r][c];
      if(c+1 < size && cageId[r][c+1] !== id){
        neighborIds.get(id).add(cageId[r][c+1]);
        neighborIds.get(cageId[r][c+1]).add(id);
      }
      if(r+1 < size && cageId[r+1][c] !== id){
        neighborIds.get(id).add(cageId[r+1][c]);
        neighborIds.get(cageId[r+1][c]).add(id);
      }
    }
  }
  const colorIndexOf = {};
  // Käfige mit den meisten Nachbarn zuerst einfärben — liefert bei Greedy-
  // Färbung zuverlässiger echte Unterscheidbarkeit als eine feste Reihenfolge.
  const order = cages.slice().sort((a,b) => neighborIds.get(b.id).size - neighborIds.get(a.id).size);
  order.forEach(cage => {
    const used = new Set();
    neighborIds.get(cage.id).forEach(nId => {
      if(colorIndexOf[nId] !== undefined) used.add(colorIndexOf[nId]);
    });
    let chosen = 0;
    while(used.has(chosen) && chosen < CAGE_COLOR_PALETTE.length - 1) chosen++;
    colorIndexOf[cage.id] = chosen;
  });
  cages.forEach(cage => {
    cage.color = CAGE_COLOR_PALETTE[colorIndexOf[cage.id]];
    cage.bgColor = CAGE_BG_PALETTE[colorIndexOf[cage.id]];
  });
}

// Verteilt die Zellen eines vollständigen Lösungsgitters auf Käfige.
// Wachstum in Lese-Reihenfolge hält die Form kompakt; übrig gebliebene
// Einzelzellen werden anschließend, wenn möglich, mit einem
// benachbarten Käfig verschmolzen (weniger "verschenkte" Einzelfelder).
export function generateKillerCages(solution, minCage, maxCage){
  const size = 9;
  const cageId = Array.from({length:size}, () => Array(size).fill(-1));
  const cages = [];

  function growFrom(r0, c0){
    if(cageId[r0][c0] !== -1) return;
    const id = cages.length;
    const cells = [[r0,c0]];
    cageId[r0][c0] = id;
    const usedDigits = new Set([solution[r0][c0]]);
    const targetSize = minCage + Math.floor(Math.random() * (maxCage - minCage + 1));
    let guard = 0;
    while(cells.length < targetSize && guard < 30){
      guard++;
      const candidates = [];
      for(const [r,c] of cells){
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc]) => {
          const rr = r+dr, cc = c+dc;
          if(rr>=0 && rr<size && cc>=0 && cc<size && cageId[rr][cc]===-1){
            const digit = solution[rr][cc];
            if(!usedDigits.has(digit)) candidates.push([rr,cc]);
          }
        });
      }
      if(!candidates.length) break;
      const [nr,nc] = candidates[Math.floor(Math.random()*candidates.length)];
      cells.push([nr,nc]);
      cageId[nr][nc] = id;
      usedDigits.add(solution[nr][nc]);
    }
    const sum = cells.reduce((s,[r,c]) => s + solution[r][c], 0);
    cages.push({ id, cells, sum });
  }

  for(let r = 0; r < size; r++) for(let c = 0; c < size; c++) growFrom(r, c);

  let merged = true;
  while(merged){
    merged = false;
    for(const cage of cages){
      if(cage.cells.length !== 1) continue;
      const [r,c] = cage.cells[0];
      const neighbors = [[1,0],[-1,0],[0,1],[0,-1]]
        .map(([dr,dc]) => [r+dr, c+dc])
        .filter(([rr,cc]) => rr>=0 && rr<size && cc>=0 && cc<size);
      for(const [rr,cc] of neighbors){
        const otherId = cageId[rr][cc];
        if(otherId === cage.id) continue;
        const other = cages.find(cg => cg.id === otherId);
        if(!other || other.cells.length >= maxCage) continue;
        const otherDigits = new Set(other.cells.map(([or,oc]) => solution[or][oc]));
        if(otherDigits.has(solution[r][c])) continue;
        other.cells.push([r,c]);
        other.sum += solution[r][c];
        cageId[r][c] = other.id;
        cage.cells = [];
        merged = true;
        break;
      }
      if(merged) break;
    }
    for(let i = cages.length-1; i >= 0; i--){ if(cages[i].cells.length === 0) cages.splice(i,1); }
  }

  assignCageColors(cages, cageId, size);
  return { cageId, cages };
}

// Baut ein komplettes Killer-Sudoku-Rätsel: volles Lösungsgitter, ein paar
// zufällige Vorgaben je nach Schwierigkeit, plus die Käfig-Einteilung.
export function generateKillerPuzzle(level){
  const solution = generateFullBoard();
  const puzzle = Array.from({length:9}, () => Array(9).fill(0));
  const cellIdx = shuffle(Array.from({length:81}, (_,i) => i));
  for(let i = 0; i < (level.givens || 0); i++){
    const idx = cellIdx[i];
    const r = Math.floor(idx / 9), c = idx % 9;
    puzzle[r][c] = solution[r][c];
  }
  const cages = generateKillerCages(solution, level.minCage, level.maxCage);
  return { puzzle, solution, cages };
}
