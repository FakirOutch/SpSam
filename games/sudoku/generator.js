function shuffle(values){
  const result = values.slice();
  for(let i = result.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function isSafe(board, row, col, value){
  for(let i = 0; i < 9; i++){
    if(board[row][i] === value || board[i][col] === value) return false;
  }
  const boxRow = row - row % 3;
  const boxCol = col - col % 3;
  for(let r = 0; r < 3; r++){
    for(let c = 0; c < 3; c++){
      if(board[boxRow + r][boxCol + c] === value) return false;
    }
  }
  return true;
}

function fillBoard(board, position = 0){
  if(position === 81) return true;
  const row = Math.floor(position / 9);
  const col = position % 9;
  for(const value of shuffle([1,2,3,4,5,6,7,8,9])){
    if(!isSafe(board, row, col, value)) continue;
    board[row][col] = value;
    if(fillBoard(board, position + 1)) return true;
    board[row][col] = 0;
  }
  return false;
}

export function generatePuzzle(clueCount){
  const solution = Array.from({ length: 9 }, () => Array(9).fill(0));
  fillBoard(solution);
  const puzzle = solution.map(row => row.slice());
  const cells = shuffle(Array.from({ length: 81 }, (_, index) => index));
  for(let i = 0; i < 81 - clueCount; i++){
    const index = cells[i];
    puzzle[Math.floor(index / 9)][index % 9] = 0;
  }
  return { puzzle, solution };
}
