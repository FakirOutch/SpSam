// Unit-Test für core/attempts-fixtures.js — prüft, dass die geplanten
// Szenarien (Anzahl, Status-Mix, Zeitwertbarkeit) exakt wie dokumentiert
// vorliegen, BEVOR core/stats-utils.js (Punkt 19) darauf aufbaut.
//
//   node scripts/test-attempts-fixtures.mjs

const { generateFixtureAttempts } = await import('../core/attempts-fixtures.js');

let failed = 0;
function assertEqual(label, actual, expected){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ console.log('✓ ' + label); }
  else { failed++; console.log('✗ ' + label); console.log('    erwartet: ' + e); console.log('    erhalten: ' + a); }
}

const entries = generateFixtureAttempts();

console.log('=== Grundzahlen ===');
assertEqual('Gesamtanzahl', entries.length, 264);
const ids = new Set(entries.map(e => e.attemptId));
assertEqual('alle attemptId eindeutig', ids.size, entries.length);

function filterBy(gameId, difficulty){
  return entries.filter(e => e.gameId === gameId && e.difficulty === difficulty)
    .sort((a, b) => a.finishedAt - b.finishedAt);
}

console.log('\n=== sudoku / Stufe 3 (100-vs-100-Szenario) ===');
{
  const list = filterBy('sudoku', 3);
  assertEqual('Anzahl = 200 (exakt für 100-vs-100)', list.length, 200);
  const older = list.slice(0, 100), newer = list.slice(100);
  assertEqual('alle 200 solved', list.every(e => e.status === 'solved'), true);
  assertEqual('alle 200 timingEligible', list.every(e => e.timingEligible === true), true);
  assertEqual('ältere 100 Dauer = 600000ms', older.every(e => e.durationMs === 600000), true);
  assertEqual('neuere 100 Dauer = 480000ms', newer.every(e => e.durationMs === 480000), true);
}

console.log('\n=== hashi / Stufe 2 (10-vs-10-Szenario) ===');
{
  const list = filterBy('hashi', 2);
  assertEqual('Anzahl = 20 (exakt für 10-vs-10)', list.length, 20);
  const older = list.slice(0, 10), newer = list.slice(10);
  assertEqual('ältere 10 Dauer = 300000ms', older.every(e => e.durationMs === 300000), true);
  assertEqual('neuere 10 Dauer = 240000ms', newer.every(e => e.durationMs === 240000), true);
}

console.log('\n=== futoshiki / Stufe 5 (gemischt: Status + Zeitwertbarkeit) ===');
{
  const list = filterBy('futoshiki', 5);
  assertEqual('Anzahl = 20', list.length, 20);
  const older = list.slice(0, 10), newer = list.slice(10);
  assertEqual('ältere 10: 8 solved + 2 revealed', {
    solved: older.filter(e => e.status === 'solved').length,
    revealed: older.filter(e => e.status === 'revealed').length,
  }, { solved: 8, revealed: 2 });
  assertEqual('neuere 10: 6 solved + 4 revealed', {
    solved: newer.filter(e => e.status === 'solved').length,
    revealed: newer.filter(e => e.status === 'revealed').length,
  }, { solved: 6, revealed: 4 });
  const newerTimedSolved = newer.filter(e => e.status === 'solved' && e.timingEligible);
  const newerSolvedNotEligible = newer.filter(e => e.status === 'solved' && !e.timingEligible);
  assertEqual('neuere solved: 5 timingEligible + 1 NICHT eligible', {
    eligible: newerTimedSolved.length, notEligible: newerSolvedNotEligible.length,
  }, { eligible: 5, notEligible: 1 });
  assertEqual('der nicht wertbare Versuch liegt über der 2h-Grenze (durationMs gedeckelt)', newerSolvedNotEligible[0].durationMs, 2 * 60 * 60 * 1000);
}

console.log('\n=== kakuro / Stufe 1 (bewusst zu wenig Daten) ===');
{
  const list = filterBy('kakuro', 1);
  assertEqual('Anzahl = 15 (< 20, reicht NICHT für 10-vs-10)', list.length, 15);
  assertEqual('davon 10 solved, 5 abandoned', {
    solved: list.filter(e => e.status === 'solved').length,
    abandoned: list.filter(e => e.status === 'abandoned').length,
  }, { solved: 10, abandoned: 5 });
}

console.log('\n=== minesweeper / beginner (Randfall sehr wenige Daten) ===');
{
  const list = filterBy('minesweeper', 'beginner');
  assertEqual('Anzahl = 3', list.length, 3);
  const lost = list.find(e => e.outcome === 'mine_hit');
  assertEqual('ein Verlust-Versuch mit outcome mine_hit vorhanden', !!lost, true);
  assertEqual('Verlust-Versuch hat status abandoned', lost.status, 'abandoned');
}

console.log('\n' + (failed === 0 ? 'Alle Tests bestanden.' : failed + ' Test(s) fehlgeschlagen.'));
process.exit(failed === 0 ? 0 : 1);
