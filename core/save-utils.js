// Gemeinsame Speicherhilfen für alle Module. Migration und spielspezifische
// Validierung bleiben bewusst Aufgabe des jeweiligen Moduls — diese Datei
// kennt nur das generische Ablaufmuster:
//
//   1. JSON lesen und parsen
//   2. optional migrieren (rein im Arbeitsspeicher, keine Seiteneffekte
//      innerhalb der migrate-Funktion selbst)
//   3. das (ggf. migrierte) Ergebnis vollständig validieren
//   4. nur bei gültigem UND tatsächlich migriertem Ergebnis zurückschreiben
//   5. bei Ungültigkeit verwerfen, ohne etwas zu überschreiben
//
// Vertrag für `migrate` (verbindlich, falls angegeben):
//   migrate(raw) -> { value, migrated }
//     - value:    das (ggf. migrierte) Objekt, das anschließend validiert wird
//     - migrated: true, wenn tatsächlich migriert wurde — steuert AUSSCHLIESSLICH,
//                 ob nach erfolgreicher Validierung zurückgeschrieben wird
//
// Bewusst NICHT über Referenzungleichheit erkannt: das wäre ein versteckter,
// leicht zu brechender Vertrag (eine künftige Migrationsfunktion könnte das
// Objekt direkt verändern oder vorsorglich klonen und damit ein falsches
// Signal erzeugen). Das explizite `migrated`-Flag macht die Absicht der
// Migrationsfunktion unmissverständlich.

export function readSave(key, { migrate, validate } = {}){
  if(typeof validate !== 'function'){
    throw new Error('readSave(key, { validate }) benötigt eine validate-Funktion.');
  }
  let raw;
  try{
    raw = JSON.parse(localStorage.getItem(key));
  }catch(_error){
    return null; // beschädigtes JSON im Speicher — erwartbar, kein Programmfehler
  }

  let value = raw;
  let migrated = false;
  if(typeof migrate === 'function'){
    const result = migrate(raw);
    if(!result || typeof result !== 'object' || !('value' in result) || typeof result.migrated !== 'boolean'){
      // Vertragsbruch der migrate-Funktion selbst — das ist ein Programmierfehler
      // im aufrufenden Modul, kein erwartbarer Laufzeitfall. Bewusst NICHT still
      // in "return null" verwandeln, damit ein solcher Fehler in Tests auffällt.
      throw new Error('migrate(raw) muss { value, migrated } zurückgeben.');
    }
    value = result.value;
    migrated = result.migrated;
  }

  let isValid;
  try{
    isValid = validate(value);
  }catch(_error){
    return null; // validate() darf im Prinzip werfen — auch das weich behandeln
  }
  if(!isValid) return null;

  if(migrated){
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(_error){ /* Migration bleibt zumindest im Arbeitsspeicher wirksam */ }
  }
  return value;
}

export function clearSave(key){
  try{ localStorage.removeItem(key); }catch(_error){ /* Speicherzugriff kann fehlschlagen, kein Absturz */ }
}
