// Unit-Test für core/save-utils.js. Läuft mit reinem Node (kein Browser
// nötig), verwendet einen minimalen In-Memory-localStorage-Ersatz.
//
//   node scripts/test-save-utils.mjs

globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _reset: () => { store = {}; },
    _raw: () => store,
  };
})();

const { readSave, clearSave } = await import('../core/save-utils.js');

let failed = 0;
function assertEqual(label, actual, expected){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ console.log('✓ ' + label); }
  else { failed++; console.log('✗ ' + label); console.log('    erwartet: ' + e); console.log('    erhalten: ' + a); }
}
function assertTrue(label, cond){ assertEqual(label, !!cond, true); }

const KEY = 'test_save_key';

console.log('=== Grundfälle ohne Migration ===');
localStorage._reset();
assertEqual('fehlender Schlüssel -> null', readSave(KEY, { validate: () => true }), null);

localStorage.setItem(KEY, JSON.stringify({ a: 1 }));
assertEqual('gültiger Wert -> wird durchgereicht', readSave(KEY, { validate: (v) => v && v.a === 1 }), { a: 1 });

localStorage.setItem(KEY, JSON.stringify({ a: 2 }));
assertEqual('ungültiger Wert (validate=false) -> null', readSave(KEY, { validate: (v) => v.a === 1 }), null);

localStorage.setItem(KEY, '{kaputtes json,,,');
assertEqual('kaputtes JSON -> null, kein Absturz', readSave(KEY, { validate: () => true }), null);

console.log('');
console.log('=== ohne validate-Funktion: klarer Fehler statt stillem Fehlverhalten ===');
let threwNoValidate = false;
try{ readSave(KEY, {}); }catch(_e){ threwNoValidate = true; }
assertTrue('readSave() ohne validate wirft', threwNoValidate);

console.log('');
console.log('=== Vertragsbruch von migrate(): muss { value, migrated } liefern ===');
function expectThrow(label, fn){
  let threw = false;
  try{ fn(); }catch(_e){ threw = true; }
  assertTrue(label, threw);
}
localStorage._reset();
localStorage.setItem(KEY, JSON.stringify({ a: 1 }));
expectThrow('migrate gibt den Wert direkt zurück (alter Vertrag) -> wirft',
  () => readSave(KEY, { migrate: (raw) => raw, validate: () => true }));
expectThrow('migrate gibt { value } ohne migrated-Flag zurück -> wirft',
  () => readSave(KEY, { migrate: (raw) => ({ value: raw }), validate: () => true }));
expectThrow('migrate gibt migrated als Nicht-Boolean zurück -> wirft',
  () => readSave(KEY, { migrate: (raw) => ({ value: raw, migrated: 'ja' }), validate: () => true }));
expectThrow('migrate gibt null zurück -> wirft',
  () => readSave(KEY, { migrate: () => null, validate: () => true }));

console.log('');
console.log('=== Migration: explizites migrated:true wird zurückgeschrieben (unabhängig von Objekt-Referenz) ===');
localStorage._reset();
localStorage.setItem(KEY, JSON.stringify({ version: 1, value: 'alt' }));
const migrateV1 = (raw) => {
  if(!raw || raw.version !== 1) return { value: raw, migrated: false };
  return { value: { version: 2, value: raw.value }, migrated: true };
};
const result1 = readSave(KEY, { migrate: migrateV1, validate: (v) => v && v.version === 2 });
assertEqual('Migration liefert migriertes Ergebnis', result1, { version: 2, value: 'alt' });
const storedAfterMigration = JSON.parse(localStorage.getItem(KEY));
assertEqual('Migriertes Ergebnis wurde zurückgeschrieben', storedAfterMigration, { version: 2, value: 'alt' });

console.log('');
console.log('=== Migration: ungültiges Migrationsergebnis wird NICHT zurückgeschrieben ===');
localStorage._reset();
localStorage.setItem(KEY, JSON.stringify({ version: 1, value: 'kaputt' }));
const migrateButStillInvalid = (raw) => {
  if(!raw || raw.version !== 1) return { value: raw, migrated: false };
  return { value: { version: 2, value: raw.value }, migrated: true };
};
const result2 = readSave(KEY, { migrate: migrateButStillInvalid, validate: (v) => v && v.value === 'nur-dieser-wert-ist-gueltig' });
assertEqual('Ungültiges Migrationsergebnis -> null', result2, null);
const storedAfterFailedMigration = JSON.parse(localStorage.getItem(KEY));
assertEqual('Ursprünglicher (unmigrierter) Eintrag bleibt unverändert liegen', storedAfterFailedMigration, { version: 1, value: 'kaputt' });

console.log('');
console.log('=== Migration: migrated:false wird nicht zurückgeschrieben, auch wenn migrate() ein NEUES Objekt liefert ===');
console.log('    (beweist: die Erkennung haengt jetzt am expliziten Flag, nicht mehr an Objekt-Referenzgleichheit)');
localStorage._reset();
localStorage.setItem(KEY, JSON.stringify({ version: 2, value: 'schon-aktuell' }));
let writeCount = 0;
const originalSetItem = localStorage.setItem;
localStorage.setItem = (...args) => { writeCount++; originalSetItem(...args); };
const migrateAlwaysNewObject = (raw) => ({ value: { ...raw }, migrated: false });
readSave(KEY, { migrate: migrateAlwaysNewObject, validate: (v) => v && v.version === 2 });
assertEqual('Kein Schreibzugriff trotz neuer Objekt-Referenz (migrated:false gewinnt)', writeCount, 0);
localStorage.setItem = originalSetItem;

console.log('');
console.log('=== Migration: migrated:true wird zurückgeschrieben, SELBST wenn dieselbe Referenz zurückkommt ===');
localStorage._reset();
localStorage.setItem(KEY, JSON.stringify({ version: 1, value: 'x' }));
const migrateSameReferenceButFlagged = (raw) => ({ value: raw, migrated: true });
const result3 = readSave(KEY, { migrate: migrateSameReferenceButFlagged, validate: () => true });
const storedAfterSameRefMigration = JSON.parse(localStorage.getItem(KEY));
assertEqual('Wird trotz gleicher Referenz zurückgeschrieben (Flag zaehlt, nicht Referenz)', storedAfterSameRefMigration, { version: 1, value: 'x' });

console.log('');
console.log('=== clearSave ===');
localStorage._reset();
localStorage.setItem(KEY, JSON.stringify({ a: 1 }));
clearSave(KEY);
assertEqual('Eintrag nach clearSave entfernt', localStorage.getItem(KEY), null);
clearSave('nicht-vorhandener-schluessel');

console.log('');
if(failed === 0){
  console.log('Alle Tests bestanden.');
  process.exit(0);
} else {
  console.log(failed + ' Test(s) fehlgeschlagen.');
  process.exit(1);
}
