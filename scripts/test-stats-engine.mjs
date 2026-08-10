// Unit-Test für core/stats-engine.js (Backlog Punkt 19), verifiziert
// gegen die deterministischen Testdaten aus scripts/attempts-fixtures.mjs
// (Backlog Punkt 20). Reines Node, kein Browser nötig.
//
//   node scripts/test-stats-engine.mjs

import { generateAttempts, edgeCases } from './attempts-fixtures.mjs';
import { computeOverview, computeDifficultyStats, computeTrend, computeAllTrends } from '../core/stats-engine.js';

let failed = 0;
function assertEqual(label, actual, expected){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ console.log('✓ ' + label); }
  else { failed++; console.log('✗ ' + label); console.log('    erwartet: ' + e); console.log('    erhalten: ' + a); }
}
function assertTrue(label, cond){ assertEqual(label, !!cond, true); }

const cases = Object.fromEntries(edgeCases().map(c => [c.label, c.attempts]));

console.log('=== Grenzfall: 19 von 20 -> nicht genug Daten für 10er-Trend ===');
{
  const trend = computeTrend(cases['genau_19_von_20_zu_wenig_fuer_10er_trend'], 'sudoku', 3, 10);
  assertEqual('enoughData false bei 19 Versuchen', trend.enoughData, false);
  assertEqual('needed = 20', trend.needed, 20);
  assertEqual('available = 19', trend.available, 19);
}

console.log('\n=== Grenzfall: genau 20 -> 10er-Trend berechenbar ===');
{
  const trend = computeTrend(cases['genau_20_reicht_fuer_10er_trend'], 'sudoku', 3, 10);
  assertEqual('enoughData true bei genau 20 Versuchen', trend.enoughData, true);
  assertTrue('recentSolveRatePercent ist eine Zahl', typeof trend.recentSolveRatePercent === 'number');
}

console.log('\n=== Grenzfall: 99 von 100 -> nicht genug Daten für 50er-Trend ===');
{
  const trend = computeTrend(cases['genau_99_von_100_zu_wenig_fuer_50er_trend'], 'kakuro', 2, 50);
  assertEqual('enoughData false bei 99 Versuchen', trend.enoughData, false);
}

console.log('\n=== Grenzfall: genau 100 -> 50er-Trend berechenbar ===');
{
  const trend = computeTrend(cases['genau_100_reicht_fuer_50er_trend'], 'kakuro', 2, 50);
  assertEqual('enoughData true bei genau 100 Versuchen', trend.enoughData, true);
}

console.log('\n=== Grenzfall: genau 200 -> 100er-Trend berechenbar ===');
{
  const trend = computeTrend(cases['genau_200_reicht_fuer_100er_trend'], 'hashi', 4, 100);
  assertEqual('enoughData true bei genau 200 Versuchen', trend.enoughData, true);
}

console.log('\n=== Alle Versuche über 2h: gespielt/gelöst normal gezählt, aber keine wertbare Zeit ===');
{
  const attempts = cases['alle_ueber_2h_keine_wertbare_zeit_aber_gespielt_gezaehlt'];
  const stats = computeDifficultyStats(attempts, 'futoshiki', 5);
  assertEqual('alle 20 als gespielt gezählt', stats.played, 20);
  assertEqual('alle 20 als gelöst gezählt (solveRate=1 in den Fixtures)', stats.solved, 20);
  assertEqual('avgDurationMs ist null (keine timingEligible Versuche)', stats.avgDurationMs, null);
  assertEqual('avgDurationSampleSize ist 0', stats.avgDurationSampleSize, 0);
  const allIneligible = attempts.every(a => a.timingEligible === false);
  assertTrue('alle Fixture-Versuche tatsächlich timingEligible:false', allIneligible);

  const trend = computeTrend(attempts, 'futoshiki', 5, 10);
  assertEqual('Trend: enoughData true (Menge reicht)', trend.enoughData, true);
  assertEqual('Trend: speedImprovementPercent null (keine wertbare Zeit)', trend.speedImprovementPercent, null);
  assertEqual('Trend: speedComparable false', trend.speedComparable, false);
  assertEqual('Trend: solveRateChangePoints trotzdem berechnet', trend.solveRateChangePoints, 0); // 100% vs 100% Lösungsrate
}

console.log('\n=== Niemand gelöst: nur abgebrochen/revealed ===');
{
  const attempts = cases['niemand_gelöst_nur_abgebrochen_und_revealed'];
  const stats = computeDifficultyStats(attempts, 'thermo-sudoku', 1);
  assertEqual('played = 20', stats.played, 20);
  assertEqual('solved = 0', stats.solved, 0);
  assertEqual('solveRatePercent = 0', stats.solveRatePercent, 0);
  assertTrue('revealed + abandoned = played', stats.revealed + stats.abandoned === stats.played);
  assertTrue('mindestens ein revealed vorhanden (revealedShare=0.5 in den Fixtures)', stats.revealed > 0);
}

console.log('\n=== "Lösung angezeigt" zählt als gespielt, nicht als gelöst ===');
{
  const now = Date.now();
  const attempts = [
    { attemptId:'a', gameId:'sudoku', difficulty:1, createdAt:now-1000, firstActionAt:now-900, finishedAt:now, status:'revealed', durationMs:1000, timingEligible:true },
  ];
  const stats = computeDifficultyStats(attempts, 'sudoku', 1);
  assertEqual('played = 1', stats.played, 1);
  assertEqual('solved = 0', stats.solved, 0);
  assertEqual('revealed = 1', stats.revealed, 1);
}

console.log('\n=== Deutliche Geschwindigkeitsverbesserung wird erkannt (positiver Wert = schneller) ===');
{
  const attempts = cases['deutliche_geschwindigkeitsverbesserung'];
  const trend = computeTrend(attempts, 'killer-sudoku', 3, 10);
  assertEqual('enoughData true', trend.enoughData, true);
  assertTrue('speedImprovementPercent > 0 (Fixtures werden schneller)', trend.speedImprovementPercent > 0);
}

console.log('\n=== Verschiedene Spiele/Stufen werden NICHT vermischt ===');
{
  const attempts = cases['verschiedene_spiele_stufen_keine_vermischung'];
  const sudoku1 = computeDifficultyStats(attempts, 'sudoku', 1);
  const sudoku2 = computeDifficultyStats(attempts, 'sudoku', 2);
  const hashi1 = computeDifficultyStats(attempts, 'hashi', 1);
  assertEqual('sudoku Stufe 1: 15 Versuche', sudoku1.played, 15);
  assertEqual('sudoku Stufe 2: 15 Versuche (nicht 30)', sudoku2.played, 15);
  assertEqual('hashi Stufe 1: 15 Versuche (nicht vermischt mit sudoku)', hashi1.played, 15);
  const overview = computeOverview(attempts, { gameId: 'sudoku' });
  assertEqual('Gesamtübersicht sudoku (beide Stufen zusammen): 30 Versuche', overview.played, 30);
}

console.log('\n=== computeOverview ohne Spielfilter summiert alles ===');
{
  const attempts = cases['verschiedene_spiele_stufen_keine_vermischung'];
  const overview = computeOverview(attempts, {});
  assertEqual('Gesamtübersicht ohne Filter: 45 Versuche', overview.played, 45);
}

console.log('\n=== computeAllTrends liefert alle drei Fenstergrößen ===');
{
  const attempts = generateAttempts('sudoku', 3, 20, { seed: 99 });
  const all = computeAllTrends(attempts, 'sudoku', 3);
  assertTrue('enthält 10/50/100', 10 in all && 50 in all && 100 in all);
  assertEqual('10er berechenbar (genug Daten)', all[10].enoughData, true);
  assertEqual('50er nicht berechenbar (nur 20 Versuche)', all[50].enoughData, false);
}

console.log('\n=== Leerer Datensatz: alles null statt Absturz ===');
{
  const overview = computeOverview([], {});
  assertEqual('played 0 bei leerem Log', overview.played, 0);
  assertEqual('solveRatePercent null bei 0 Versuchen', overview.solveRatePercent, null);
  const trend = computeTrend([], 'sudoku', 1, 10);
  assertEqual('enoughData false bei leerem Log', trend.enoughData, false);
}

console.log('\n' + (failed === 0 ? 'Alle Tests bestanden.' : failed + ' Test(s) fehlgeschlagen.'));
process.exit(failed === 0 ? 0 : 1);
