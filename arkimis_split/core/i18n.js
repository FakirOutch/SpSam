/**
 * Zentrale Lokalisierungs-Engine (Phase 1: technische Vorbereitung).
 *
 * Architekturentscheidungen (siehe auch README, Abschnitt "Internationalisierung"):
 * - Deutsch ("de") ist die vollständige Referenzsprache UND der feste
 *   Fallback. Jede fehlende Übersetzung in einer anderen Sprache fällt
 *   automatisch auf "de" zurück, niemals auf den rohen Key.
 * - Keine Netzwerkabhängigkeit: Sprachressourcen liegen als lokale
 *   ES-Module unter /locales und werden per import() geladen, genau wie
 *   die übrigen core/-Utilities dieses Projekts (kein Bundler, kein CDN).
 * - Persistenz über einen eigenen, schmalen localStorage-Schlüssel statt
 *   über den großen App-State (spielsammlung_state_v1) — Sprachwahl ist
 *   eine geräteweite Einstellung, kein Teil des versionierten Spielstands,
 *   und so bleiben auch die Spielmodule (die keinen Zugriff auf den
 *   App-State haben) unabhängig lesefähig.
 * - Reine, gepufferte Key-Suche mit Punkt-Notation ("common.back"),
 *   Platzhalter-Interpolation ({name}) und Entwickler-Warnungen bei
 *   fehlenden Keys (console.warn, kein Absturz, kein sichtbarer Rohkey
 *   im Normalfall, siehe t()).
 */

const FALLBACK_LOCALE = 'de';
const SUPPORTED_LOCALES = ['de', 'en'];
// Locales, die automatisch per Geräte-/Browsersprache aktiviert werden
// dürfen (Requirement: "otherwise sensible device/browser-language
// detection"). Bewusst NUR "de", solange "en" noch die unvollständige
// Phase-1-Platzhalter-Locale ist (siehe locales/en.js-Kopfkommentar) —
// sonst würde jeder Browser mit Englisch als Systemsprache automatisch
// eine Mischung aus Englisch/Deutsch (Fallback-Lücken) zu sehen bekommen,
// bevor der Nutzer-Review-Checkpoint überhaupt stattgefunden hat. Eine
// Locale kann weiterhin jederzeit EXPLIZIT gesetzt werden (setLocale()),
// z.B. über das Sprachpanel oder zu Testzwecken — nur die STILLE,
// automatische Aktivierung über die Geräteerkennung ist eingeschränkt.
// Sobald en.js in Phase 2 vollständig ist, hier einfach 'en' ergänzen.
const AUTO_DETECTABLE_LOCALES = ['de'];
const STORAGE_KEY = 'arkimis_locale_v1';

const loaders = {
  de: () => import('../locales/de.js'),
  en: () => import('../locales/en.js'),
};

let currentLocale = FALLBACK_LOCALE;
let currentDict = null;
let fallbackDict = null;
let initPromise = null;
const changeListeners = [];
const warnedOnce = new Set(); // vermeidet Konsolen-Spam bei wiederholtem Rendering derselben Ansicht

function readStoredLocale(){
  try{
    const stored = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_LOCALES.includes(stored) ? stored : null;
  }catch(e){
    return null; // z.B. privater Modus ohne Storage-Zugriff — dann greift die Geräteerkennung
  }
}

function detectBrowserLocale(){
  const raw = (navigator.language || (navigator.languages && navigator.languages[0]) || '').slice(0, 2).toLowerCase();
  return AUTO_DETECTABLE_LOCALES.includes(raw) ? raw : null;
}

/** Ermittelt die Startsprache: gespeicherte Präferenz > Gerätesprache > Deutsch. */
function detectInitialLocale(){
  return readStoredLocale() || detectBrowserLocale() || FALLBACK_LOCALE;
}

function getByPath(dict, key){
  if(!dict) return undefined;
  return key.split('.').reduce((node, part) => (node && typeof node === 'object') ? node[part] : undefined, dict);
}

function interpolate(str, vars){
  if(!vars) return str;
  return str.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined ? String(vars[name]) : match));
}

async function loadDict(locale){
  const module = await loaders[locale]();
  return module.default;
}

/**
 * Muss vor dem ersten Rendern einmal aufgerufen und abgewartet werden
 * (siehe app.js START-Abschnitt). Lädt zunächst das Fallback-Wörterbuch
 * "de" (immer benötigt), danach die tatsächlich aktive Sprache.
 */
export function init(){
  if(!initPromise){
    initPromise = (async () => {
      fallbackDict = await loadDict(FALLBACK_LOCALE);
      await setLocale(detectInitialLocale(), { persist:false });
    })();
  }
  return initPromise;
}

/**
 * Wechselt die aktive Sprache. persist:false wird intern beim Start
 * genutzt (Erkennung soll nicht ungefragt in den Storage zurückschreiben,
 * solange der Anwender noch keine bewusste Wahl getroffen hat).
 * Kann jederzeit erneut aufgerufen werden — Module, die sich über
 * onLocaleChange() registriert haben, werden benachrichtigt, damit ein
 * Sprachwechsel ohne Seiten-Reload durchgereicht werden kann.
 */
export async function setLocale(locale, { persist = true } = {}){
  if(!SUPPORTED_LOCALES.includes(locale)) locale = FALLBACK_LOCALE;
  currentDict = (locale === FALLBACK_LOCALE) ? fallbackDict : await loadDict(locale);
  currentLocale = locale;
  if(persist){
    try{ localStorage.setItem(STORAGE_KEY, locale); }catch(e){ /* z.B. privater Modus — Wahl gilt dann nur für diese Sitzung */ }
  }
  changeListeners.forEach(fn => { try{ fn(locale); }catch(e){ console.error('[i18n] Fehler in onLocaleChange-Listener:', e); } });
}

export function getLocale(){ return currentLocale; }
export function getFallbackLocale(){ return FALLBACK_LOCALE; }
export function getSupportedLocales(){ return SUPPORTED_LOCALES.slice(); }

/** Registriert einen Listener für Sprachwechsel; liefert eine Abmeldefunktion zurück. */
export function onLocaleChange(fn){
  changeListeners.push(fn);
  return () => {
    const idx = changeListeners.indexOf(fn);
    if(idx >= 0) changeListeners.splice(idx, 1);
  };
}

/**
 * Übersetzt einen Key. Fehlt er in der aktiven Sprache, greift automatisch
 * der Fallback "de" (mit einmaliger Entwickler-Warnung pro Key). Fehlt er
 * auch dort — sollte in Phase 1 praktisch nie vorkommen, da "de" die
 * vollständige Referenz ist — wird sicherheitshalber NICHT der rohe Key an
 * Anwender ausgeliefert, sondern ein neutraler Platzhalter; der eigentliche
 * Fehler ist über die Konsolen-Warnung und scripts/check-i18n-keys.mjs
 * bereits während der Entwicklung auffindbar.
 */
export function t(key, vars){
  let value = getByPath(currentDict, key);
  if(value === undefined){
    value = getByPath(fallbackDict, key);
    if(value !== undefined){
      warnMissing(key, 'fehlt in "' + currentLocale + '", Fallback auf "' + FALLBACK_LOCALE + '"');
    } else {
      warnMissing(key, 'fehlt auch im Fallback "' + FALLBACK_LOCALE + '" — bitte in locales/de.js ergänzen');
      return '⚠︎';
    }
  }
  if(typeof value !== 'string'){
    warnMissing(key, 'zeigt nicht auf einen Textwert (falscher Key-Pfad?)');
    return '⚠︎';
  }
  return interpolate(value, vars);
}

function warnMissing(key, reason){
  const flag = currentLocale + ':' + key;
  if(warnedOnce.has(flag)) return;
  warnedOnce.add(flag);
  console.warn('[i18n] Key "' + key + '" ' + reason);
}

/**
 * Wendet deklarative data-i18n-* Attribute auf ein DOM-Fragment an —
 * für statisches Markup in index.html, das nicht über JS-Templates
 * erzeugt wird. Wird einmal beim Start und nach jedem Sprachwechsel
 * aufgerufen. Dynamisch von den Spielmodulen erzeugtes Markup ruft t()
 * stattdessen direkt in seinen eigenen Render-Funktionen auf.
 *
 *   data-i18n="key"            -> textContent
 *   data-i18n-title="key"      -> title-Attribut
 *   data-i18n-placeholder="key"-> placeholder-Attribut
 *   data-i18n-aria-label="key" -> aria-label-Attribut
 */
export function applyTranslations(root = document){
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.getAttribute('data-i18n-title')); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-placeholder')); });
  root.querySelectorAll('[data-i18n-aria-label]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label'))); });
}
