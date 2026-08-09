# Arkimis – Abschlussrunde: Legacy-Screen vollständig entfernt

**Modularisierung jetzt wirklich vollständig.** Alle sieben Module
(Sudoku, Hashi, Kakuro, Minesweeper, Futoshiki, Killer Sudoku, Thermo
Sudoku) sind API-v1-konform, und die drei zuletzt verbliebenen
Legacy-Reste sind entfernt:

- `index.html`: kompletter `#screen-game`-Abschnitt (inkl.
  `#btn-game-back` und aller darin verschachtelten Elemente) entfernt.
- `style.css`: die zugehörige `#screen-game{...}`-Regel entfernt.
- `app.js`: der `screens.game`-Eintrag entfernt.

### Ein dabei gefundener und sofort behobener Fehler

Das bloße Entfernen der `screens.game`-Zeile allein hätte NICHT
gereicht — `document.getElementById('screen-game')` hätte `null`
zurückgegeben, und `screens.game` wäre damit `null` geblieben, statt
zu verschwinden. `showScreen()` iteriert aber unconditional über ALLE
Werte in `screens` und ruft `.classList.add('hidden')` auf jedem auf
— das hätte bei **jedem einzelnen Bildschirmwechsel in der gesamten
App** einen Absturz verursacht (`Cannot read properties of null`).
Der komplette `game:`-Eintrag musste daher aus dem Objekt entfernt
werden, nicht nur umbenannt oder geleert. Durch einen gezielten
Navigationstest über alle sieben Module (öffnen → zurück zur
Levelauswahl → zurück zum Startbildschirm) bestätigt: keine Abstürze.

## Getestet (echter Chromium-Browser via Playwright)

- `node scripts/check-modules.mjs` — alle sieben Module weiterhin konform
- Systematischer ID-Abgleich `app.js` ⇄ `index.html`: keine toten
  Referenzen, keine doppelten IDs
- Vollständiger Navigationszyklus für alle sieben Module: öffnen →
  spielen → zurück zur Levelauswahl → zurück zum Startbildschirm —
  keine Seitenfehler
- Grep-Bestätigung: `screen-game`, `btn-game-back` kommen in keiner der
  drei Dateien (`index.html`, `style.css`, `app.js`) mehr vor

## Ausführen

```
python3 -m http.server 8080
```

Konformitätstest: `node scripts/check-modules.mjs`

Einzige externe Abhängigkeit: Google Fonts (CDN-Link in `index.html`,
fällt offline auf Systemschriften zurück).

## Gemeinsame Utility-Bewertung: Sudoku, Killer Sudoku, Thermo Sudoku

Nach vollständiger Modularisierung wurde systematisch geprüft, welche
Raster-/Eingabelogik zwischen den drei Sudoku-Varianten sich für eine
gemeinsame Utility lohnt — jeweils erst Bestandsaufnahme, dann
Entscheidung, statt vorsorglich zu abstrahieren.

**Ausgelagert:**
- `core/sudoku-grid-utils.js` — `sudokuBlockLines(row, col)`. Zustandslos,
  identische CSS-Werte in allen drei Modulen, keine versteckten
  Abhängigkeiten. Unit-getestet (`scripts/test-sudoku-grid-utils.mjs`),
  visuell regressionsgetestet.
- `core/save-utils.js` — `readSave(key, {migrate, validate})` und
  `clearSave(key)`. Migration und spielspezifische Validierung bleiben
  bewusst in den Modulen. `migrate()` folgt einem expliziten
  `{ value, migrated }`-Vertrag (keine Referenzgleichheits-Heuristik —
  das wäre ein versteckter, leicht zu brechender Vertrag gewesen).
  Unit-getestet (`scripts/test-save-utils.mjs`).

**Bewusst zurückgestellt: Timer (`currentElapsed`, `formatTime`,
`startTimer`, `stopTimer`)**

Analyse ergab: alle vier Funktionen sind byte-identisch in allen drei
Modulen, inklusive identischer Aufrufreihenfolge in `start()`,
`restore()`, `checkPuzzle()`, `revealSolution()` und `unmount()`. Der
Code selbst wäre also ein sauberer Kandidat. Anders als bei den
Blocklinien handelt es sich hier aber nicht um zustandslose Funktionen:
`elapsedSeconds` und `startedAt` sind Felder **innerhalb** des größeren
`game`-Objekts jedes Moduls (nicht isolierter Timer-Zustand), dazu
kommt direkter DOM-Zugriff auf `[data-role="timer"]` über die
modul-weite `root`-Variable. Eine Auslagerung als `createTimer(root)`-
Instanz wäre technisch möglich, würde aber `writeSave()`, `restore()`
und `start()` in allen drei Modulen gleichzeitig umstrukturieren
müssen (`game.elapsedSeconds` direkt lesen/schreiben würde zu
`timer.getElapsedSeconds()`/`timer.setElapsedSeconds()`), nicht nur
eine Funktion verschieben.

**Entscheidung:** Timer bleibt dauerhaft lokal in allen drei Modulen —
nicht nur vorläufig. Die Einsparung von vier identischen, aber
einfachen Funktionen rechtfertigt die nötige Umstrukturierung des
Spielzustands in drei stabil funktionierenden Modulen nicht. Vorteile
der lokalen Lösung werden bewusst in Kauf genommen statt als Nachteil
gewertet: jedes Modul bleibt vollständig eigenständig testbar, keine
gemeinsame Utility kann versehentlich alle drei Module gleichzeitig
beschädigen, Anpassungen an einem Timer beeinflussen die anderen
nicht, Speichern/Wiederherstellen bleibt direkt beim jeweiligen
Spielzustand. Der einzige Nachteil (etwas doppelter Code, vier kleine
Funktionen je Modul) wiegt dafür gering.

**Als späterer Refactoring-Kandidat trotzdem festgehalten** — erneute
Bewertung sinnvoll, falls der Timer selbst künftig funktional
erweitert wird (z.B. Pausieren bei App-Hintergrund, globale
Zeitwertung, einheitlicher Manipulationsschutz) und dieser neue Bedarf
in mehreren Modulen gleichzeitig entsteht. Bis dahin: `game.elapsedSeconds`,
`game.startedAt` und `timerInterval` bleiben unverändert lokal in
jedem Modul.

**Fokus-Hervorhebung (`highlightRowCol`/`clearRowColHighlight`): Bugfix statt Auslagerung**

Analyse ergab: Killer Sudoku und Thermo Sudoku sind bis auf den
Klassennamen identisch, **Sudoku wich strukturell ab** — beim
Einschalten des Fokus-Reglers bei bereits geöffnetem Zifferblock
zeigte Sudoku die Hervorhebung nicht sofort (0 statt 16 hervorgehobene
Felder, live im Browser nachgewiesen), sondern erst beim nächsten
Antippen einer Zelle. Killer und Thermo zeigten sie sofort korrekt.

Da eine gemeinsame Utility ohnehin identisches Verhalten in allen drei
Modulen voraussetzt, wurde dieser Unterschied zuerst als **eigenständiger,
eng begrenzter Bugfix** behoben — bewusst getrennt von der
Utility-Frage, damit bei einem Fehler klar zuordenbar bleibt, ob er aus
dem Verhaltens-Fix oder aus einer Strukturänderung stammt. Nur Sudokus
Regler-Handler wurde angepasst (`highlight(row, col)` erneut aufrufen,
wenn ein Feld aktiv ist), kein Verhalten bei Killer oder Thermo Sudoku
geändert.

Getestet: Ein-/Ausschalten bei offenem Zifferblock (beide Richtungen,
jetzt 16↔0 wie bei den Geschwistern), normales Antippen, Direkteingabe-
Modus, Speichern/Fortsetzen (Präferenz bleibt erhalten), keine
Regression bei den übrigen sechs Modulen.

Trotz behobenem Verhaltensunterschied gilt dieselbe strukturelle
Einschätzung wie beim Timer: `game.highlightEnabled`/`game.activeCell`
sind Felder innerhalb des größeren `game`-Objekts, dazu kommt eine
noch engere DOM-Kopplung als beim Timer (hartkodierter, pro Modul
unterschiedlicher CSS-Klassenname statt der `data-role`-Konvention).
**Fokuslogik bleibt daher ebenfalls dauerhaft lokal in allen drei
Modulen** — keine Auslagerung geplant.

## Eingabeabschnitt: feste Zahlenreihe (Variante 2) — zunächst nur in Sudoku

Sudoku dient als Referenzumsetzung, bevor Killer und Thermo Sudoku
folgen. Bisher war Variante 2 ein 3×3-Raster (dieselbe `.numpad`-Klasse
wie das Popup) mit einem separaten, breiten Löschen-Button darunter.
Jetzt: eine einzelne Reihe mit zehn gleich breiten Feldern
(`1 2 3 4 5 6 7 8 9 ⌫`), kein Umbruch, auf 360px-Displays vollständig
sichtbar getestet (`flex; flex-wrap:nowrap`, Felder teilen sich die
verfügbare Breite über `flex:1 1 0`).

**Umsetzung:**
- `buildNumpads()` in `buildPopupNumpad()` und `buildInlineNumpad()`
  aufgeteilt — Popup (Variante 1) strukturell unverändert, nur die
  Inline-Reihe neu aufgebaut. Löschfeld wird jetzt wie die Ziffern
  über JS in dieselbe Reihe eingehängt, kein separater Button mehr.
- `data-action="delete"` auf `data-action="inline-delete"` umbenannt —
  das war zuvor eine unbemerkte Inkonsistenz zu Kakuro/Futoshiki (die
  bereits `inline-delete` verwendeten). Da Sudoku jetzt Referenz für
  Killer/Thermo wird, war das der richtige Zeitpunkt für die Angleichung.
- Neues CSS ausschließlich in `games/sudoku/game.css` ergänzt (gekapselt
  unter `.game-sudoku`) — die zentralen `.inline-input .numpad`/
  `.inline-delete-btn`-Regeln in `style.css` bleiben unangetastet, da
  Kakuro, Futoshiki, Killer Sudoku und Thermo Sudoku sie weiterhin für
  ihre (vorerst unveränderte) 3×3-Darstellung benötigen.
- Farben, Abstände, Rundungen und die endgültige Form des Löschfelds
  bewusst nicht final — funktionaler Zwischenstand, Feinschliff folgt
  in der späteren Designrunde.

**Getestet:** 10 Felder in einer Reihe ohne Umbruch (gleiche Y-Position
aller Buttons), passt auf 360px-Breite ohne Überlauf, Ziffer markieren
→ Zelle antippen setzt den Wert, Löschfeld markieren → Zelle antippen
leert sie, vorgegebene Felder bleiben unveränderbar, Popup (Variante 1)
weiterhin vollständig funktionsfähig, Umschalten zwischen beiden
Varianten während eines laufenden Spiels inklusive Speicherung der
Präferenz über Fortsetzen hinweg, keine Regression bei den übrigen
sechs Modulen.

## Feste Zahlenreihe: Übertragung auf Killer Sudoku und Thermo Sudoku

Nach dem Praxistest bei Sudoku (siehe oben) 1:1 auf die beiden anderen
Sudoku-Varianten übertragen — Sudoku bleibt Referenz, keine Abweichung
im Verhalten.

**Umsetzung, je Modul identisch:**
- Markup: alter 3×3-`.numpad`-Block plus separater `.inline-delete-btn`
  darunter entfernt, ersetzt durch `<div class="inline-input-row"
  data-role="inline-numpad"></div>` — genau wie bei Sudoku.
- `buildInlineNumpad()`: Löschfeld wird jetzt wie die Ziffern per JS als
  zehntes, gleichrangiges Element in dieselbe Reihe eingehängt
  (`dataset.action = 'inline-delete'`), kein separater Button mehr im
  Markup.
- `bindEvents()`: der bisherige, zusätzliche Klick-Handler auf
  `[data-action="inline-delete"]` wurde entfernt. Er wäre nach der
  Umstellung ein zweiter, redundanter Listener auf demselben Button
  gewesen (der in `buildInlineNumpad()` gesetzte Listener deckt die
  Toggle-Logik bereits vollständig ab) — in der Sudoku-Referenz gibt es
  diesen zusätzlichen Handler ebenfalls nicht.
- CSS: identischer `.inline-input-row`-Regelblock wie bei Sudoku an
  `games/killer-sudoku/game.css` und `games/thermo-sudoku/game.css`
  angehängt (Klassenpräfix `.game-killer-sudoku` / `.game-thermo-sudoku`
  statt `.game-sudoku`, sonst unverändert übernommen).
- Kakuro und Futoshiki bewusst nicht angefasst — nutzen weiterhin die
  zentrale `.numpad`/`.inline-delete-btn`-Optik in `style.css` für ihre
  eigene 3×3-Darstellung.

**Getestet (echter Chromium-Browser via Playwright, 360×740px):**
- `node scripts/check-modules.mjs` — weiterhin alle sieben Module konform
- Killer Sudoku und Thermo Sudoku je einzeln: 10 Felder in einer Reihe
  ohne Umbruch, Reihenbreite 328px bei 360px-Viewport (kein Überlauf)
- Feste Reihe: Ziffer markieren → Zelle antippen setzt den Wert;
  Löschfeld markieren → Zelle antippen leert sie (beide Module)
- Popup-Variante (Variante 1) bei beiden Modulen weiterhin unverändert
  funktionsfähig (Regressionstest: Zifferblock öffnet sich, Wert wird
  gesetzt)
- Eingabe-Präferenz bleibt nach Neuladen/Fortsetzen erhalten (beide
  Module)
- Vollständiger Navigationszyklus über alle sieben Module (öffnen →
  spielen → zurück zur Levelauswahl → zurück zum Startbildschirm):
  keine Fehler, keine hängengebliebenen Screens
- Keine unerwarteten Konsolenfehler (die einzige Meldung ist der aus
  der Sandbox-Umgebung erwartete 403 der Google-Fonts-CDN, siehe
  Abschnitt „Ausführen")

## Vollständiger Smartphone-Regressionstest (Playwright, 360×740px)

Über alle sieben Module hinweg geprüft, nicht modulspezifisch:
- Profilanlage → Startbildschirm → alle sieben Spielkarten einzeln
  geöffnet, jeweils erster Level gestartet, über den Zurück-Button des
  Moduls zur Levelauswahl und von dort zum Startbildschirm zurück —
  bei allen sieben Modulen ohne Fehler
- Keine doppelten IDs zwischen `index.html` und `app.js`
- Popup-/Inline-Eingabe-Regression bei Killer und Thermo Sudoku (siehe
  oben) als Teil dieses Durchlaufs mit abgedeckt

**Ergebnis:** keine Regression bei den übrigen sechs Modulen, keine
offenen Fehler.

## Startbildschirm: Schließverhalten „Sprache"/„Eigenschaften"-Panel

Beide Panels (`#lang-panel` = „Sprache", `#dev-panel` = „Eigenschaften"
— sichtbare Überschrift und Button-Titel jetzt auf „Eigenschaften"
umbenannt, bisher „Simulation (Prototyp)"; internes Verhalten
unverändert Online-/Kaufstatus-Simulation, vermutlich Ansatzpunkt für
die spätere echte Eigenschaften-Funktion)
schließen jetzt zuverlässig:

- Antippen desselben Auslöse-Icons schließt (bereits vorher korrekt).
- **Neu:** Antippen außerhalb des Panels schließt es.
- Öffnen des einen schließt das jeweils andere (bereits vorher korrekt).
- **Neu:** Eine Rätselauswahl schließt beide Panels automatisch — zentral
  in `openGame()` verankert, deckt damit jeden Weg zur Spielauswahl ab.
- **Neu:** Die Zurück-Taste des Smartphones (bzw. Browser-Zurück)
  schließt zuerst ein offenes Panel, statt sofort die Seite zu
  verlassen — über die History-API umgesetzt (`history.pushState()`
  beim Öffnen, `popstate`-Listener schließt beim Zurück-Drücken; beim
  Schließen auf andere Weise wird der zusätzliche History-Eintrag über
  `history.back()` wieder entfernt, ohne eine echte Navigation
  auszulösen).

Getestet: alle sechs Regeln einzeln im echten Browser bestätigt,
Online-/Kauf-Simulationsschalter im Eigenschaften-Panel weiterhin
funktionsfähig, keine Regression bei allen sieben Modulen.

## Globale `hasInteracted`-/„gespielt"-Regel (alle sieben Spiele)

Ersetzt die frühere Annahme, dass „Neues Spiel" einen Fehlversuch
auslöst. Die verbindliche Regel: **nicht** das Öffnen/Starten eines
Rätsels zählt als `+1 gespielt`, sondern die **erste tatsächlich
wirksame spielrelevante Aktion** darin — dann sofort und genau einmal.

**Umsetzung:** jedes Modul bekam einen eigenen `markInteracted()`-Helfer
(bewusst nicht ausgelagert — passt zur bisherigen Zurückhaltung bei
modul-übergreifenden Utilities):

```js
function markInteracted(){
  if(game.hasInteracted) return;
  game.hasInteracted = true;
  context.stats.bump('<gameId>', 'played');
  writeSave(); // sofortige Persistierung — verhindert Doppelzählung nach Neustart
}
```

Aufgerufen an der Stelle, an der bisher `game.hasInteracted = true;`
stand — aber **nur dort, wo die Aktion auch tatsächlich etwas
verändert**, nicht bei jedem Tastendruck. Der `played`-Bump beim Sieg
(`checkPuzzle()`) wurde entfernt (`won` wird weiterhin dort gebumpt);
ebenso der bisherige `played`-Bump in `revealSolution()`, da beide
Fälle jetzt bereits über die erste Interaktion abgedeckt sind.

**Ein wichtiger Korrekturfall bei Hashi:** `toggleBridgeBetween()` kann
bei einer verbotenen Kreuzung früh abbrechen, ohne dass tatsächlich
eine Brücke gebaut oder entfernt wird. `markInteracted()` musste daher
**nach** dieser Prüfung platziert werden, nicht davor — sonst hätte
auch ein abgelehnter Brückenversuch gezählt. Durch Code-Inspektion
verifiziert (der `return` bei erkannter Kreuzung steht eindeutig vor
dem Aufruf); eine geometrisch exakte Kreuzung auf einem zufällig
generierten Rätsel ließ sich für einen automatisierten UI-Test nicht
praktikabel reproduzieren.

**Bei Minesweeper** zählen Feldaufdecken und Flaggen — aber nicht ein
Klick auf ein bereits aufgedecktes oder anderweitig nicht veränderbares
Feld (beide Guard-Klauseln stehen bereits vor jeder möglichen
`markInteracted()`-Erreichbarkeit).

**Getestet, je Modul einzeln, alle sieben Spiele:**
- Start ohne Aktion → `+0`
- ungültige/wirkungslose Aktion (bereits aufgedecktes Minesweeper-Feld) → `+0`
- erste erfolgreiche Aktion → sofort `+1`
- weitere Aktionen im selben Rätsel → keine weitere Erhöhung
- Verlassen und Fortsetzen → keine Erhöhung
- Neu mischen/„Neues Spiel" → keine zusätzliche Erhöhung (für das alte Rätsel)
- erster Spielzug im neu erzeugten Rätsel → wieder `+1`
- **sofortige Persistierung bestätigt:** simulierter App-Neustart
  (vollständiges Neuladen der Seite) direkt nach der ersten Aktion,
  danach Fortsetzen — `played` bleibt bei 1, keine Doppelzählung

## Nächster Schritt

**Empfohlene Reihenfolge:**
1. ~~Schließverhalten von Sprache/Eigenschaften korrigieren~~ ✅ erledigt
2. ~~Globale `hasInteracted`-/Fehlversuch-Regel für alle sieben Spiele~~ ✅ erledigt
3. ~~Feste Eingabereihe auf Killer Sudoku und Thermo Sudoku übertragen~~ ✅ erledigt
4. ~~Vollständiger Smartphone-Regressionstest~~ ✅ erledigt, keine offenen Fehler

**Noch offen:** Farben, Abstände, Rundungen und die endgültige Form
des Löschfelds der festen Eingabereihe sind bei allen drei
Sudoku-Varianten weiterhin bewusst nicht final (funktionaler
Zwischenstand) — Feinschliff folgt in einer späteren Designrunde.

## Internationalisierung — Phase 1 (technische Vorbereitung)

Ziel: die komplette App-Architektur für mehrsprachige Oberflächen
vorbereiten, ohne bereits eine vollständige englische Übersetzung zu
verlangen. Deutsch bleibt aktive Standardsprache, bestehender Wortlaut
unverändert — nur die Textquelle wechselt von hart codiert zu
Übersetzungs-Keys.

**Architektur:**
- `core/i18n.js` — zentrale Engine: `init()`, `t(key, vars)`
  (Punkt-Notation, `{platzhalter}`-Interpolation), `setLocale()`/
  `getLocale()`/`onLocaleChange()` (Sprachwechsel ohne Reload),
  `applyTranslations(root)` (wendet `data-i18n(-title|-placeholder|
  -aria-label)`-Attribute auf statisches Markup an).
- `locales/de.js` — vollständige Referenzsprache UND fester Fallback.
  Jeder verwendete Key MUSS hier existieren.
- `locales/en.js` — Phase-1-Platzhalter, bewusst unvollständig (siehe
  Datei-Kopfkommentar): App-Schale vollständig übersetzt, die
  meisten `game.*`-Texte (Level-Beschreibungen, Regeltexte) fehlen
  noch absichtlich, um den Fallback-Mechanismus real zu prüfen.
- `scripts/check-i18n-keys.mjs` — Entwicklerprüfung (Stil wie
  `check-modules.mjs`): jeder im Code verwendete Key MUSS in `de.js`
  existieren (harter Fehler sonst), meldet zusätzlich informativ
  Lücken in `en.js` und ungenutzte `de.js`-Keys.
- Persistenz: eigener `localStorage`-Schlüssel `arkimis_locale_v1`
  (bewusst getrennt vom App-State `spielsammlung_state_v1` — Sprache
  ist eine geräteweite Einstellung, kein Teil des versionierten
  Spielstands, und so bleiben auch die Spielmodule ohne Zugriff auf
  den App-State selbstständig lesefähig).
- Start-Reihenfolge: gespeicherte Präferenz → Gerätesprache → Deutsch.
  **Wichtige Einschränkung:** die automatische Geräte-/Browsererkennung
  aktiviert in Phase 1 ausschließlich `de` (`AUTO_DETECTABLE_LOCALES`
  in `core/i18n.js`), obwohl `en` technisch unterstützt wird — sonst
  bekäme jeder Anwender mit Englisch als Systemsprache sofort eine
  Mischung aus Englisch und deutschem Fallback zu sehen, bevor der
  English-Rollout überhaupt freigegeben ist. Ein manueller
  `setLocale('en')`-Aufruf bleibt jederzeit möglich (z.B. für Tests).
  Das Sprachpanel selbst zeigt „English" weiterhin deaktiviert
  (`disabled`, Badge „bald").

**Key-Konvention:** verschachtelte Objekte, Punkt-Notation.
`common.*` für app-weit identischen, mehrfach dupliziert vorgefundenen
Text (Buttons, Regler-Beschriftungen, Rätsel-Verwerfen-Dialog).
`games.<id>.title` für die Katalog-Namen. `game.<id>.*` für
modul-eigenen Text (Level-Beschreibungen, Regeltexte,
Erfolgsmeldungen) — auch dort, wo der Wortlaut zwischen den Modulen
zufällig gleich ist (z.B. Sudoku/Hashi teilen sich denselben
Levelbeschreibungs-Wortlaut, bekommen aber trotzdem eigene Keys, da
es sich inhaltlich um unabhängigen Text handelt, nicht um eine
gemeinsame Utility-Zeichenkette). `common.difficulty.*` ist die
einzige Ausnahme: die fünf Schwierigkeitsgrad-Namen „Sehr
leicht"/„Leicht"/„Mittel"/„Schwer"/„Experte" sind über sechs Module
hinweg (Sudoku, Hashi, Kakuro, Futoshiki, Killer Sudoku, Thermo
Sudoku) Zeichen für Zeichen identisch und daher echt gemeinsam
ausgelagert.

**Save-Kompatibilität (Minesweeper):** einziges Modul, dessen
Speicherstand einen rohen Anzeige-Text persistiert (`label`, für den
Level-Chip statt Sternen wie bei den übrigen Modulen). Statt
`saveVersion` zu erhöhen, wurde `labelKey` rein additiv ergänzt:
`label` bleibt unverändert bestehen (Rückwärtskompatibilität mit
Altspielständen, `validateSave` verlangt weiterhin nur `label` als
Pflichtfeld), `labelKey` wird zusätzlich geschrieben und bei der
Anzeige bevorzugt (`game.labelKey ? t(game.labelKey) : game.label`) —
alte Spielstände ohne `labelKey` zeigen weiterhin ihren gespeicherten
Text, neue Spielstände zeigen sprachaktuellen Text.

**LEVELS/DIFFICULTIES-Arrays:** `label`/`desc` durch `labelKey`/
`descKey` ersetzt (Sudoku, Hashi, Kakuro, Futoshiki, Killer Sudoku,
Thermo Sudoku, Minesweeper), aufgelöst erst beim Rendern der
Levelauswahl über `t()` — nicht beim Modul-Import, da die Arrays
`Object.freeze()`-Konstanten sind und sonst ein Sprachwechsel ohne
Reload wirkungslos bliebe.

**Bewusst nicht übersetzt (dokumentierte Ausnahmen):**
- `AD_SAMPLES` in `app.js` — rotierende Fake-Werbetexte, die
  Drittanbieter-Werbeinhalte simulieren, nicht Teil der
  App-eigenen Oberflächensprache.
- Tote Funktionen `resetRevealLink()` und die 3-Parameter-Variante
  von `refreshHintButton()` in `app.js` — nachweislich nirgends
  aufgerufen (nur die jeweils modul-eigenen, parameterlosen
  Versionen sind aktiv), nicht migriert.
- Konsolen-/Entwickler-Fehlermeldungen (`console.error(...)` in
  `loadModule()`/`showModuleLevels()`) — nie userseitig sichtbar,
  die entsprechende userseitige Meldung (`levels.loadError`) ist
  übersetzt.
- `common.back` und `common.hintsInfinite` — als Reserve-Keys
  angelegt, aktuell ungenutzt (Zurück-Pfeile haben kein Text-/
  ARIA-Label im bestehenden Markup; das Unendlich-Symbol gehört zu
  einer bereits vorher toten Codepfad-Variante).
- Orphaned: `state.language`-Feld im App-State — durch den
  eigenständigen `arkimis_locale_v1`-Schlüssel abgelöst, absichtlich
  nicht entfernt (Ladekompatibilität mit Altständen, wird von
  `loadState()` weiterhin defensiv mitgeladen, aber nirgends mehr
  gelesen).

**Gefundener und behobener Fehler:** die Geräte-/Browserspracherkennung
hätte ohne das oben beschriebene `AUTO_DETECTABLE_LOCALES`-Gate sofort
für jeden Testlauf in dieser Umgebung (Sandbox-Chromium liefert
standardmäßig `navigator.language = en-US`) automatisch Englisch
aktiviert — real reproduziert über den Regressionstest, nicht nur
theoretisch. Root Cause: Erkennung unterschied nicht zwischen
„technisch unterstützt" und „für Auto-Aktivierung freigegeben". Fix:
siehe oben, Kommentar in `core/i18n.js`.

**Getestet:**
- `node scripts/check-i18n-keys.mjs` — alle verwendeten Keys in
  `de.js` vorhanden; einzige ungenutzte Keys sind die zwei oben
  dokumentierten Reserve-Fälle
- `node scripts/check-modules.mjs` — weiterhin alle sieben Module
  API-v1-konform
- Beide bestehenden Unit-Test-Skripte weiterhin grün
- `node --check` auf allen geänderten/neuen `.js`-Dateien
- Playwright, 360×740px, echter Chromium: deutscher Volldurchlauf
  über alle sieben Module (Titel korrekt, keine rohen Keys, kein
  `undefined` im Text), `setLocale('en')` schaltet korrekt um,
  ein in `en.js` absichtlich fehlender Key fällt nachweislich auf
  den deutschen Text zurück (nicht auf den rohen Key), Sprachwechsel
  wirkt sich ohne Reload auf den bereits sichtbaren Startbildschirm
  aus, gewählte Locale bleibt über `localStorage` erhalten, keine
  Konsolenfehler außer dem bekannten/erwarteten 403 der
  Google-Fonts-CDN (Sandbox ohne Internetzugriff)
- Keine doppelten IDs zwischen `index.html`/`app.js`

**Noch offen für Phase 2 (nach Nutzer-Review-Checkpoint):**
vollständige, natürliche (nicht mechanische) englische Übersetzung
aller `game.*`-Texte, Sprachpanel-Radio für Englisch aktivieren,
Layout-Regressionstest mit längeren/kürzeren englischen Texten
(Buttons, Dialoge, Statistik, Level-Titel), Live-Hot-Swap der
Übersetzung innerhalb eines bereits laufenden Rätsels (aktuell wird
beim Sprachwechsel nur Startbildschirm/Levelauswahl-Titel sofort
aktualisiert, ein bereits geöffnetes Spielmodul nicht — unkritisch,
da Englisch in Phase 1 ohnehin nicht über die UI erreichbar ist).
