/**
 * Deterministische Testdaten für die Statistik (Backlog Punkt 20).
 *
 * Kein Zufall (kein Math.random()) — jede erzeugte Kennzahl ist exakt
 * vorhersagbar, damit scripts/test-stats-utils.mjs konkrete erwartete
 * Werte prüfen kann, statt nur "irgendeine Zahl kam heraus". Wird NIE
 * automatisch geladen — nur über core/attempts.js' loadTestAttempts()
 * in den separaten Test-Storage (arkimis_attempts_test_v1), niemals ins
 * echte Log. Siehe core/attempts.js für die Trennung der beiden Quellen.
 *
 * Absichtlich angelegte Szenarien (jeweils game+difficulty getrennt,
 * da Zeitvergleiche laut Vorgabe nur innerhalb von Spiel+Stufe gelten):
 *
 * - sudoku / Stufe 3 — 200 Versuche, exakt für den 100-vs-100-Vergleich:
 *   alle "solved" und timingEligible, ältere 100 mit 600 000ms (10min)
 *   Dauer, neuere 100 mit 480 000ms (8min) -> erwartete Geschwindigkeits-
 *   verbesserung 20,0%, Lösungsrate unverändert (100% -> 100%, ±0 Punkte).
 *
 * - hashi / Stufe 2 — 20 Versuche, exakt für den 10-vs-10-Vergleich:
 *   alle solved+timingEligible, älter 300 000ms, neuer 240 000ms
 *   -> erwartete Geschwindigkeitsverbesserung 20,0%, Lösungsrate ±0.
 *
 * - futoshiki / Stufe 5 — 20 Versuche, gemischter Status UND gemischte
 *   Zeitwertbarkeit (prüft beide Ausschlussregeln gleichzeitig):
 *   älter 10 = 8 solved (timingEligible, je 200 000ms) + 2 revealed
 *     -> Lösungsrate älter = 80%
 *   neuer 10 = 6 solved (davon 5 timingEligible je 150 000ms, 1 NICHT
 *     eligible/über 2h) + 4 revealed -> Lösungsrate neuer = 60%
 *   Erwartung: Lösungsratenänderung -20 Punkte; Geschwindigkeit nur aus
 *   den timingEligible-solved-Werten (8 vs. 5 Stichproben; der eine
 *   nicht-wertbare Versuch darf den Schnitt NICHT verändern):
 *   200 000 -> 150 000 = 25,0% schneller.
 *
 * - kakuro / Stufe 1 — nur 15 Versuche: bewusst NICHT genug für den
 *   10-vs-10-Vergleich (braucht 20) -> "Noch nicht genügend Daten".
 *
 * - minesweeper / beginner — nur 3 Versuche: Randfall mit sehr wenigen
 *   Daten, aber gültig für die reine Übersicht (gespielt/gelöst).
 *
 * Zusätzlich pro Szenario ein paar Versuche in JEWEILS ANDEREN
 * Stufen desselben Spiels, damit die Stufenfilterung der Oberfläche
 * (Punkt 18) etwas zum Filtern hat und sich nicht mit den obigen
 * Zahlen vermischt (Zeitvergleiche gelten ausdrücklich nur innerhalb
 * derselben Stufe).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function makeAttempt({ gameId, difficulty, status, durationMs, timingEligible, sequenceIndex, outcome }){
  // sequenceIndex bestimmt die chronologische Reihenfolge (kleiner = älter).
  // Abstand bewusst 1 Tag pro Index — deutlich größer als jede mögliche
  // Rätseldauer (auch die künstlich über 2h liegenden "nicht wertbaren"
  // Fälle) —, damit die Sortierung nach finishedAt IMMER der Reihenfolge
  // der sequenceIndex entspricht. Bei knapperem Abstand könnte ein
  // kürzerer "neuerer" Versuch vor einem länger dauernden "älteren"
  // Versuch fertig werden und die Reihenfolge verfälschen.
  const baseCreatedAt = Date.UTC(2026, 0, 1, 0, 0, 0) + sequenceIndex * DAY_MS;
  const createdAt = baseCreatedAt;
  const firstActionAt = createdAt + 2000;
  const rawDurationMs = timingEligible ? durationMs : Math.max(durationMs, 3 * HOUR_MS); // ueber der 2h-Grenze, falls nicht wertbar
  const finishedAt = firstActionAt + rawDurationMs;
  return {
    attemptId: `fixture_${gameId}_${difficulty}_${sequenceIndex}`,
    gameId, profileId: null, difficulty,
    generatorRef: 1, schemaRef: 1,
    createdAt, firstActionAt, finishedAt,
    status,
    durationMs: Math.min(rawDurationMs, 2 * HOUR_MS),
    rawDurationMs,
    timingEligible: !!timingEligible,
    hintsUsed: 0,
    outcome: outcome || null,
  };
}

function block({ gameId, difficulty, count, status, durationMs, timingEligible, startIndex }){
  const out = [];
  for(let i = 0; i < count; i++){
    out.push(makeAttempt({ gameId, difficulty, status, durationMs, timingEligible, sequenceIndex: startIndex + i }));
  }
  return out;
}

export function generateFixtureAttempts(){
  let idx = 0;
  const entries = [];

  // ---------- sudoku / Stufe 3: 100-vs-100 ----------
  entries.push(...block({ gameId:'sudoku', difficulty:3, count:100, status:'solved', durationMs:600000, timingEligible:true, startIndex: idx })); idx += 100;
  entries.push(...block({ gameId:'sudoku', difficulty:3, count:100, status:'solved', durationMs:480000, timingEligible:true, startIndex: idx })); idx += 100;
  // ein paar Versuche in einer ANDEREN Sudoku-Stufe, rein zum Filtern
  entries.push(...block({ gameId:'sudoku', difficulty:1, count:6, status:'solved', durationMs:120000, timingEligible:true, startIndex: idx })); idx += 6;

  // ---------- hashi / Stufe 2: 10-vs-10 ----------
  entries.push(...block({ gameId:'hashi', difficulty:2, count:10, status:'solved', durationMs:300000, timingEligible:true, startIndex: idx })); idx += 10;
  entries.push(...block({ gameId:'hashi', difficulty:2, count:10, status:'solved', durationMs:240000, timingEligible:true, startIndex: idx })); idx += 10;

  // ---------- futoshiki / Stufe 5: gemischter Status + gemischte Zeitwertbarkeit ----------
  entries.push(...block({ gameId:'futoshiki', difficulty:5, count:8, status:'solved', durationMs:200000, timingEligible:true, startIndex: idx })); idx += 8;
  entries.push(...block({ gameId:'futoshiki', difficulty:5, count:2, status:'revealed', durationMs:200000, timingEligible:true, startIndex: idx })); idx += 2;
  entries.push(...block({ gameId:'futoshiki', difficulty:5, count:5, status:'solved', durationMs:150000, timingEligible:true, startIndex: idx })); idx += 5;
  entries.push(...block({ gameId:'futoshiki', difficulty:5, count:1, status:'solved', durationMs:150000, timingEligible:false, startIndex: idx })); idx += 1; // NICHT wertbar - darf Schnitt nicht veraendern
  entries.push(...block({ gameId:'futoshiki', difficulty:5, count:4, status:'revealed', durationMs:150000, timingEligible:true, startIndex: idx })); idx += 4;

  // ---------- kakuro / Stufe 1: bewusst zu wenig (15 < 20) ----------
  entries.push(...block({ gameId:'kakuro', difficulty:1, count:10, status:'solved', durationMs:400000, timingEligible:true, startIndex: idx })); idx += 10;
  entries.push(...block({ gameId:'kakuro', difficulty:1, count:5, status:'abandoned', durationMs:60000, timingEligible:true, startIndex: idx })); idx += 5;

  // ---------- minesweeper / beginner: sehr wenige Daten (reiner Uebersichts-Randfall) ----------
  entries.push(makeAttempt({ gameId:'minesweeper', difficulty:'beginner', status:'solved', durationMs:90000, timingEligible:true, sequenceIndex: idx })); idx += 1;
  entries.push(makeAttempt({ gameId:'minesweeper', difficulty:'beginner', status:'abandoned', durationMs:20000, timingEligible:true, sequenceIndex: idx, outcome:'mine_hit' })); idx += 1;
  entries.push(makeAttempt({ gameId:'minesweeper', difficulty:'beginner', status:'solved', durationMs:75000, timingEligible:true, sequenceIndex: idx })); idx += 1;

  return entries;
}
