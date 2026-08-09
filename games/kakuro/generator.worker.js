// Führt die Kakuro-Generierung (inkl. Solver-basierter Eindeutigkeitsprüfung)
// außerhalb des UI-Threads aus. Bewusst denkbar schlank gehalten:
//
//   - Erzeugt das Rätsel (ruft generator.js -> solver.js auf).
//   - Sendet AUSSCHLIESSLICH das fertige Ergebnis zurück.
//   - Greift NIE auf localStorage, DOM oder sonstigen Anwendungszustand zu —
//     das bleibt allein Aufgabe des Spielmoduls im Hauptthread. Dadurch ist
//     ein abgebrochener Worker (worker.terminate()) immer unbedenklich: es
//     gibt nie einen unfertigen Schreibvorgang, der hätte hängen bleiben
//     können.
import { generateKakuroPuzzle } from './generator.js';

self.onmessage = (event) => {
  const data = event.data || {};
  if(data.command !== 'generate') return;
  const { requestId, size, blackRatio, stepBudget, timeBudgetMs } = data;
  try{
    const puzzle = generateKakuroPuzzle(size, blackRatio, stepBudget, timeBudgetMs);
    self.postMessage({ type:'generated', requestId, puzzle });
  }catch(error){
    self.postMessage({ type:'error', requestId, message:String(error && error.message || error) });
  }
};
