/**
 * Verbindliche Modul-API v1 für Arkimis-Spiele.
 *
 * Jedes Spielmodul (default export von games/<id>/game.js) MUSS exakt
 * diese Form besitzen:
 *
 *   {
 *     id: string,                 // eindeutige Spiel-ID, identisch zum Registry-Eintrag
 *     apiVersion: number,         // Version DIESER gemeinsamen Schnittstelle (aktuell 1) —
 *                                 // beschreibt NICHT das Spiel, sondern den Vertrag selbst.
 *     moduleVersion: number,      // Version des Spielmoduls (fachliche Änderungen am Spiel)
 *     saveVersion: number,        // Version des Speicherstand-Formats dieses Spiels
 *     generatorVersion: number,   // Version der Generator-/Regellogik dieses Spiels
 *
 *     async mount(container, context): void,
 *       // Erzeugt das komplette DOM des Spiels innerhalb von `container`
 *       // (typischerweise #game-container) und bindet alle Event-Listener.
 *       // `context` siehe MODULE_CONTEXT_SHAPE weiter unten.
 *
 *     renderLevelsList(container, actions): void,
 *       // Füllt `container` (typischerweise #levels-list) mit der Stufen-
 *       // auswahl ODER — falls ein gültiger Speicherstand existiert — mit
 *       // "Fortsetzen"/"Neues Spiel". `actions` = { start(level), continue(savedState) }.
 *
 *     async start(level): void,
 *       // Erzeugt ein neues Rätsel der übergebenen Stufe. Setzt voraus,
 *       // dass mount() bereits aufgerufen wurde.
 *
 *     async restore(savedState?): boolean,
 *       // Versucht, einen (validierten) Speicherstand wiederherzustellen.
 *       // Liefert true bei Erfolg, false wenn kein gültiger Stand vorliegt
 *       // (dann NICHT werfen, sondern false zurückgeben — der Aufrufer
 *       // entscheidet dann selbst, z.B. zurück zur Levelauswahl).
 *
 *     validateSave(save): boolean,
 *       // Rein strukturelle Prüfung eines potenziellen Speicherstands
 *       // (Typen, Wertebereiche, Pflichtfelder) — OHNE Spielregeln zu
 *       // prüfen. Muss auch mit null/undefined/kaputten Objekten sicher
 *       // umgehen (nie werfen).
 *
 *     async unmount(): void,
 *       // Entfernt DOM, Event-Listener, Timer und ggf. dynamisch
 *       // geladenes CSS vollständig. Muss auch mitten in einer laufenden
 *       // Geste (z.B. Drag) sicher aufräumen.
 *
 *     getCurrentLevel(): object|null,
 *       // Liefert die aktuell gespielte Stufe (oder null, wenn keine
 *       // läuft) — wird u.a. für "Weiter spielen" nach einem Sieg genutzt.
 *   }
 *
 * MODULE_CONTEXT_SHAPE — was der App-Kern jedem Modul beim mount() übergibt:
 *
 *   {
 *     starsFor(levelId): string,
 *     preferences: { get(key, fallback): any, set(key, value): void },
 *     stats: { bump(gameId, key): void },
 *     hints: { remaining(gameId): number, consume(gameId): boolean },
 *     attempts: { begin(): {attemptId, createdAt}, finish(record): void },
 *       // Backlog Punkt 17 — zentraler Spielverlaufs-/Attempt-Dienst
 *       // (core/attempts.js), siehe dort für den vollständigen
 *       // Aufrufer-Vertrag. Ergänzt stats.bump(), ersetzt es nicht.
 *     showSuccess(text): void,
 *     loading: { show(text): void, hide(): void },
 *       // Gemeinsame, spielunabhängige Ladeanzeige — bewusst OHNE
 *       // Fortschrittsangabe (bei Backtracking-Generatoren lässt sich die
 *       // Restdauer nicht zuverlässig vorhersagen, siehe games/kakuro).
 *       // Optional zu nutzen: schnelle, synchrone Module (z.B. Sudoku,
 *       // Hashi) brauchen sie nicht.
 *     goToLevels(): Promise<void>,
 *   }
 */

export const CURRENT_API_VERSION = 1;

export const REQUIRED_FIELDS = Object.freeze([
  'id', 'apiVersion', 'moduleVersion', 'saveVersion', 'generatorVersion',
]);

export const REQUIRED_FUNCTIONS = Object.freeze([
  'mount', 'renderLevelsList', 'start', 'restore', 'validateSave', 'unmount', 'getCurrentLevel',
]);

export const CONTEXT_SHAPE = Object.freeze({
  top: ['starsFor', 'preferences', 'stats', 'hints', 'attempts', 'showSuccess', 'loading', 'goToLevels'],
  preferences: ['get', 'set'],
  stats: ['bump'],
  hints: ['remaining', 'consume'],
  attempts: ['begin', 'finish'],
  loading: ['show', 'hide'],
});

/**
 * Prüft ein geladenes Modul (dessen default-Export) gegen den Vertrag und
 * gegen seinen eigenen Registry-Eintrag. Wirft NIE — liefert stattdessen
 * { ok, errors } mit einer vollständigen Liste ALLER gefundenen Probleme
 * (nicht nur des ersten), damit ein unvollständiges Modul in einem
 * einzigen, verständlichen Fehlertext gemeldet werden kann.
 */
export function checkModuleConformance(moduleDefault, registration){
  const errors = [];
  if(!moduleDefault || typeof moduleDefault !== 'object'){
    return { ok:false, errors:['Modul liefert keinen gültigen default-Export (Objekt erwartet).'] };
  }

  REQUIRED_FIELDS.forEach(field => {
    if(moduleDefault[field] === undefined) errors.push('Pflichtfeld fehlt: ' + field);
  });
  REQUIRED_FUNCTIONS.forEach(fnName => {
    if(typeof moduleDefault[fnName] !== 'function') errors.push('Pflichtfunktion fehlt oder ist keine Funktion: ' + fnName + '()');
  });

  if(registration){
    if(moduleDefault.id !== registration.id){
      errors.push('Modul-ID ("' + moduleDefault.id + '") stimmt nicht mit der Registry-ID ("' + registration.id + '") überein.');
    }
    if(registration.apiVersion !== CURRENT_API_VERSION){
      errors.push('Registry verweist auf apiVersion ' + registration.apiVersion + ', unterstützt wird aktuell nur ' + CURRENT_API_VERSION + '.');
    }
    if(moduleDefault.apiVersion !== registration.apiVersion){
      errors.push('apiVersion des Moduls (' + moduleDefault.apiVersion + ') stimmt nicht mit der Registry (' + registration.apiVersion + ') überein.');
    }
    if(moduleDefault.moduleVersion !== registration.moduleVersion){
      errors.push('moduleVersion des Moduls (' + moduleDefault.moduleVersion + ') stimmt nicht mit der Registry (' + registration.moduleVersion + ') überein.');
    }
  }

  return { ok: errors.length === 0, errors };
}
