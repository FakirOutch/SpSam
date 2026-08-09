/**
 * Deutsch — vollständige Referenzsprache und fester Fallback (core/i18n.js).
 * Jeder in der App verwendete Key MUSS hier vorhanden sein; die
 * Vollständigkeit wird über scripts/check-i18n-keys.mjs geprüft.
 *
 * Konvention: verschachtelte Objekte, Punkt-Notation beim Zugriff
 * (z.B. t('common.back')). "common.*" für App-weit identischen Text,
 * "games.<id>.title" für die Spielnamen im Katalog, "game.<id>.*" für
 * modul-eigenen Text (Level-Beschreibungen, Regeltexte, Erfolgsmeldungen).
 */
export default {
  app: {
    title: 'Meine Spielesammlung',
  },

  common: {
    back: 'Zurück', // aktuell ungenutzt: Zurück-Pfeile (←) haben kein Text-/ARIA-Label im bestehenden Markup — Key bewusst als Reserve für eine spätere Barrierefreiheits-Ergänzung stehen gelassen, nicht neu eingeführtes UI-Element
    newPuzzle: 'Neu mischen',
    newGameLabel: 'Neues Spiel',
    check: 'Prüfen',
    hintsSuffix: 'Tipps',
    hintsInfinite: '∞',
    reveal: 'Lösung anzeigen (zählt nicht als gelöst)',
    revealed: 'Lösung angezeigt — zählt nicht als gelöst',
    clearField: 'Feld leeren',
    deleteNumber: 'Zahl löschen',
    continueGame: 'Fortsetzen',
    discardConfirmNamed: 'Das begonnene {game} verwerfen und ein neues Spiel wählen?',
    inputModeToggleTitle: 'Eingabe: An = Zifferblock-Popup, Aus = feste Zahlenauswahl unten',
    focusToggleTitle: 'Fokus: Reihe & Spalte beim Eintragen grau hervorheben',
    toggleFocus: 'Fokus',
    toggleInput: 'Eingabe',
    favorite: 'Favorit',
    difficulty: {
      veryEasy: 'Sehr leicht',
      easy: 'Leicht',
      medium: 'Mittel',
      hard: 'Schwer',
      expert: 'Experte',
    },
  },

  profile: {
    welcome: 'Willkommen!',
    subtitle: 'Leg dein Profil an, um loszuspielen.',
    namePlaceholder: 'Dein Name',
    start: 'Los geht\u2019s',
  },

  home: {
    greeting: 'Hallo, {name}',
    langPanelIcon: 'Sprache',
    devPanelIcon: 'Eigenschaften',
    collectionTitle: 'Deine Spielesammlung',
    listView: 'Listenansicht',
    gridView: 'Rasteransicht',
    played: 'Gespielt',
    won: 'Gewonnen',
    inDevelopment: 'In Entwicklung',
    badgeSoon: 'bald',
    badgeNew: 'neu',
  },

  panel: {
    lang: {
      title: 'Sprache',
      german: 'Deutsch',
      english: 'English',
      moreComingSoon: 'Weitere Sprachen folgen in einer späteren Version.',
    },
    dev: {
      title: 'Eigenschaften',
      online: 'Online',
      purchased: 'App gekauft',
      note: 'In der echten App ersetzt durch Network-Plugin & Kauf-/Lizenzstatus.',
    },
  },

  levels: {
    tutorial: 'Tutorial',
    tutorialComingSoon: 'Kommt später',
    loadError: '{title} konnte nicht geladen werden. Bitte starte die App erneut.',
  },

  loading: {
    generating: 'Rätsel wird erstellt …',
  },

  success: {
    title: 'Gelöst!',
    defaultText: 'Alle Zahlen sind richtig. Stark gespielt!',
    next: 'Nächstes',
    otherLevel: 'Stufe wechseln',
  },

  ads: {
    tag: 'AD',
    placeholderLabel: 'Werbung',
    placeholderSuffix: 'Platzhalterinhalt',
    cta: 'Mehr',
  },

  // Spielnamen für den Katalog (Startbildschirm-Kacheln, Levelauswahl-Titel,
  // Modul-Kopfzeile). International übliche Rätselnamen — bleiben in der
  // Praxis oft auch in anderen Sprachen unverändert, sind hier trotzdem als
  // eigene Keys geführt statt hart codiert, damit eine spätere Locale sie
  // bei Bedarf abweichend benennen könnte.
  games: {
    sudoku: { title: 'Sudoku' },
    hashi: { title: 'Hashi' },
    kakuro: { title: 'Kakuro' },
    minesweeper: { title: 'Minesweeper' },
    futoshiki: { title: 'Futoshiki' },
    killerSudoku: { title: 'Killer Sudoku' },
    thermoSudoku: { title: 'Thermo Sudoku' },
    memory: { title: 'Memory' },
  },

  // Modul-eigener Text: Regeltexte, Level-Beschreibungen, Erfolgsmeldungen.
  // Die kurzen Level-Beschreibungen sind bewusst je Modul eigene Keys (nicht
  // zusammengefasst) — anders als die 5 Schwierigkeitsgrad-Namen oben
  // (common.difficulty.*) unterscheidet sich ihr Wortlaut von Modul zu
  // Modul tatsächlich inhaltlich.
  game: {
    sudoku: {
      levels: {
        1: { desc: 'Ideal für Einsteiger, kleine Rätsel' },
        2: { desc: 'Locker herausfordernd' },
        3: { desc: 'Mittlere Schwierigkeit' },
        4: { desc: 'Für Geübte' },
        5: { desc: 'Echte Kopfnuss' },
      },
      success: 'Alle Zahlen sind richtig. Stark gespielt!',
    },
    hashi: {
      levels: {
        1: { desc: 'Ideal für Einsteiger, kleine Rätsel' },
        2: { desc: 'Locker herausfordernd' },
        3: { desc: 'Mittlere Schwierigkeit' },
        4: { desc: 'Für Geübte' },
        5: { desc: 'Echte Kopfnuss' },
      },
      success: 'Alle Inseln korrekt verbunden. Stark gespielt!',
    },
    kakuro: {
      levels: {
        1: { desc: '7×7, entspannt' },
        2: { desc: '9×9, locker' },
        3: { desc: '11×11, mittel' },
        4: { desc: '12×12, anspruchsvoll' },
        5: { desc: '13×13, echte Kopfnuss' },
      },
      success: 'Alle Summen und Läufe stimmen. Stark gespielt!',
    },
    minesweeper: {
      flagModeTitle: 'Flaggen-Modus',
      lost: '💥 Verloren — versuch es nochmal!',
      success: 'Alle Felder ohne Mine sind aufgedeckt. Stark gespielt!',
      discardConfirm: 'Das begonnene Spiel verwerfen und neu starten?',
      difficulties: {
        beginner: { label: 'Anfänger', desc: '9×9, 10 Minen' },
        intermediate: { label: 'Fortgeschritten', desc: '16×16, 40 Minen' },
        expert: { label: 'Experte', desc: '30×16, 99 Minen' },
        custom: { label: 'Benutzerdefiniert', desc: 'Eigene Werte festlegen' },
      },
      customPanel: {
        width: 'Breite',
        height: 'Höhe',
        mines: 'Minen',
        hint: 'Werte werden automatisch auf ein spielbares Maß begrenzt.',
        start: 'Starten',
      },
    },
    futoshiki: {
      levels: {
        1: { desc: '5×5, viele Vorgaben' },
        2: { desc: '6×6' },
        3: { desc: '7×7' },
        4: { desc: '8×8' },
        5: { desc: '9×9, dafür mehr Ungleichungen statt Vorgaben' },
      },
      success: 'Alle Zahlen und Ungleichungen stimmen. Stark gespielt!',
    },
    killerSudoku: {
      styleToggle: 'Stil',
      levels: {
        1: { desc: 'Kleine Käfige, 6 Vorgaben' },
        2: { desc: 'Käfige bis 3 Felder, 4 Vorgaben' },
        3: { desc: 'Käfige bis 4 Felder, 1 Vorgabe' },
        4: { desc: 'Größere Käfige, keine Vorgaben' },
        5: { desc: 'Käfige bis 5 Felder, keine Vorgaben' },
      },
      success: 'Alle Käfige und Zahlen stimmen. Stark gespielt!',
    },
    thermoSudoku: {
      levels: {
        1: { desc: '3–5 Thermometer, keine Kreuzungen, 35–40 Vorgaben' },
        2: { desc: '5–7 Thermometer, einzelne Kreuzungen, 28–35 Vorgaben' },
        3: { desc: '7–10 Thermometer, mehrere Kreuzungen, 22–28 Vorgaben' },
        4: { desc: '10–13 Thermometer, lange Ketten (bis 8 Felder), 18–22 Vorgaben' },
        5: { desc: 'Viele Thermometer, mehrfache Kreuzungen, 15–20 Vorgaben' },
      },
      success: 'Alle Thermometer und Zahlen stimmen. Stark gespielt!',
    },
  },
};
