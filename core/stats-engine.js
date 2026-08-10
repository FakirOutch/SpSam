/**
 * Statistik-/Trend-Berechnung (Backlog Punkt 19).
 *
 * Reine Funktionen — nehmen ein Array von Versuchs-Datensätzen (Form
 * wie core/attempts.js sie im Log führt, siehe finishAttempt()) und
 * einen Filter entgegen, liefern berechnete Werte zurück. Kein eigener
 * Zustand, kein localStorage-Zugriff — dadurch mit denselben Funktionen
 * sowohl auf dem echten Log (core/attempts.getAllAttempts()) als auch
 * auf synthetischen Testdaten (scripts/attempts-fixtures.mjs) nutzbar,
 * ohne dass beide je vermischt werden müssten.
 *
 * Verbindliche Regeln (Backlog Punkt 19):
 * - Zeitvergleiche NUR innerhalb desselben Spiels UND derselben Stufe.
 * - Versuche mit timingEligible:false fließen NICHT in Zeitdurchschnitt
 *   oder Geschwindigkeitsvergleich ein, zählen aber normal bei
 *   gespielt/gelöst/nicht gelöst.
 * - "Lösung angezeigt" (status 'revealed') zählt als gespielt, aber
 *   nicht als selbst gelöst.
 * - Bei zu wenigen Daten wird das durch enoughData:false ausgedrückt
 *   (Anzeige "Noch nicht genügend Daten" ist Sache der UI, Punkt 18).
 */

const WINDOW_SIZES = [10, 50, 100];

function matches(attempt, gameId, difficulty){
  if(gameId !== undefined && attempt.gameId !== gameId) return false;
  if(difficulty !== undefined && difficulty !== null && attempt.difficulty !== difficulty) return false;
  return true;
}

/** Gesamt gespielt/gelöst — optional nach Spiel gefiltert, ohne Stufenbindung. */
export function computeOverview(attempts, { gameId } = {}){
  const filtered = attempts.filter(a => matches(a, gameId, undefined));
  const played = filtered.length;
  const solved = filtered.filter(a => a.status === 'solved').length;
  return {
    played, solved,
    solveRatePercent: played > 0 ? round1(solved / played * 100) : null,
  };
}

/** Gespielt/gelöst/Lösungsrate für exakt EIN Spiel + EINE Stufe. */
export function computeDifficultyStats(attempts, gameId, difficulty){
  const filtered = attempts.filter(a => matches(a, gameId, difficulty));
  const played = filtered.length;
  const solved = filtered.filter(a => a.status === 'solved').length;
  const revealed = filtered.filter(a => a.status === 'revealed').length;
  const abandoned = filtered.filter(a => a.status === 'abandoned').length;
  const eligibleSolved = filtered.filter(a => a.status === 'solved' && a.timingEligible);
  const avgDurationMs = eligibleSolved.length > 0
    ? Math.round(eligibleSolved.reduce((sum, a) => sum + a.durationMs, 0) / eligibleSolved.length)
    : null;
  return {
    played, solved, revealed, abandoned,
    solveRatePercent: played > 0 ? round1(solved / played * 100) : null,
    avgDurationMs,
    avgDurationSampleSize: eligibleSolved.length,
  };
}

/**
 * Trendvergleich "letzte N vs. davor N" für ein Spiel+eine Stufe
 * (windowSize aus WINDOW_SIZES: 10, 50 oder 100). Braucht 2×windowSize
 * passende Versuche, sonst enoughData:false.
 */
export function computeTrend(attempts, gameId, difficulty, windowSize){
  if(!WINDOW_SIZES.includes(windowSize)){
    throw new Error('Ungültige Fenstergröße für computeTrend(): ' + windowSize + ' (erlaubt: ' + WINDOW_SIZES.join(', ') + ')');
  }
  const filtered = attempts
    .filter(a => matches(a, gameId, difficulty))
    .slice()
    .sort((a, b) => b.finishedAt - a.finishedAt); // neueste zuerst

  const needed = windowSize * 2;
  if(filtered.length < needed){
    return { enoughData: false, windowSize, available: filtered.length, needed };
  }

  const recent = filtered.slice(0, windowSize);
  const previous = filtered.slice(windowSize, windowSize * 2);

  const recentRate = solveRateOf(recent);
  const previousRate = solveRateOf(previous);
  const solveRateChangePoints = (recentRate === null || previousRate === null)
    ? null
    : round1(recentRate - previousRate);

  const recentAvg = avgEligibleSolvedDuration(recent);
  const previousAvg = avgEligibleSolvedDuration(previous);
  // Geschwindigkeitsvergleich nur möglich, wenn BEIDE Fenster mindestens
  // einen wertbaren gelösten Versuch enthalten — sonst kein Prozentwert
  // vortäuschen, sondern explizit als nicht berechenbar kennzeichnen.
  const speedImprovementPercent = (recentAvg === null || previousAvg === null || previousAvg === 0)
    ? null
    : round1((previousAvg - recentAvg) / previousAvg * 100); // positiv = schneller geworden

  return {
    enoughData: true, windowSize,
    recentSolveRatePercent: recentRate, previousSolveRatePercent: previousRate,
    solveRateChangePoints,
    recentAvgDurationMs: recentAvg, previousAvgDurationMs: previousAvg,
    speedImprovementPercent,
    speedComparable: recentAvg !== null && previousAvg !== null,
  };
}

/** Liefert alle drei Trendfenster (10/50/100) für ein Spiel+eine Stufe auf einmal. */
export function computeAllTrends(attempts, gameId, difficulty){
  const result = {};
  for(const size of WINDOW_SIZES) result[size] = computeTrend(attempts, gameId, difficulty, size);
  return result;
}

function solveRateOf(list){
  if(!list.length) return null;
  const solved = list.filter(a => a.status === 'solved').length;
  return round1(solved / list.length * 100);
}
function avgEligibleSolvedDuration(list){
  const eligible = list.filter(a => a.status === 'solved' && a.timingEligible);
  if(!eligible.length) return null;
  return Math.round(eligible.reduce((sum, a) => sum + a.durationMs, 0) / eligible.length);
}
function round1(n){ return Math.round(n * 10) / 10; }
