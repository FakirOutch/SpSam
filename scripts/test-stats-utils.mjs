// Unit-Test für core/stats-utils.js, verifiziert gegen die deterministischen
// Testdaten aus core/attempts-fixtures.js (Backlog Punkt 20).
//
//   node scripts/test-stats-utils.mjs

const { generateFixtureAttempts } = await import('../core/attempts-fixtures.js');
const {
  computeOverview, computeGameOverview, computeGameDifficultyOverview,
  computeTrend, computeAllTrends, getAvailableGames, getAvailableDifficulties,
} = await import('../core/stats-utils.js');

let failed = 0;
function assertEqual(label, actual, expected){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ console.log('✓ ' + label); }
  else { failed++; console.log('✗ ' + label); console.log('    erwartet: ' + e); console.log('    erhalten: ' + a); }
}

const attempts = generateFixtureAttempts();

console.log('=== Gesamtübersicht ===');
{
  const overview = computeOverview(attempts);
  // played = 264 gesamt; solved = alle "solved"-Status ueber alle Szenarien:
  // sudoku 200 + sudoku(Stufe1) 6 + hashi 20 + futoshiki(8+5+1=14 solved) + kakuro 10 + minesweeper 2 = 252
  assertEqual('Gesamt gespielt = 264', overview.played, 264);
  assertEqual('Gesamt gelöst = 252', overview.solved, 252);
}

console.log('\n=== Spielweite Übersicht ===');
{
  const sudoku = computeGameOverview(attempts, 'sudoku');
  assertEqual('sudoku gesamt gespielt = 206 (200+6)', sudoku.played, 206);
  assertEqual('sudoku gesamt gelöst = 206 (alle solved)', sudoku.solved, 206);

  const futoshiki = computeGameDifficultyOverview(attempts, 'futoshiki', 5);
  assertEqual('futoshiki/5 gespielt = 20', futoshiki.played, 20);
  assertEqual('futoshiki/5 gelöst = 14 (8+5+1)', futoshiki.solved, 14);
}

console.log('\n=== Filter-Hilfsfunktionen ===');
{
  const games = getAvailableGames(attempts);
  assertEqual('verfügbare Spiele enthalten alle sechs Fixture-Spiele', games.sort(), ['futoshiki', 'hashi', 'kakuro', 'minesweeper', 'sudoku'].sort());
  const sudokuDiffs = getAvailableDifficulties(attempts, 'sudoku');
  assertEqual('sudoku-Stufen = 1 und 3', sudokuDiffs.sort(), [1, 3].sort());
}

console.log('\n=== Trend sudoku/3, N=100 (exaktes 100-vs-100-Szenario) ===');
{
  const trend = computeTrend(attempts, 'sudoku', 3, 100);
  assertEqual('genug Daten für Lösungsrate', trend.solveRate.enoughData, true);
  assertEqual('Lösungsrate unverändert (100% -> 100%, ±0 Punkte)', trend.solveRate.changePts, 0);
  assertEqual('genug Daten für Geschwindigkeit', trend.speed.enoughData, true);
  assertEqual('ältere Ø-Dauer = 600000ms', trend.speed.precedingAvgMs, 600000);
  assertEqual('neuere Ø-Dauer = 480000ms', trend.speed.latestAvgMs, 480000);
  assertEqual('Geschwindigkeitsverbesserung = 20.0%', trend.speed.improvementPct, 20);
}

console.log('\n=== Trend hashi/2, N=10 (exaktes 10-vs-10-Szenario) ===');
{
  const trend = computeTrend(attempts, 'hashi', 2, 10);
  assertEqual('genug Daten', trend.solveRate.enoughData && trend.speed.enoughData, true);
  assertEqual('Geschwindigkeitsverbesserung = 20.0%', trend.speed.improvementPct, 20);
  assertEqual('Lösungsrate ±0 Punkte', trend.solveRate.changePts, 0);
}

console.log('\n=== Trend futoshiki/5, N=10 (gemischter Status + gemischte Zeitwertbarkeit) ===');
{
  const trend = computeTrend(attempts, 'futoshiki', 5, 10);
  assertEqual('Lösungsrate älter = 80%', trend.solveRate.precedingPct, 80);
  assertEqual('Lösungsrate neuer = 60%', trend.solveRate.latestPct, 60);
  assertEqual('Lösungsratenänderung = -20 Punkte', trend.solveRate.changePts, -20);
  assertEqual('Geschwindigkeit: genug Daten trotz einem nicht wertbaren Versuch (8 vs. 5 Stichproben)', trend.speed.enoughData, true);
  assertEqual('ältere Ø-Dauer (8 Versuche) = 200000ms', trend.speed.precedingAvgMs, 200000);
  assertEqual('neuere Ø-Dauer (NUR 5 wertbare von 6 solved) = 150000ms', trend.speed.latestAvgMs, 150000);
  assertEqual('Geschwindigkeitsverbesserung = 25.0%', trend.speed.improvementPct, 25);
}

console.log('\n=== Trend kakuro/1 (bewusst zu wenig Daten für N=10) ===');
{
  const trend = computeTrend(attempts, 'kakuro', 1, 10);
  assertEqual('NICHT genug Daten für Lösungsrate (15 < 20)', trend.solveRate.enoughData, false);
  assertEqual('NICHT genug Daten für Geschwindigkeit', trend.speed.enoughData, false);
  assertEqual('gespielt/gelöst bleiben trotzdem korrekt (Übersicht ist unabhängig vom Trend)',
    computeGameDifficultyOverview(attempts, 'kakuro', 1), { played: 15, solved: 10 });
}

console.log('\n=== Trend für N=50 ohne jegliche Daten (sudoku/1 hat nur 6 Versuche) ===');
{
  const trend = computeTrend(attempts, 'sudoku', 1, 50);
  assertEqual('NICHT genug Daten', trend.solveRate.enoughData, false);
}

console.log('\n=== computeAllTrends liefert alle drei Fenstergrößen ===');
{
  const all = computeAllTrends(attempts, 'sudoku', 3);
  assertEqual('drei Einträge (10, 50, 100)', all.map(t => t.windowSize), [10, 50, 100]);
  assertEqual('N=10 hat ebenfalls genug Daten (200 Versuche reichen für alle drei Fenster)', all[0].solveRate.enoughData, true);
}

console.log('\n=== ungültige Fenstergröße wirft einen Fehler (kein stiller Fehlwert) ===');
{
  let threw = false;
  try { computeTrend(attempts, 'sudoku', 3, 7); } catch(e){ threw = true; }
  assertEqual('Fehler bei windowSize=7', threw, true);
}

console.log('\n' + (failed === 0 ? 'Alle Tests bestanden.' : failed + ' Test(s) fehlgeschlagen.'));
process.exit(failed === 0 ? 0 : 1);
