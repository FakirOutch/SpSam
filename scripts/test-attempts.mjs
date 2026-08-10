// Unit-Test für core/attempts.js. Läuft mit reinem Node (kein Browser
// nötig), verwendet einen minimalen In-Memory-localStorage-Ersatz.
//
//   node scripts/test-attempts.mjs

globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _reset: () => { store = {}; },
  };
})();

const { beginAttempt, finishAttempt, getAllAttempts, clearAllAttempts, MAX_TIMED_MS } = await import('../core/attempts.js');

let failed = 0;
function assertEqual(label, actual, expected){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ console.log('✓ ' + label); }
  else { failed++; console.log('✗ ' + label); console.log('    erwartet: ' + e); console.log('    erhalten: ' + a); }
}
function assertTrue(label, cond){ assertEqual(label, !!cond, true); }

console.log('=== beginAttempt() ===');
clearAllAttempts();
const a1 = beginAttempt('sudoku');
const a2 = beginAttempt('sudoku');
assertTrue('liefert attemptId', typeof a1.attemptId === 'string' && a1.attemptId.length > 0);
assertTrue('liefert createdAt (Zahl)', typeof a1.createdAt === 'number');
assertTrue('zwei begonnene Versuche haben unterschiedliche attemptId', a1.attemptId !== a2.attemptId);
assertEqual('beginAttempt() schreibt noch nichts ins Log', getAllAttempts().length, 0);

console.log('\n=== finishAttempt(): Grundfall "solved" ===');
clearAllAttempts();
{
  const now = Date.now();
  finishAttempt({
    attemptId: 'x1', gameId: 'sudoku', profileId: 'p1', difficulty: 3,
    generatorRef: 1, schemaRef: 2,
    createdAt: now - 5000, firstActionAt: now - 4000, finishedAt: now,
    status: 'solved', hintsUsed: 1,
  });
  const all = getAllAttempts();
  assertEqual('genau ein Eintrag im Log', all.length, 1);
  assertEqual('status korrekt', all[0].status, 'solved');
  assertEqual('hintsUsed korrekt', all[0].hintsUsed, 1);
  assertTrue('timingEligible bei kurzer Dauer true', all[0].timingEligible === true);
  assertEqual('durationMs = finishedAt - createdAt (ungedeckelt)', all[0].durationMs, 5000);
}

console.log('\n=== Kein Eintrag ohne reguläre Aktion (firstActionAt fehlt) ===');
clearAllAttempts();
finishAttempt({
  attemptId: 'x2', gameId: 'sudoku', createdAt: Date.now(), firstActionAt: null,
  status: 'abandoned',
});
assertEqual('kein Log-Eintrag ohne firstActionAt', getAllAttempts().length, 0);

console.log('\n=== Niemals doppelt abschließen (gleiche attemptId) ===');
clearAllAttempts();
{
  const now = Date.now();
  finishAttempt({ attemptId: 'dup1', gameId: 'hashi', createdAt: now - 1000, firstActionAt: now - 500, status: 'solved' });
  finishAttempt({ attemptId: 'dup1', gameId: 'hashi', createdAt: now - 1000, firstActionAt: now - 500, status: 'abandoned' });
  const all = getAllAttempts();
  assertEqual('nur EIN Eintrag trotz zweitem finishAttempt()-Aufruf', all.length, 1);
  assertEqual('erster Status bleibt erhalten (kein Überschreiben)', all[0].status, 'solved');
}

console.log('\n=== Fehlende Pflichtfelder -> stiller No-op, nie werfen ===');
clearAllAttempts();
finishAttempt(null);
finishAttempt({});
finishAttempt({ attemptId: 'x3' }); // gameId/status fehlen
finishAttempt({ attemptId: 'x4', gameId: 'sudoku', firstActionAt: Date.now(), status: 'unbekannt' }); // ungültiger Status
assertEqual('keine der fehlerhaften Aufrufe erzeugt einen Eintrag', getAllAttempts().length, 0);

console.log('\n=== 2-Stunden-Grenze (Backlog Punkt 17) ===');
clearAllAttempts();
{
  const now = Date.now();
  // Unter der Grenze: voll wertbar
  finishAttempt({
    attemptId: 'timed-ok', gameId: 'kakuro',
    createdAt: now - (60 * 60 * 1000), firstActionAt: now - (60 * 60 * 1000), finishedAt: now,
    status: 'solved',
  });
  // Über der Grenze: gedeckelt, nicht wertbar, aber weiterhin "solved"
  finishAttempt({
    attemptId: 'timed-over', gameId: 'kakuro',
    createdAt: now - (3 * 60 * 60 * 1000), firstActionAt: now - (3 * 60 * 60 * 1000), finishedAt: now,
    status: 'solved',
  });
  // Über der Grenze UND nicht gelöst (verworfen)
  finishAttempt({
    attemptId: 'timed-over-abandoned', gameId: 'kakuro',
    createdAt: now - (5 * 60 * 60 * 1000), firstActionAt: now - (5 * 60 * 60 * 1000), finishedAt: now,
    status: 'abandoned',
  });
  const all = getAllAttempts();
  const ok = all.find(e => e.attemptId === 'timed-ok');
  const over = all.find(e => e.attemptId === 'timed-over');
  const overAbandoned = all.find(e => e.attemptId === 'timed-over-abandoned');
  assertTrue('unter 2h: timingEligible true', ok.timingEligible === true);
  assertEqual('unter 2h: durationMs ungedeckelt', ok.durationMs, 60 * 60 * 1000);
  assertTrue('über 2h: timingEligible false', over.timingEligible === false);
  assertEqual('über 2h: durationMs gedeckelt auf MAX_TIMED_MS', over.durationMs, MAX_TIMED_MS);
  assertEqual('über 2h: status bleibt "solved" (zählt trotzdem als gelöst)', over.status, 'solved');
  assertTrue('über 2h + abgebrochen: timingEligible false', overAbandoned.timingEligible === false);
  assertEqual('über 2h + abgebrochen: status bleibt "abandoned"', overAbandoned.status, 'abandoned');
}

console.log('\n=== outcome-Zusatzfeld (z.B. Minesweeper-Verlust) ändert den Status-Enum nicht ===');
clearAllAttempts();
{
  const now = Date.now();
  finishAttempt({
    attemptId: 'mine1', gameId: 'minesweeper',
    createdAt: now - 2000, firstActionAt: now - 2000, finishedAt: now,
    status: 'abandoned', outcome: 'mine_hit',
  });
  const all = getAllAttempts();
  assertEqual('status bleibt im vorgegebenen Enum', all[0].status, 'abandoned');
  assertEqual('outcome wird zusätzlich mitgeführt', all[0].outcome, 'mine_hit');
}

console.log('\n=== Persistenz über mehrere "Sitzungen" (gleicher localStorage) ===');
clearAllAttempts();
{
  const now = Date.now();
  finishAttempt({ attemptId: 'persist1', gameId: 'sudoku', createdAt: now, firstActionAt: now, status: 'solved' });
}
// Erneuter Import würde in echtem Node-Kontext dieselbe Modul-Instanz
// liefern (ESM-Cache) — Persistenz wird stattdessen direkt über den
// localStorage-Inhalt geprüft (die eigentliche Instanz, die auch ein
// Browser-Reload sehen würde).
{
  const raw = JSON.parse(localStorage.getItem('arkimis_attempts_v1'));
  assertEqual('Log liegt unter dem dokumentierten Storage-Key', raw.entries.length, 1);
  assertEqual('schemaVersion ist gesetzt', typeof raw.schemaVersion, 'number');
}

console.log('\n' + (failed === 0 ? 'Alle Tests bestanden.' : failed + ' Test(s) fehlgeschlagen.'));
process.exit(failed === 0 ? 0 : 1);
