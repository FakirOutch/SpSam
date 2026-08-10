/**
 * Statistik-Berechnungslogik (Backlog Punkt 19).
 *
 * Bewusst reine, zustandslose Funktionen: nehmen ein Array bereits
 * abgeschlossener Versuche entgegen (aus core/attempts.js'
 * getAllAttempts() ODER getAllTestAttempts() — welche Quelle das ist,
 * entscheidet der Aufrufer, siehe core/attempts.js) und liefern
 * berechnete Werte zurück, ohne selbst irgendetwas zu lesen oder zu
 * schreiben. Genau dadurch lassen sich echte und Testdaten nie
 * versehentlich vermischen: diese Datei kennt den Unterschied gar
 * nicht, sie rechnet nur mit dem, was ihr übergeben wird.
 *
 * Verbindliche Regeln (siehe Backlog):
 * - Lösungsrate/gespielt/gelöst: ALLE abgeschlossenen Versuche zählen,
 *   auch solche mit timingEligible:false. "revealed" zählt als
 *   gespielt, aber nicht als gelöst (wie "abandoned").
 * - Geschwindigkeitsvergleich: NUR status "solved" UND
 *   timingEligible:true zählen — eigener, kleinerer Datenpool.
 * - Zeitvergleiche (Geschwindigkeit UND Lösungsraten-Trend) gelten
 *   ausschließlich innerhalb von genau einem Spiel + einer Stufe.
 * - Ein N-Vergleich (10/50/100) braucht 2×N Versuche im jeweiligen
 *   Pool (Lösungsrate bzw. Geschwindigkeit haben getrennte Pools und
 *   können deshalb unabhängig "genug"/"nicht genug" Daten haben).
 */

const TREND_WINDOWS = Object.freeze([10, 50, 100]);
const WINDOW_MULTIPLIER = 2; // ein N-Vergleich braucht 2N Versuche im jeweiligen Pool

function round1(n){ return Math.round(n * 10) / 10; }

/** { played, solved } für die übergebene (bereits gefilterte) Versuchsliste. */
function playedSolved(list){
  return {
    played: list.length,
    solved: list.filter(a => a.status === 'solved').length,
  };
}

/** Gesamtübersicht über ALLE übergebenen Versuche (alle Spiele/Stufen). */
export function computeOverview(attempts){
  return playedSolved(attempts);
}

/** Übersicht für ein einzelnes Spiel (alle Stufen zusammengefasst). */
export function computeGameOverview(attempts, gameId){
  return playedSolved(attempts.filter(a => a.gameId === gameId));
}

/** Übersicht für ein Spiel + eine bestimmte Stufe. */
export function computeGameDifficultyOverview(attempts, gameId, difficulty){
  return playedSolved(attempts.filter(a => a.gameId === gameId && a.difficulty === difficulty));
}

/**
 * Distinct gameId/difficulty-Kombinationen, die in den Versuchen
 * tatsächlich vorkommen — Grundlage für die Filter-Auswahl der
 * Statistikoberfläche (Punkt 18), damit dort nur echte Optionen
 * auftauchen, keine erfundenen.
 */
export function getAvailableGames(attempts){
  return [...new Set(attempts.map(a => a.gameId))].sort();
}
export function getAvailableDifficulties(attempts, gameId){
  return [...new Set(attempts.filter(a => a.gameId === gameId).map(a => a.difficulty))]
    .sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
}

/**
 * Trend-Vergleich "letzte N vs. vorherige N" für EIN Spiel + EINE Stufe.
 * windowSize: 10, 50 oder 100 (siehe TREND_WINDOWS).
 * Liefert getrennte enoughData-Flags für Lösungsrate und Geschwindigkeit
 * — die beiden Pools sind unterschiedlich groß und können deshalb
 * unabhängig voneinander (nicht) ausreichend Daten haben.
 */
export function computeTrend(attempts, gameId, difficulty, windowSize){
  if(!TREND_WINDOWS.includes(windowSize)){
    throw new Error('computeTrend: windowSize muss 10, 50 oder 100 sein, war ' + windowSize);
  }
  const needed = windowSize * WINDOW_MULTIPLIER;

  const list = attempts
    .filter(a => a.gameId === gameId && a.difficulty === difficulty)
    .slice()
    .sort((a, b) => a.finishedAt - b.finishedAt);

  const result = { gameId, difficulty, windowSize };

  // ---------- Lösungsrate: alle abgeschlossenen Versuche ----------
  if(list.length >= needed){
    const preceding = list.slice(list.length - needed, list.length - windowSize);
    const latest = list.slice(list.length - windowSize);
    const rate = (arr) => arr.length ? (arr.filter(a => a.status === 'solved').length / arr.length) * 100 : 0;
    const precedingPct = rate(preceding), latestPct = rate(latest);
    result.solveRate = {
      enoughData: true,
      precedingPct: round1(precedingPct),
      latestPct: round1(latestPct),
      changePts: round1(latestPct - precedingPct),
    };
  } else {
    result.solveRate = { enoughData: false, have: list.length, needed };
  }

  // ---------- Geschwindigkeit: nur solved + timingEligible ----------
  const timed = list.filter(a => a.status === 'solved' && a.timingEligible);
  if(timed.length >= needed){
    const preceding = timed.slice(timed.length - needed, timed.length - windowSize);
    const latest = timed.slice(timed.length - windowSize);
    const avgMs = (arr) => arr.reduce((sum, a) => sum + a.durationMs, 0) / arr.length;
    const precedingAvgMs = avgMs(preceding), latestAvgMs = avgMs(latest);
    result.speed = {
      enoughData: true,
      precedingAvgMs: Math.round(precedingAvgMs),
      latestAvgMs: Math.round(latestAvgMs),
      improvementPct: precedingAvgMs > 0 ? round1((precedingAvgMs - latestAvgMs) / precedingAvgMs * 100) : 0,
    };
  } else {
    result.speed = { enoughData: false, have: timed.length, needed };
  }

  return result;
}

/** Alle drei Fenstergrößen (10/50/100) auf einmal für Spiel+Stufe. */
export function computeAllTrends(attempts, gameId, difficulty){
  return TREND_WINDOWS.map(w => computeTrend(attempts, gameId, difficulty, w));
}

export { TREND_WINDOWS };
