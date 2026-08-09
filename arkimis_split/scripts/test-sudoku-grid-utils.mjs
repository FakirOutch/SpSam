// Unit-Test für die zustandslose Blocklinien-Utility. Läuft mit reinem
// Node (kein Browser nötig):
//
//   node scripts/test-sudoku-grid-utils.mjs
//
import { sudokuBlockLines } from '../core/sudoku-grid-utils.js';

let failed = 0;
function assertEqual(label, actual, expected){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){
    console.log('✓ ' + label);
  } else {
    failed++;
    console.log('✗ ' + label);
    console.log('    erwartet: ' + e);
    console.log('    erhalten: ' + a);
  }
}

const ink = 'inset %s 0 0 var(--ink)';
const white = 'inset %s 0 0 #fff';
// Kleine Helfer, um die erwarteten Linien lesbar zusammenzusetzen.
const left = ['inset 1px 0 0 var(--ink)', 'inset 2px 0 0 #fff', 'inset 3px 0 0 var(--ink)'];
const top = ['inset 0 1px 0 var(--ink)', 'inset 0 2px 0 #fff', 'inset 0 3px 0 var(--ink)'];
const thickRight = ['inset -1px 0 0 var(--ink)', 'inset -2px 0 0 #fff', 'inset -3px 0 0 var(--ink)'];
const thinRight = ['inset -1px 0 0 var(--ink-faint)'];
const thickBottom = ['inset 0 -1px 0 var(--ink)', 'inset 0 -2px 0 #fff', 'inset 0 -3px 0 var(--ink)'];
const thinBottom = ['inset 0 -1px 0 var(--ink-faint)'];

console.log('=== Ecken ===');
assertEqual('oben-links (0,0): äußerer Rahmen oben+links, dünn rechts+unten',
  sudokuBlockLines(0, 0), [...left, ...top, ...thinRight, ...thinBottom]);
assertEqual('oben-rechts (0,8): äußerer Rahmen oben, dicker rechter Blockrand (Spalte 8 = Block-Ende), dünn unten',
  sudokuBlockLines(0, 8), [...top, ...thickRight, ...thinBottom]);
assertEqual('unten-links (8,0): äußerer Rahmen links, dünn rechts, dicker unterer Blockrand (Zeile 8 = Block-Ende)',
  sudokuBlockLines(8, 0), [...left, ...thinRight, ...thickBottom]);
assertEqual('unten-rechts (8,8): dicker rechter + unterer Blockrand (beide Block-Enden), kein äußerer Rahmen oben/links',
  sudokuBlockLines(8, 8), [...thickRight, ...thickBottom]);

console.log('');
console.log('=== Blockgrenzen (innere 3x3-Trennlinien, nicht am äußeren Rand) ===');
assertEqual('(4,2): rechter Blockrand (Spalte 2 = Block-Ende), sonst dünn',
  sudokuBlockLines(4, 2), [...thickRight, ...thinBottom]);
assertEqual('(4,5): rechter Blockrand (Spalte 5 = Block-Ende), sonst dünn',
  sudokuBlockLines(4, 5), [...thickRight, ...thinBottom]);
assertEqual('(2,4): unterer Blockrand (Zeile 2 = Block-Ende), sonst dünn',
  sudokuBlockLines(2, 4), [...thinRight, ...thickBottom]);
assertEqual('(5,4): unterer Blockrand (Zeile 5 = Block-Ende), sonst dünn',
  sudokuBlockLines(5, 4), [...thinRight, ...thickBottom]);

console.log('');
console.log('=== Innenfelder (kein äußerer Rahmen, keine Blockgrenze) ===');
assertEqual('(1,1): komplett dünn, keine Vorgabe trifft zu',
  sudokuBlockLines(1, 1), [...thinRight, ...thinBottom]);
assertEqual('(4,4): Zentrum des mittleren Blocks, komplett dünn',
  sudokuBlockLines(4, 4), [...thinRight, ...thinBottom]);
assertEqual('(7,7): letzter Block, aber nicht dessen Ende (Block-Ende wäre 8), komplett dünn',
  sudokuBlockLines(7, 7), [...thinRight, ...thinBottom]);

console.log('');
console.log('=== Kombinationen (mehrere Bedingungen gleichzeitig) ===');
assertEqual('(0,2): oberer äußerer Rahmen + rechter Blockrand gleichzeitig',
  sudokuBlockLines(0, 2), [...top, ...thickRight, ...thinBottom]);
assertEqual('(2,0): linker äußerer Rahmen + unterer Blockrand gleichzeitig',
  sudokuBlockLines(2, 0), [...left, ...thinRight, ...thickBottom]);
assertEqual('(2,2): rechter UND unterer Blockrand gleichzeitig (Block-Ecke Mitte des Rasters)',
  sudokuBlockLines(2, 2), [...thickRight, ...thickBottom]);
assertEqual('(5,5): rechter UND unterer Blockrand gleichzeitig (zweite Block-Ecke)',
  sudokuBlockLines(5, 5), [...thickRight, ...thickBottom]);

console.log('');
console.log('=== Rückgabetyp: Array, kein bereits zusammengefügter String ===');
const result = sudokuBlockLines(1, 1);
assertEqual('Rückgabewert ist ein Array', Array.isArray(result), true);
console.log('');
console.log('=== Reine Funktion: gleicher Aufruf liefert unabhängige, neue Arrays ===');
const r1 = sudokuBlockLines(3, 3);
const r2 = sudokuBlockLines(3, 3);
assertEqual('Werte identisch', r1, r2);
r1.push('zusätzliche-testzeile');
assertEqual('Mutation von r1 beeinflusst r2 NICHT (unabhängige Arrays, kein Caching)', r2.includes('zusätzliche-testzeile'), false);

console.log('');
if(failed === 0){
  console.log('Alle Tests bestanden.');
  process.exit(0);
} else {
  console.log(failed + ' Test(s) fehlgeschlagen.');
  process.exit(1);
}
