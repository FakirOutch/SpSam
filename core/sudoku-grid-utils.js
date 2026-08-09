// Zustandslose Hilfsfunktion für die klassischen Sudoku-Blocklinien
// (äußerer Rahmen + dicke 3x3-Block-Trennlinien, dünne Linien sonst).
// Gemeinsam genutzt von Sudoku, Killer Sudoku und Thermo Sudoku — die
// einzigen drei Module mit einem klassischen 9x9-Sudoku-Raster.
//
// Liefert ein ARRAY von box-shadow-Teilstrings (bewusst nicht bereits
// zusammengefügt), damit aufrufende Module bei Bedarf noch eigene,
// zusätzliche Linien anhängen können (z.B. Killer Sudokus Käfiggrenzen),
// bevor sie selbst `.join(', ')` aufrufen und das Ergebnis als
// `--lines`-CSS-Variable setzen.
//
// Bewusst NUR die Blocklinien — Timer-, Fokus- und Eingabelogik bleiben
// unangetastet und weiterhin je Modul eigenständig.
export function sudokuBlockLines(row, col){
  const lines = [];
  if(col === 0) lines.push('inset 1px 0 0 var(--ink)', 'inset 2px 0 0 #fff', 'inset 3px 0 0 var(--ink)');
  if(row === 0) lines.push('inset 0 1px 0 var(--ink)', 'inset 0 2px 0 #fff', 'inset 0 3px 0 var(--ink)');
  if(col % 3 === 2) lines.push('inset -1px 0 0 var(--ink)', 'inset -2px 0 0 #fff', 'inset -3px 0 0 var(--ink)');
  else lines.push('inset -1px 0 0 var(--ink-faint)');
  if(row % 3 === 2) lines.push('inset 0 -1px 0 var(--ink)', 'inset 0 -2px 0 #fff', 'inset 0 -3px 0 var(--ink)');
  else lines.push('inset 0 -1px 0 var(--ink-faint)');
  return lines;
}
