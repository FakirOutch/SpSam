// Prüft jedes in der Registry eingetragene Spielmodul gegen die verbindliche
// Modul-API v1 (siehe core/game-module-contract.js) — ohne Browser, rein
// über die statische Form des default-Exports. Läuft mit reinem Node:
//
//   node scripts/check-modules.mjs
//
// Absichtlich KEIN echter mount()/start()-Aufruf hier: das würde einen DOM
// voraussetzen. Diese Prüfung deckt genau das ab, was am ehesten vergessen
// wird, wenn ein neues Modul entsteht — fehlende Pflichtfunktionen, falsch
// kopierte Versionsnummern, abweichende IDs.
import { getGameRegistration, GAME_MODULES } from '../core/game-registry.js';
import { checkModuleConformance, CURRENT_API_VERSION } from '../core/game-module-contract.js';

let allOk = true;

console.log('Modul-API-Konformitätstest (Vertrag Version ' + CURRENT_API_VERSION + ')\n');

for(const gameId of Object.keys(GAME_MODULES)){
  const registration = getGameRegistration(gameId);
  const imported = await registration.load();
  const result = checkModuleConformance(imported.default, registration);
  if(result.ok){
    console.log('✓ ' + gameId + ': konform');
  } else {
    allOk = false;
    console.log('✗ ' + gameId + ': NICHT konform');
    result.errors.forEach(message => console.log('    - ' + message));
  }
}

console.log('');
if(allOk){
  console.log('Alle ' + Object.keys(GAME_MODULES).length + ' registrierten Module erfüllen die Modul-API v1.');
  process.exit(0);
} else {
  console.log('Mindestens ein Modul erfüllt die Modul-API v1 nicht — siehe oben.');
  process.exit(1);
}
