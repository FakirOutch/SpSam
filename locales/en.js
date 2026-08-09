/**
 * English — Phase 1 placeholder, NOT a complete translation yet.
 *
 * Purpose right now: validate that the i18n architecture (key lookup,
 * fallback to "de", missing-key detection) works end-to-end with a real
 * second locale file, not just with "de" as both active and fallback.
 * The English radio button in the language panel stays disabled in the
 * UI during Phase 1 (see index.html) — this file is not user-reachable
 * yet, only exercised by scripts/check-i18n-keys.mjs and by developers
 * calling setLocale('en') directly for testing.
 *
 * Deliberately complete: the app-shell/common layer (short, unambiguous
 * UI chrome) — enough to prove the module-consumption pattern works.
 * Deliberately incomplete: most per-game level descriptions and rule
 * texts (game.*) — left for scripts/check-i18n-keys.mjs to report as
 * missing, demonstrating that the app keeps working correctly by falling
 * back to German for exactly those keys. Phase 2 fills in the rest as a
 * proper, natural (not mechanical word-for-word) translation.
 */
export default {
  app: {
    title: 'My Game Collection',
  },

  common: {
    back: 'Back',
    newPuzzle: 'New puzzle',
    newGameLabel: 'New game',
    check: 'Check',
    hintsSuffix: 'hints',
    hintsInfinite: '∞',
    reveal: 'Show solution (does not count as solved)',
    revealed: 'Solution shown — does not count as solved',
    clearField: 'Clear field',
    deleteNumber: 'Delete number',
    continueGame: 'Continue',
    discardConfirmNamed: 'Discard the {game} in progress and choose a new game?',
    inputModeToggleTitle: 'Input: on = popup keypad, off = fixed number row below',
    toggleFocus: 'Focus',
    toggleInput: 'Input',
    favorite: 'Favorite',
    difficulty: {
      veryEasy: 'Very easy',
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
      expert: 'Expert',
    },
  },

  profile: {
    welcome: 'Welcome!',
    subtitle: 'Create your profile to start playing.',
    namePlaceholder: 'Your name',
    start: 'Let\u2019s go',
  },

  home: {
    greeting: 'Hi, {name}',
    langPanelIcon: 'Language',
    devPanelIcon: 'Properties',
    collectionTitle: 'Your game collection',
    listView: 'List view',
    gridView: 'Grid view',
    played: 'Played',
    won: 'Won',
    inDevelopment: 'In development',
    badgeSoon: 'soon',
    badgeNew: 'new',
  },

  panel: {
    lang: {
      title: 'Language',
      german: 'Deutsch',
      english: 'English',
      moreComingSoon: 'More languages coming in a later version.',
    },
    dev: {
      title: 'Properties',
      online: 'Online',
      purchased: 'App purchased',
      note: 'Replaced in the real app by a network plugin & purchase/license status.',
    },
  },

  levels: {
    tutorial: 'Tutorial',
    tutorialComingSoon: 'Coming later',
    loadError: '{title} could not be loaded. Please restart the app.',
  },

  loading: {
    generating: 'Generating puzzle …',
  },

  success: {
    title: 'Solved!',
    defaultText: 'All numbers are correct. Well played!',
    next: 'Next',
    otherLevel: 'Change level',
  },

  ads: {
    tag: 'AD',
    placeholderLabel: 'Advertisement',
    placeholderSuffix: 'placeholder content',
    cta: 'More',
  },

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

  // game.*: intentionally left mostly untranslated in Phase 1 (see file
  // header). Only Sudoku is filled in completely, as a worked example
  // that exercises every key shape used across all seven modules
  // (levels.<n>.desc, hintText, success, and — for modules structured
  // like Minesweeper — difficulties/customPanel). The other six modules
  // fall back to German for their game.* text until Phase 2.
  game: {
    sudoku: {
      levels: {
        1: { desc: 'Ideal for beginners, small puzzles' },
        2: { desc: 'Casually challenging' },
        3: { desc: 'Medium difficulty' },
        4: { desc: 'For experienced players' },
        5: { desc: 'A real brain-teaser' },
      },
      success: 'All numbers are correct. Well played!',
    },
  },
};
