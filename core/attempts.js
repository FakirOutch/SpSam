/**
 * Zentraler Spielverlaufs-/Attempt-Dienst (Backlog Punkt 17).
 *
 * Bewusst als reine, von der App/den Modulen unabhängige Engine gebaut —
 * wie core/i18n.js oder core/save-utils.js. Verwaltet EIN Log fertiger
 * Versuche (solved/abandoned/revealed) in localStorage, versioniert.
 *
 * Architekturentscheidung — WARUM kein "laufender Versuch"-Zustand hier:
 * Der Lebenszyklus eines noch offenen Versuchs (pending -> in_progress)
 * lebt bewusst NICHT hier, sondern additiv im jeweiligen Modul-eigenen
 * Save (attemptId/attemptCreatedAt/attemptFirstActionAt/attemptHintsUsed).
 * So gibt es nur EINE Quelle der Wahrheit für "läuft da noch was" (das
 * Spiel-Save selbst) — ein zweiter, parallel gepflegter Zustand hier hätte
 * genau das Risiko erzeugt, das die Vorgabe ausdrücklich ausschließt:
 * "Statistikzustand und Spielsave dürfen nicht auseinanderlaufen."
 * Ein Versuch, der nie eine reguläre Aktion erreicht (nur geöffnet, nie
 * angefasst), taucht hier NIE auf — das Modul ruft finishAttempt() dafür
 * bewusst gar nicht erst auf (siehe Aufrufer-Vertrag unten).
 *
 * Aufrufer-Vertrag (von jedem Spielmodul einzuhalten):
 * - beginAttempt(gameId) beim Erzeugen/Anzeigen eines neuen Rätsels
 *   aufrufen (start()), NICHT bei restore() eines bereits laufenden.
 * - Die zurückgelieferte {attemptId, createdAt} zusammen mit dem übrigen
 *   Spielzustand speichern (Save-Feld attemptId/attemptCreatedAt).
 * - Bei der ersten regulären Aktion (siehe Vorgabe: alles außer
 *   Fokus/Stil/Eingabe-Reglern) lokal attemptFirstActionAt EINMALIG
 *   setzen (kein Aufruf hier nötig, reine Zustandsangabe im Modul).
 * - finishAttempt() erst aufrufen, wenn attemptFirstActionAt gesetzt ist
 *   (sonst zählt der Versuch nicht — Vorgabe: kein Eintrag ohne reguläre
 *   Aktion). Status 'solved' bei korrekter Lösung, 'revealed' bei
 *   Lösung-anzeigen, 'abandoned' wenn ein anderes Rätsel das laufende
 *   ersetzt (Stufenwechsel, Neu mischen).
 */

const STORAGE_KEY = 'arkimis_attempts_v1';
const SCHEMA_VERSION = 1;

// Zentral konfigurierbare Grenze wertbarer Zeit (Backlog Punkt 17) — an
// GENAU dieser Stelle ändern, nicht in den einzelnen Modulen hart codieren.
export const MAX_TIMED_MS = 2 * 60 * 60 * 1000; // 2 Stunden

function readLog(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return { schemaVersion: SCHEMA_VERSION, entries: [] };
    const parsed = JSON.parse(raw);
    if(!parsed || !Array.isArray(parsed.entries)) return { schemaVersion: SCHEMA_VERSION, entries: [] };
    return parsed;
  }catch(e){
    return { schemaVersion: SCHEMA_VERSION, entries: [] };
  }
}

function writeLog(log){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  }catch(e){
    // z.B. Speicher voll/privater Modus — Statistik ist nicht
    // spielkritisch, ein fehlgeschlagener Log-Schreibvorgang darf das
    // Spiel selbst nicht stören.
  }
}

function makeAttemptId(gameId){
  return (gameId || 'game') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * Neuer Versuch: liefert eine eindeutige attemptId + den Erzeugungs-
 * zeitpunkt (Anzeige des Rätsels — die Zeitmessung beginnt HIER, nicht
 * erst bei der ersten Aktion, siehe Vorgabe). Schreibt noch NICHTS ins
 * Log — reine, seiteneffektfreie Erzeugung der Kennung/Zeitbasis.
 */
export function beginAttempt(gameId){
  return { attemptId: makeAttemptId(gameId), createdAt: Date.now() };
}

/**
 * Schließt einen Versuch ab. Niemals werfen — bei fehlenden Pflichtfeldern
 * oder einer bereits vorhandenen attemptId (Doppelaufruf, z.B. durch
 * mehrfaches Mounten) ist dies ein stiller No-op.
 *
 * record: {
 *   attemptId, gameId, profileId, difficulty, generatorRef, schemaRef,
 *   createdAt, firstActionAt, finishedAt (optional, default now),
 *   status: 'solved' | 'abandoned' | 'revealed',
 *   hintsUsed (optional, default 0),
 *   outcome (optional, zusätzliches Diagnosefeld — erweitert NICHT den
 *            Status-Enum, z.B. 'mine_hit' für einen Minesweeper-Verlust,
 *            der im vorgegebenen Modell keinen eigenen Status hat und
 *            bis auf Weiteres als 'abandoned' geführt wird),
 * }
 */
export function finishAttempt(record){
  if(!record || !record.attemptId || !record.gameId || !record.status) return;
  if(!record.firstActionAt) return; // keine reguläre Aktion -> zählt nicht, siehe Modul-Vertrag oben
  if(!['solved', 'abandoned', 'revealed'].includes(record.status)) return;

  const log = readLog();
  if(log.entries.some(e => e.attemptId === record.attemptId)) return; // nie doppelt abschliessen

  const createdAt = record.createdAt || record.firstActionAt;
  const finishedAt = record.finishedAt || Date.now();
  const rawDurationMs = Math.max(0, finishedAt - createdAt);
  const timingEligible = rawDurationMs <= MAX_TIMED_MS;
  const durationMs = Math.min(rawDurationMs, MAX_TIMED_MS);

  log.entries.push({
    attemptId: record.attemptId,
    gameId: record.gameId,
    profileId: record.profileId || null,
    difficulty: record.difficulty ?? null,
    generatorRef: record.generatorRef ?? null,
    schemaRef: record.schemaRef ?? null,
    createdAt,
    firstActionAt: record.firstActionAt,
    finishedAt,
    status: record.status,
    durationMs,
    rawDurationMs,
    timingEligible,
    hintsUsed: record.hintsUsed || 0,
    outcome: record.outcome || null,
  });
  writeLog(log);
}

/** Read-only Kopie aller abgeschlossenen Versuche — Grundlage für die spätere Statistikoberfläche (Punkt 18/19), hier noch ungenutzt. */
export function getAllAttempts(){
  return readLog().entries.slice();
}

/** Nur für Tests/Diagnose: löscht das komplette Verlaufs-Log. */
export function clearAllAttempts(){
  writeLog({ schemaVersion: SCHEMA_VERSION, entries: [] });
}
