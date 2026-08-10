/**
 * Deterministische Test-Fixtures für die Statistik-/Trend-Berechnung
 * (Backlog Punkt 20).
 *
 * WICHTIG — Trennung von echten Spielerdaten (verbindliche Vorgabe):
 * Diese Datei erzeugt ausschließlich reine JS-Arrays im Speicher. Sie
 * schreibt NIEMALS in den echten Verlaufs-Log (core/attempts.js nutzt
 * den localStorage-Key "arkimis_attempts_v1" — diese Datei fasst diesen
 * Key an keiner Stelle an). Testskripte übergeben die erzeugten Arrays
 * direkt an core/stats-engine.js, ohne den Umweg über localStorage. Ein
 * manuelles "Testdaten laden" in der echten App ist dadurch strukturell
 * unmöglich, nicht nur per Konvention vermieden.
 *
 * Jede Erzeugungsfunktion ist deterministisch (kein Math.random() ohne
 * festen Seed) — bei gleichen Parametern immer dieselbe Ausgabe, damit
 * Tests reproduzierbar bleiben.
 */

// Einfacher, deterministischer Pseudo-Zufallsgenerator (mulberry32) —
// KEIN Math.random(), damit Fixtures bei jedem Testlauf identisch sind.
function makeRng(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let counter = 0;
function nextId(gameId){
  counter += 1;
  return 'fixture_' + gameId + '_' + counter;
}

/**
 * Erzeugt `count` abgeschlossene Versuche für ein Spiel/eine Stufe, mit
 * kontrollierbarem Anteil an solved/abandoned/revealed und
 * timingEligible. Zeitstempel liegen aufsteigend in der Vergangenheit
 * (ältester zuerst), enden bei `endTime` (Default: jetzt) — genau wie
 * ein echter Verlauf, bei dem die letzten Versuche die neuesten sind.
 *
 * options:
 *   solveRate: Anteil 'solved' an allen Versuchen (Rest verteilt sich
 *     auf 'abandoned'/'revealed')
 *   revealedShare: Anteil der NICHT gelösten Versuche, die 'revealed'
 *     statt 'abandoned' sind
 *   baseDurationMs / durationTrendMs: mittlere Lösungsdauer der
 *     ÄLTESTEN Versuche bzw. wie stark sie sich pro Versuch Richtung
 *     `endTime` verändert (negativ = wird schneller/besser)
 *   overTimeShare: Anteil der Versuche, die künstlich über die 2h-
 *     Grenze gesetzt werden (timingEligible:false)
 *   seed: Determinismus-Seed
 */
export function generateAttempts(gameId, difficulty, count, options = {}){
  const {
    solveRate = 0.7,
    revealedShare = 0.3,
    baseDurationMs = 5 * 60 * 1000,
    durationTrendMs = 0,
    overTimeShare = 0,
    seed = 1,
    endTime = Date.now(),
    stepMs = 60 * 60 * 1000, // ein Versuch pro Stunde in der Vergangenheit, rein fürs Zeitraster
  } = options;

  const rng = makeRng(seed);
  const out = [];
  for(let i = 0; i < count; i++){
    const isSolved = rng() < solveRate;
    const isRevealed = !isSolved && rng() < revealedShare;
    const status = isSolved ? 'solved' : (isRevealed ? 'revealed' : 'abandoned');
    const isOverTime = rng() < overTimeShare;

    const finishedAt = endTime - (count - 1 - i) * stepMs;
    const plannedDurationMs = Math.max(1000, Math.round(baseDurationMs + i * durationTrendMs));
    const durationMs = isOverTime ? (2 * 60 * 60 * 1000 + 5 * 60 * 1000) : plannedDurationMs; // absichtlich > 2h
    const createdAt = finishedAt - durationMs;

    out.push({
      attemptId: nextId(gameId),
      gameId, profileId: null, difficulty,
      generatorRef: 1, schemaRef: 1,
      createdAt, firstActionAt: createdAt + Math.min(2000, durationMs), finishedAt,
      status,
      durationMs: Math.min(durationMs, 2 * 60 * 60 * 1000),
      rawDurationMs: durationMs,
      timingEligible: durationMs <= 2 * 60 * 60 * 1000,
      hintsUsed: 0,
      outcome: null,
    });
  }
  return out;
}

/**
 * Definierte Grenzfälle (Backlog Punkt 20: "definierte Grenzfälle") —
 * jede Funktion liefert ein eigenständiges, benanntes Szenario für
 * core/stats-engine.js. Rückgabe jeweils { label, attempts }.
 */
export function edgeCases(){
  const cases = [];

  cases.push({
    label: 'genau_19_von_20_zu_wenig_fuer_10er_trend',
    attempts: generateAttempts('sudoku', 3, 19, { seed: 10 }),
  });
  cases.push({
    label: 'genau_20_reicht_fuer_10er_trend',
    attempts: generateAttempts('sudoku', 3, 20, { seed: 11 }),
  });
  cases.push({
    label: 'genau_99_von_100_zu_wenig_fuer_50er_trend',
    attempts: generateAttempts('kakuro', 2, 99, { seed: 12 }),
  });
  cases.push({
    label: 'genau_100_reicht_fuer_50er_trend',
    attempts: generateAttempts('kakuro', 2, 100, { seed: 13 }),
  });
  cases.push({
    label: 'genau_200_reicht_fuer_100er_trend',
    attempts: generateAttempts('hashi', 4, 200, { seed: 14 }),
  });
  cases.push({
    label: 'alle_ueber_2h_keine_wertbare_zeit_aber_gespielt_gezaehlt',
    attempts: generateAttempts('futoshiki', 5, 20, { seed: 15, overTimeShare: 1, solveRate: 1 }),
  });
  cases.push({
    label: 'niemand_gelöst_nur_abgebrochen_und_revealed',
    attempts: generateAttempts('thermo-sudoku', 1, 20, { seed: 16, solveRate: 0, revealedShare: 0.5 }),
  });
  cases.push({
    label: 'deutliche_geschwindigkeitsverbesserung',
    attempts: generateAttempts('killer-sudoku', 3, 20, {
      seed: 17, solveRate: 1, baseDurationMs: 10 * 60 * 1000, durationTrendMs: -20 * 1000,
    }),
  });
  cases.push({
    label: 'verschiedene_spiele_stufen_keine_vermischung',
    attempts: [
      ...generateAttempts('sudoku', 1, 15, { seed: 18 }),
      ...generateAttempts('sudoku', 2, 15, { seed: 19 }),
      ...generateAttempts('hashi', 1, 15, { seed: 20 }),
    ],
  });

  return cases;
}
