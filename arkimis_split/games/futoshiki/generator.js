import { countSolutions } from './solver.js';

function shuffle(values){
  const result = values.slice();
  for(let i = result.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function isSafe(board, row, col, num, n){
  for(let x = 0; x < n; x++){
    if(board[row][x] === num) return false;
    if(board[x][col] === num) return false;
  }
  return true;
}
function fillLatin(board, n, pos = 0){
  if(pos === n * n) return true;
  const row = Math.floor(pos / n), col = pos % n;
  const nums = shuffle(Array.from({length:n}, (_,i) => i + 1));
  for(const num of nums){
    if(isSafe(board, row, col, num, n)){
      board[row][col] = num;
      if(fillLatin(board, n, pos + 1)) return true;
      board[row][col] = 0;
    }
  }
  return false;
}

export function generateFutoshikiPuzzle(n, givenCount, constraintCount){
  const solution = Array.from({length:n}, () => Array(n).fill(0));
  fillLatin(solution, n);
  const candidates = [];
  for(let r = 0; r < n; r++){
    for(let c = 0; c < n; c++){
      if(c < n - 1) candidates.push({ r1:r, c1:c, r2:r, c2:c+1, horizontal:true });
      if(r < n - 1) candidates.push({ r1:r, c1:c, r2:r+1, c2:c, horizontal:false });
    }
  }
  shuffle(candidates);
  const constraints = candidates.slice(0, Math.min(constraintCount, candidates.length)).map(pair => {
    const v1 = solution[pair.r1][pair.c1], v2 = solution[pair.r2][pair.c2];
    return { ...pair, sign: v1 < v2 ? '<' : '>' };
  });
  // Ausgraben-Technik: erst ALLE Zellen als Vorgabe sichtbar starten
  // (garantiert eindeutig), dann in zufälliger Reihenfolge eine Zelle nach
  // der anderen ausblenden — aber NUR, wenn das Rätsel danach nachweislich
  // weiterhin genau eine Lösung hat.
  const given = Array.from({length:n}, () => Array(n).fill(true));
  const cellOrder = shuffle(Array.from({length:n*n}, (_,i) => i));
  let currentGivenCount = n*n;
  const stepBudget = 6000; // deckelt die Solver-Kosten je Einzelprüfung
  for(const idx of cellOrder){
    if(currentGivenCount <= givenCount) break;
    const r = Math.floor(idx/n), c = idx % n;
    given[r][c] = false;
    const solutions = countSolutions(n, given, solution, constraints, 2, stepBudget);
    if(solutions === 1){
      currentGivenCount--;
    } else {
      given[r][c] = true; // Ausblenden hätte Mehrdeutigkeit erzeugt — zurücklegen
    }
  }
  return { n, solution, constraints, given };
}

export function cellSizeFor(n){
  const referenceWidth = 320; // sichere Bezugsbreite innerhalb des App-Inhalts
  const gapSize = 14;
  const totalGap = (n - 1) * gapSize;
  const mainSize = Math.max(26, Math.min(46, Math.floor((referenceWidth - totalGap) / n)));
  return { mainSize, gapSize };
}
