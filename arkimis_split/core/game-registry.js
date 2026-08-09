export const GAME_MODULES = Object.freeze({
  sudoku: Object.freeze({
    id: 'sudoku',
    apiVersion: 1,
    moduleVersion: 1,
    saveVersion: 1,
    generatorVersion: 1,
    load: () => import('../games/sudoku/game.js'),
  }),
  hashi: Object.freeze({
    id: 'hashi',
    apiVersion: 1,
    moduleVersion: 1,
    saveVersion: 1,
    generatorVersion: 1,
    load: () => import('../games/hashi/game.js'),
  }),
  kakuro: Object.freeze({
    id: 'kakuro',
    apiVersion: 1,
    moduleVersion: 1,
    saveVersion: 1,
    generatorVersion: 1,
    load: () => import('../games/kakuro/game.js'),
  }),
  minesweeper: Object.freeze({
    id: 'minesweeper',
    apiVersion: 1,
    moduleVersion: 1,
    saveVersion: 1,
    generatorVersion: 1,
    load: () => import('../games/minesweeper/game.js'),
  }),
  futoshiki: Object.freeze({
    id: 'futoshiki',
    apiVersion: 1,
    moduleVersion: 1,
    saveVersion: 1,
    generatorVersion: 1,
    load: () => import('../games/futoshiki/game.js'),
  }),
  'killer-sudoku': Object.freeze({
    id: 'killer-sudoku',
    apiVersion: 1,
    moduleVersion: 1,
    saveVersion: 1,
    generatorVersion: 1,
    load: () => import('../games/killer-sudoku/game.js'),
  }),
  'thermo-sudoku': Object.freeze({
    id: 'thermo-sudoku',
    apiVersion: 1,
    moduleVersion: 1,
    saveVersion: 1,
    generatorVersion: 1,
    load: () => import('../games/thermo-sudoku/game.js'),
  }),
});

export function getGameRegistration(gameId){
  return GAME_MODULES[gameId] || null;
}
