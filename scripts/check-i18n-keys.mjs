// i18n-Schlüsselprüfung (Phase 1).
//
// 1. Findet jeden im Quellcode tatsächlich verwendeten Übersetzungs-Key
//    (t('...')-Aufrufe in app.js/games/**/game.js, data-i18n-* Attribute
//    in index.html).
// 2. Prüft: JEDER verwendete Key MUSS in locales/de.js existieren, sonst
//    Fehler (exit 1) — de.js ist die verbindliche vollständige Referenz.
// 3. Meldet zusätzlich, informativ, welche dieser Keys in locales/en.js
//    (noch) fehlen — das ist in Phase 1 erwartet und KEIN Fehler, macht
//    den Übersetzungs-Fortschritt aber sichtbar.
// 4. Meldet Keys, die in de.js definiert, aber nirgends im Code verwendet
//    werden (informativ — toter Übersetzungstext).
//
// Aufruf: node scripts/check-i18n-keys.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []){
  for(const entry of readdirSync(dir)){
    const full = join(dir, entry);
    const st = statSync(full);
    if(st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function getByPath(dict, key){
  return key.split('.').reduce((node, part) => (node && typeof node === 'object') ? node[part] : undefined, dict);
}

function collectKeys(dict, prefix = '', out = new Set()){
  if(dict && typeof dict === 'object'){
    for(const [k, v] of Object.entries(dict)){
      const path = prefix ? prefix + '.' + k : k;
      if(v && typeof v === 'object') collectKeys(v, path, out);
      else out.add(path);
    }
  }
  return out;
}

// ---------- 1. Verwendete Keys im Quellcode finden ----------
const usedKeys = new Map(); // key -> [Fundstellen]
function record(key, location){
  if(!usedKeys.has(key)) usedKeys.set(key, []);
  usedKeys.get(key).push(location);
}

const jsFiles = walk(ROOT).filter(f =>
  (f.endsWith('.js')) &&
  !f.includes('/locales/') &&
  !f.includes('/core/i18n.js') && // definiert t(), verwendet es nicht selbst
  !f.includes('/scripts/')
);
const T_CALL = /\bt\(\s*(['"`])((?:(?!\1).)+)\1/g;
for(const file of jsFiles){
  const text = readFileSync(file, 'utf8');
  let match;
  while((match = T_CALL.exec(text))){
    // Echte Template-Literale mit Interpolation (z.B. `game.x.${var}.label`)
    // lassen sich nicht statisch auflösen — kein Fehltreffer, einfach
    // übersprungen. Der reale Ziel-Key wird an anderer Stelle (dort, wo er
    // als fertiger String zusammengesetzt/zugewiesen wird, siehe zweiter
    // Pass unten) bereits als "verwendet" erkannt.
    if(match[2].includes('${')) continue;
    record(match[2], file.replace(ROOT + '/', ''));
  }
}
// Zweiter Pass: dynamische t(x.labelKey)/t(x.descKey)-Aufrufe (LEVELS/
// DIFFICULTIES-Einträge, GAME_TITLE_KEYS-Map) lassen sich nicht als
// String-Literal direkt in einem t(...)-Aufruf erkennen — der Key steckt
// stattdessen als Objekt-Property-Wert daneben. Jeder dort zugewiesene
// String, der wie ein Key-Pfad aussieht (nur a-z/A-Z/0-9, mindestens ein
// Punkt), wird deshalb zusätzlich als "verwendet" gezählt. Das ist eine
// Heuristik (kein AST), aber in dieser Codebasis kommen dotted-lowercase
// Strings ausschließlich als i18n-Keys vor.
const KEY_LOOKING_LITERAL = /['"`]([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+)['"`]/g;
for(const file of jsFiles){
  const text = readFileSync(file, 'utf8');
  let match;
  while((match = KEY_LOOKING_LITERAL.exec(text))){
    if(!usedKeys.has(match[1])) record(match[1], file.replace(ROOT + '/', '') + ' (dynamisch, z.B. labelKey/descKey)');
  }
}

const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const ATTR = /data-i18n(?:-title|-placeholder|-aria-label)?="([^"]+)"/g;
{
  let match;
  while((match = ATTR.exec(indexHtml))){
    record(match[1], 'index.html');
  }
}

// ---------- 2. Locales laden ----------
const de = (await import('../locales/de.js')).default;
const en = (await import('../locales/en.js')).default;

// ---------- 3. Verwendete Keys gegen de.js prüfen (Pflicht) ----------
const missingInDe = [];
for(const [key, locations] of usedKeys){
  if(getByPath(de, key) === undefined) missingInDe.push({ key, locations });
}

// ---------- 4. Verwendete Keys gegen en.js prüfen (informativ) ----------
const missingInEn = [];
for(const key of usedKeys.keys()){
  if(getByPath(en, key) === undefined) missingInEn.push(key);
}
missingInEn.sort();

// ---------- 5. In de.js definierte, aber nie verwendete Keys (informativ) ----------
const allDeKeys = collectKeys(de);
const unused = [...allDeKeys].filter(k => !usedKeys.has(k)).sort();

// ---------- Ausgabe ----------
console.log('i18n-Schlüsselprüfung\n');
console.log(usedKeys.size + ' im Code verwendete Keys gefunden (app.js, games/**/game.js, index.html).\n');

if(missingInDe.length){
  console.log('✗ FEHLER: ' + missingInDe.length + ' verwendete(r) Key(s) fehlen in locales/de.js (Referenzsprache MUSS vollständig sein):');
  missingInDe.forEach(({ key, locations }) => console.log('  - ' + key + '  (' + locations.join(', ') + ')'));
  console.log('');
} else {
  console.log('✓ Alle verwendeten Keys sind in locales/de.js vorhanden.\n');
}

console.log('ℹ ' + missingInEn.length + ' Key(s) noch nicht in locales/en.js übersetzt (in Phase 1 erwartet):');
if(missingInEn.length){
  const preview = missingInEn.slice(0, 12);
  preview.forEach(k => console.log('  - ' + k));
  if(missingInEn.length > preview.length) console.log('  … und ' + (missingInEn.length - preview.length) + ' weitere');
} else {
  console.log('  (keine — en.js wäre damit bereits vollständig)');
}
console.log('');

if(unused.length){
  console.log('ℹ ' + unused.length + ' in de.js definierte Key(s) werden aktuell nirgends im Code verwendet (evtl. totes Übersetzungsmaterial):');
  unused.forEach(k => console.log('  - ' + k));
  console.log('');
}

if(missingInDe.length){
  console.error('Ergebnis: FEHLGESCHLAGEN — siehe fehlende Keys in de.js oben.');
  process.exit(1);
} else {
  console.log('Ergebnis: BESTANDEN (de.js vollständig; en.js-Lücken sind Phase-1-konform).');
}
