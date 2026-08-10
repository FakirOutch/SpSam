/* ============================================================
   ZUSTAND & SPEICHERUNG
   localStorage steht hier stellvertretend für die spätere
   native Speicherung (z.B. @capacitor/preferences).
   ============================================================ */
const STORAGE_KEY = 'spielesammlung_state_v1';

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  let parsed = null;
  if(raw){ try{ parsed = JSON.parse(raw); }catch(e){} }
  // Object.assign sorgt dafür, dass auch bei älteren gespeicherten Ständen
  // (ohne die neueren Felder) sinnvolle Defaults ergänzt werden.
  const loaded = Object.assign({
    profileName: null,
    lastOpenedGame: null,
    stats: {},       // { gameId: { played:0, won:0 } }
    favorites: [],   // Liste der Spiel-IDs, die der Anwender als Favorit markiert hat
    viewMode: 'list', // 'list' oder 'grid' — Ansicht der Spielesammlung
    language: 'de',  // Platzhalter für spätere Sprachauswahl
    hints: {},       // { gameId: { date:'JJJJ-MM-TT', used:0 } } — max. 3 Tipps je Spiel und Tag
    // Regler-Einstellungen (Fokus/Stil/Eingabe) je Spiel getrennt gespeichert,
    // bleiben über Sitzungen und Spielwechsel hinweg erhalten, bis der
    // Anwender sie selbst wieder ändert.
    togglePrefs: {}, // { [gameId]: { highlight:bool, cageStyle:'fill'|'lines', inputMode:'popup'|'direct' } }
  }, parsed || {});
  // Versionsnummern allein schützen nicht vor unvollständigen oder manuell
  // beschädigten Daten. Globale Sammlungswerte deshalb defensiv normalisieren.
  if(!Array.isArray(loaded.favorites)) loaded.favorites = [];
  if(!loaded.stats || typeof loaded.stats !== 'object' || Array.isArray(loaded.stats)) loaded.stats = {};
  if(!loaded.hints || typeof loaded.hints !== 'object' || Array.isArray(loaded.hints)) loaded.hints = {};
  if(!loaded.togglePrefs || typeof loaded.togglePrefs !== 'object' || Array.isArray(loaded.togglePrefs)) loaded.togglePrefs = {};
  if(!['list','grid'].includes(loaded.viewMode)) loaded.viewMode = 'list';
  return loaded;
}
function getTogglePref(gameId, key, fallback){
  const rec = state.togglePrefs[gameId];
  return (rec && rec[key] !== undefined) ? rec[key] : fallback;
}
function setTogglePref(gameId, key, value){
  if(!state.togglePrefs[gameId]) state.togglePrefs[gameId] = {};
  state.togglePrefs[gameId][key] = value;
  saveState();
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

let state = loadState();

// Simulierter Geräte-/Kaufstatus (nicht dauerhaft gespeichert, nur für die Demo)
let sim = { online: true, purchased: false };

/* ============================================================
   I18N — Bootstrap, siehe core/i18n.js. Klassisches Script (kein
   type="module"), daher dynamischer import() statt statischem import.
   ============================================================ */
let i18n = null;
const GAME_TITLE_KEYS = {
  sudoku: 'games.sudoku.title',
  hashi: 'games.hashi.title',
  minesweeper: 'games.minesweeper.title',
  kakuro: 'games.kakuro.title',
  futoshiki: 'games.futoshiki.title',
  'killer-sudoku': 'games.killerSudoku.title',
  'thermo-sudoku': 'games.thermoSudoku.title',
  memory: 'games.memory.title',
};
function gameTitle(gameId){ return i18n.t(GAME_TITLE_KEYS[gameId] || gameId); }

async function bootI18n(){
  i18n = await import('./core/i18n.js');
  await i18n.init();
  i18n.applyTranslations(document);
  syncLangPanelUI();
  i18n.onLocaleChange(() => {
    i18n.applyTranslations(document);
    syncLangPanelUI();
    if(state.profileName){ renderGreeting(); renderHomeContent(); }
    if(activeGameId && !screens.levels.classList.contains('hidden')){
      document.getElementById('levels-title').textContent = gameTitle(activeGameId);
    }
  });
}

/* ============================================================
   SPIELE-KATALOG — hier künftig weitere Spiele eintragen.
   Jede Kachel auf dem Startbildschirm entsteht automatisch
   aus dieser Liste. "addedOrder" bestimmt, welches verfügbare
   Spiel aktuell als "neu" markiert wird (immer nur das mit dem
   höchsten Wert) — beim Hinzufügen eines weiteren Spiels einfach
   eine höhere Zahl vergeben, das "neu"-Icon wandert automatisch.
   Anzeigename kommt über GAME_TITLE_KEYS/gameTitle() aus der
   aktiven Locale, nicht mehr als hart codierter "name"-String.
   ============================================================ */
const GAMES = [
  { id:'sudoku', icon:'🔢', available:true, addedOrder:1 },
  { id:'hashi', icon:'🌉', available:true, addedOrder:2 },
  { id:'minesweeper', icon:'💣', available:true, addedOrder:3 },
  { id:'kakuro', icon:'🧮', available:true, addedOrder:5 },
  { id:'futoshiki', icon:'⚖️', available:true, addedOrder:6 },
  { id:'killer-sudoku', icon:'🔪', available:true, addedOrder:7 },
  { id:'thermo-sudoku', icon:'🌡️', available:true, addedOrder:9 },
  { id:'memory', icon:'🧠', available:false, testOnly:true, addedOrder:8 },
];

/* ============================================================
   NAVIGATION
   ============================================================ */
const screens = {
  profile: document.getElementById('screen-profile'),
  home: document.getElementById('screen-home'),
  levels: document.getElementById('screen-levels'),
  moduleGame: document.getElementById('screen-module-game'),
  testSurface: document.getElementById('screen-test-surface'),
  profileSettings: document.getElementById('screen-profile-settings'),
};
function showScreen(name){
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
  updateAdBanner();
}

/* ============================================================
   MODUL-LOADER — zunächst nur Sudoku als realer Referenz-Spike.
   Weitere Spiele bleiben unverändert in dieser Datei, bis sich die
   Schnittstelle im praktischen Betrieb bewährt hat.
   ============================================================ */
let activeModule = null;
let activeModuleRegistration = null;

function showModuleLoading(text){
  const overlay = document.getElementById('module-loading');
  overlay.querySelector('[data-role="loading-text"]').textContent = text || i18n.t('loading.generating');
  overlay.classList.remove('hidden');
}
function hideModuleLoading(){
  document.getElementById('module-loading').classList.add('hidden');
}

function createModuleContext(gameId, goToLevels){
  return {
    starsFor,
    preferences: {
      get: (key, fallback) => getTogglePref(gameId, key, fallback),
      set: (key, value) => setTogglePref(gameId, key, value),
    },
    stats: { bump: bumpStat },
    hints: {
      remaining: getHintsRemaining,
      consume: consumeHint,
    },
    showSuccess: text => {
      document.getElementById('success-text').textContent = text;
      document.getElementById('success-overlay').classList.remove('hidden');
    },
    loading: {
      show: showModuleLoading,
      hide: hideModuleLoading,
    },
    goToLevels,
  };
}

async function loadModule(gameId){
  if(activeModule && activeModule.id === gameId) return activeModule;
  const registry = await import('./core/game-registry.js');
  const registration = registry.getGameRegistration(gameId);
  if(!registration) throw new Error(gameId + ' ist nicht in der Spiele-Registry eingetragen.');
  const imported = await registration.load();
  const { checkModuleConformance } = await import('./core/game-module-contract.js');
  const conformance = checkModuleConformance(imported.default, registration);
  if(!conformance.ok){
    throw new Error(
      'Modul "' + gameId + '" erfüllt die Modul-API v1 nicht:\n- ' + conformance.errors.join('\n- ')
    );
  }
  activeModuleRegistration = registration;
  activeModule = imported.default;
  return activeModule;
}

async function showModuleLevels(gameId){
  const title = gameTitle(gameId);
  try{
    if(activeModule) await activeModule.unmount();
    hideModuleLoading(); // defensiv, falls ein Modul beim Verlassen mitten in einer Generierung war
    const module = await loadModule(gameId);
    activeGameId = gameId;
    document.getElementById('levels-title').textContent = title;
      const goToLevels = () => showModuleLevels(gameId);
    module.renderLevelsList(document.getElementById('levels-list'), {
      start: async level => {
        await module.mount(document.getElementById('game-container'), createModuleContext(gameId, goToLevels));
        showScreen('moduleGame');
        await module.start(level);
      },
      continue: async savedState => {
        await module.mount(document.getElementById('game-container'), createModuleContext(gameId, goToLevels));
        showScreen('moduleGame');
        if(!await module.restore(savedState)) await showModuleLevels(gameId);
      },
    });
    showScreen('levels');
  }catch(error){
    console.error(gameId + '-Modul konnte nicht geladen werden:', error);
    document.getElementById('levels-title').textContent = title;
    document.getElementById('levels-list').innerHTML = '<p class="module-error">' + i18n.t('levels.loadError', { title }) + '</p>';
    showScreen('levels');
  }
}

/* ============================================================
   PROFIL
   ============================================================ */
document.getElementById('btn-create-profile').addEventListener('click', () => {
  const val = document.getElementById('profile-name-input').value.trim();
  if(!val) return;
  state.profileName = val;
  saveState();
  const checkedLang = document.querySelector('input[name="onboarding-lang"]:checked');
  if(checkedLang) i18n.setLocale(checkedLang.value);
  enterHome();
});

function enterHome(){
  renderGreeting();
  renderHomeContent();
  showScreen('home');
}

// Baut die Begrüßung aus dem übersetzten Muster "Hallo, {name}" auf, OHNE
// den Namen selbst zu interpolieren — das {name}-Token bleibt dabei
// wörtlich stehen (t() ohne vars) und wird anschließend manuell durch
// einen eigenen <span id="home-username"> ersetzt. So bleibt exakt die
// bisherige DOM-Struktur erhalten (style.css färbt gezielt NUR den
// Namens-Span über ".greeting span" — eine reine Text-Interpolation
// hätte "Hallo, " fälschlich mitgefärbt, siehe Analyse vor der Umsetzung).
function renderGreeting(){
  const raw = i18n.t('home.greeting');
  const [prefix, suffix] = raw.split('{name}');
  const container = document.querySelector('.greeting');
  container.innerHTML = '';
  container.appendChild(document.createTextNode(prefix));
  const nameSpan = document.createElement('span');
  nameSpan.id = 'home-username';
  nameSpan.textContent = state.profileName;
  container.appendChild(nameSpan);
  container.appendChild(document.createTextNode((suffix || '') + ' 👋'));
}

/* ============================================================
   PROFIL-EINSTELLUNGEN (Backlog Punkt 8) — Name UND Sprache an
   einer Stelle bearbeitbar, Sprachfeld direkt unterhalb des
   Namensfelds. Nutzt fürs Speichern der Sprache dieselbe
   i18n.setLocale()-Funktion wie das bestehende Sprachpanel — es
   gibt nur eine Quelle der Wahrheit für die aktive Sprache.
   ============================================================ */
document.getElementById('btn-profile-settings').addEventListener('click', () => {
  closeAllPanels();
  document.getElementById('profile-settings-name').value = state.profileName || '';
  const radio = document.getElementById('profile-settings-lang-' + i18n.getLocale());
  if(radio) radio.checked = true;
  showScreen('profileSettings');
});
document.getElementById('btn-profile-settings-back').addEventListener('click', enterHome);
document.getElementById('btn-profile-settings-save').addEventListener('click', () => {
  const val = document.getElementById('profile-settings-name').value.trim();
  if(val) state.profileName = val;
  saveState();
  const checkedLang = document.querySelector('input[name="profile-settings-lang"]:checked');
  if(checkedLang) i18n.setLocale(checkedLang.value);
  enterHome();
});

/* ============================================================
   STARTBILDSCHIRM / SPIELESAMMLUNG
   ============================================================ */
function getStats(gameId){
  return state.stats[gameId] || { played:0, won:0 };
}
function bumpStat(gameId, key){
  if(!state.stats[gameId]) state.stats[gameId] = { played:0, won:0 };
  state.stats[gameId][key]++;
  saveState();
}

/* ============================================================
   TIPP-SYSTEM: max. 3 Tipps je Spiel (nicht je Level, sondern je
   Spiel-Kategorie wie 'sudoku' oder 'hashi') und Tag. Der Zähler
   setzt sich beim ersten Tipp eines neuen Kalendertags automatisch
   zurück (lokales Gerätedatum).
   ============================================================ */
// Reguläre Tipp-Begrenzung: 3 je Spiel-Kategorie und Kalendertag.
const MAX_HINTS_PER_DAY = 3;
function todayKey(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function getHintsRemaining(gameId){
  if(MAX_HINTS_PER_DAY === Infinity) return Infinity;
  const rec = state.hints[gameId];
  if(!rec || rec.date !== todayKey()) return MAX_HINTS_PER_DAY;
  return Math.max(0, MAX_HINTS_PER_DAY - rec.used);
}
function consumeHint(gameId){
  const today = todayKey();
  if(!state.hints[gameId] || state.hints[gameId].date !== today){
    state.hints[gameId] = { date: today, used: 0 };
  }
  if(MAX_HINTS_PER_DAY !== Infinity && state.hints[gameId].used >= MAX_HINTS_PER_DAY) return false;
  state.hints[gameId].used++;
  saveState();
  return true;
}
function refreshHintButton(btnId, spanId, gameId){
  const remaining = getHintsRemaining(gameId);
  const btn = document.getElementById(btnId);
  const span = document.getElementById(spanId);
  if(span) span.textContent = remaining === Infinity ? '∞' : remaining;
  if(btn) btn.disabled = remaining <= 0;
}
function resetRevealLink(id){
  const el = document.getElementById(id);
  if(el){ el.textContent = 'Lösung anzeigen (zählt nicht als gelöst)'; el.disabled = false; }
}

/* ============================================================
   ALLGEMEINER RÄTSEL-TIMER — läuft ab dem Start eines Rätsels bei
   Sudoku/Killer Sudoku, Hashi, Futoshiki und Kakuro. Minesweeper hat
   bewusst weiterhin seinen eigenen, unabhängigen Timer (mine-timer).
   Erwartet ein Zustandsobjekt mit den Feldern startTime/timerInterval,
   das schon existiert (game/hashi/futo/kakuro) — es wird nur ergänzt.
   ============================================================ */
// Zeigt die Schwierigkeit als Sterne statt als Text: gewählte Stufe als
// gefüllte Sterne, Rest bis zum Maximum als Umriss-Sterne (z.B. Stufe 2 von
// 5 -> "★★☆☆☆").
function starsFor(id, max = 5){
  return '★'.repeat(id) + '☆'.repeat(Math.max(0, max - id));
}
function formatPuzzleTimer(totalSeconds){
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}
function startPuzzleTimer(stateObj, displayId){
  stateObj.startTime = Date.now();
  const el = document.getElementById(displayId);
  if(el) el.textContent = '00:00';
  stateObj.timerInterval = setInterval(() => {
    stateObj.elapsedSeconds = Math.floor((Date.now() - stateObj.startTime) / 1000);
    if(el) el.textContent = formatPuzzleTimer(stateObj.elapsedSeconds);
  }, 1000);
}
function stopPuzzleTimer(stateObj){
  if(stateObj && stateObj.timerInterval){
    clearInterval(stateObj.timerInterval);
    stateObj.timerInterval = null;
  }
}

// Ermittelt die ID des aktuell "neuesten" verfügbaren Spiels (höchster
// addedOrder-Wert). Nur DIESES eine Spiel trägt das "neu"-Icon — sobald ein
// weiteres Spiel mit höherem addedOrder hinzukommt, wandert das Icon
// automatisch dorthin.
function getNewestAvailableId(){
  const avail = GAMES.filter(g => g.available);
  if(!avail.length) return null;
  return avail.reduce((best, g) => (!best || g.addedOrder > best.addedOrder) ? g : best, null).id;
}

// Sortierreihenfolge für verfügbare Spiele:
// a) Favoriten zuerst, b) danach das neueste Spiel (falls nicht bereits
// Favorit), c) danach der Rest. Innerhalb jeder Gruppe alphabetisch.
function getSortedAvailableGames(){
  const avail = GAMES.filter(g => g.available);
  const newestId = getNewestAvailableId();
  const byName = (a,b) => gameTitle(a.id).localeCompare(gameTitle(b.id), i18n.getLocale());
  const favs = avail.filter(g => state.favorites.includes(g.id)).sort(byName);
  const rest = avail.filter(g => !state.favorites.includes(g.id));
  const newest = rest.filter(g => g.id === newestId);
  const others = rest.filter(g => g.id !== newestId).sort(byName);
  return [...favs, ...newest, ...others];
}
function getOrderedGames(){
  const soon = GAMES.filter(g => !g.available);
  return [...getSortedAvailableGames(), ...soon];
}

function toggleFavorite(gameId){
  const idx = state.favorites.indexOf(gameId);
  if(idx >= 0) state.favorites.splice(idx, 1);
  else state.favorites.push(gameId);
  saveState();
  renderHomeContent();
}

/* ---------- Ansichtsauswahl: Liste oder 3x3-Raster ---------- */
let iconGridPage = 0;

function setViewMode(mode){
  state.viewMode = mode;
  saveState();
  renderHomeContent();
}

function renderHomeContent(){
  const isGrid = state.viewMode === 'grid';
  document.getElementById('game-grid').classList.toggle('hidden', isGrid);
  document.getElementById('game-icongrid').classList.toggle('hidden', !isGrid);
  document.getElementById('btn-view-list').classList.toggle('active', !isGrid);
  document.getElementById('btn-view-grid').classList.toggle('active', isGrid);
  if(isGrid) renderGameIconGrid();
  else renderGameListView();
}

function renderGameListView(){
  const grid = document.getElementById('game-grid');
  grid.innerHTML = '';
  const newestId = getNewestAvailableId();
  getOrderedGames().forEach(g => {
    const card = document.createElement('div');
    card.className = 'game-card';

    if(g.testOnly){
      card.classList.add('soon');
      card.innerHTML = `
        <div class="icon">${g.icon}</div>
        <div class="info">
          <h3>${gameTitle(g.id)} <span class="badge-test">${i18n.t('home.badgeTest')}</span></h3>
          <div class="stats">${i18n.t('home.inDevelopment')}</div>
        </div>`;
      card.addEventListener('click', () => openTestSurface());
      grid.appendChild(card);
      return;
    }

    if(!g.available){
      card.classList.add('soon');
      card.innerHTML = `
        <div class="icon">${g.icon}</div>
        <div class="info">
          <h3>${gameTitle(g.id)} <span class="badge-soon">${i18n.t('home.badgeSoon')}</span></h3>
          <div class="stats">${i18n.t('home.inDevelopment')}</div>
        </div>`;
      grid.appendChild(card);
      return;
    }

    card.classList.add('favable');
    // Sperrlogik: Gratis + offline + nicht das zuletzt geöffnete Spiel -> gesperrt
    const locked = !sim.purchased && !sim.online && state.lastOpenedGame !== g.id;
    if(locked) card.classList.add('locked');

    const isFav = state.favorites.includes(g.id);
    const st = getStats(g.id);
    card.innerHTML = `
      <div class="icon">${g.icon}</div>
      <div class="info">
        <h3>${gameTitle(g.id)}${g.id === newestId ? ' <span class="badge-new">' + i18n.t('home.badgeNew') + '</span>' : ''}</h3>
        <div class="stats">
          <span>🎮 ${i18n.t('home.played')}: ${st.played}</span>
          <span>🏆 ${i18n.t('home.won')}: ${st.won}</span>
        </div>
      </div>
      <button class="fav-btn ${isFav ? 'active' : ''}" aria-label="${i18n.t('common.favorite')}">${isFav ? '★' : '☆'}</button>`;
    if(!locked){
      card.addEventListener('click', () => openGame(g.id));
    }
    card.querySelector('.fav-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(g.id);
    });
    grid.appendChild(card);
  });
}

function renderGameIconGrid(){
  const page = document.getElementById('icongrid-page');
  const dotsWrap = document.getElementById('icongrid-dots');
  const nav = document.getElementById('icongrid-nav');
  page.innerHTML = '';
  dotsWrap.innerHTML = '';

  const newestId = getNewestAvailableId();
  const all = getOrderedGames();
  const perPage = 9; // 3x3 wie bei einem Handy-Startbildschirm
  const totalPages = Math.max(1, Math.ceil(all.length / perPage));
  if(iconGridPage >= totalPages) iconGridPage = totalPages - 1;
  const pageItems = all.slice(iconGridPage * perPage, iconGridPage * perPage + perPage);

  pageItems.forEach(g => {
    const tile = document.createElement('div');
    tile.className = 'icongrid-tile';
    if(g.testOnly){
      tile.classList.add('soon');
      tile.innerHTML = `
        <div class="icon">${g.icon}</div>
        <div class="label">${gameTitle(g.id)}</div>
        <span class="badge-test" style="position:absolute; top:6px; right:6px;">${i18n.t('home.badgeTest')}</span>
      `;
      tile.addEventListener('click', () => openTestSurface());
      page.appendChild(tile);
      return;
    }
    if(!g.available) tile.classList.add('soon');
    const locked = g.available && !sim.purchased && !sim.online && state.lastOpenedGame !== g.id;
    if(locked) tile.classList.add('locked');
    const isFav = g.available && state.favorites.includes(g.id);

    tile.innerHTML = `
      ${g.available && g.id === newestId ? '<span class="icongrid-badge-new">' + i18n.t('home.badgeNew') + '</span>' : ''}
      <div class="icon">${g.icon}</div>
      <div class="label">${gameTitle(g.id)}</div>
      ${g.available ? `<button class="icongrid-fav ${isFav ? 'active' : ''}" aria-label="${i18n.t('common.favorite')}">${isFav ? '★' : '☆'}</button>` : ''}
    `;

    if(g.available && !locked){
      tile.addEventListener('click', (e) => {
        if(e.target.closest('.icongrid-fav')) return;
        openGame(g.id);
      });
    }
    const favBtn = tile.querySelector('.icongrid-fav');
    if(favBtn){
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(g.id);
      });
    }
    page.appendChild(tile);
  });

  for(let p = 0; p < totalPages; p++){
    const dot = document.createElement('span');
    if(p === iconGridPage) dot.classList.add('active');
    dotsWrap.appendChild(dot);
  }
  nav.classList.toggle('single-page', totalPages <= 1);
  document.getElementById('btn-icongrid-prev').disabled = iconGridPage === 0;
  document.getElementById('btn-icongrid-next').disabled = iconGridPage >= totalPages - 1;
}

document.getElementById('btn-view-list').addEventListener('click', () => setViewMode('list'));
document.getElementById('btn-view-grid').addEventListener('click', () => setViewMode('grid'));
document.getElementById('btn-icongrid-prev').addEventListener('click', () => {
  iconGridPage = Math.max(0, iconGridPage - 1);
  renderGameIconGrid();
});
document.getElementById('btn-icongrid-next').addEventListener('click', () => {
  iconGridPage++;
  renderGameIconGrid();
});

const LOADABLE_GAME_IDS = new Set(['sudoku', 'hashi', 'kakuro', 'minesweeper', 'futoshiki', 'killer-sudoku', 'thermo-sudoku']);
async function openGame(gameId){
  closeAllPanels(); // Rätselauswahl schließt ein eventuell offenes Sprache-/Eigenschaften-Panel
  state.lastOpenedGame = gameId;
  saveState();
  if(LOADABLE_GAME_IDS.has(gameId)) await showModuleLevels(gameId);
}

/* ============================================================
   TESTFLÄCHE (Backlog Punkt 7) — erreichbar über die "Memory"-
   Platzhalterkachel. Kein echtes Spielmodul: kein mount()/unmount(),
   keine Registry, kein Generator, keine Speicherstände. Baut das leere
   9×9-Raster einmalig; die drei Regler sind rein visuell (keine
   Speicherung, keine echte Wirkung auf ein Rätsel).
   ============================================================ */
let testSurfaceBuilt = false;
function openTestSurface(){
  closeAllPanels();
  if(!testSurfaceBuilt){
    const grid = document.getElementById('test-surface-grid');
    for(let i = 0; i < 81; i++){
      const cell = document.createElement('div');
      cell.className = 'cell';
      grid.appendChild(cell);
    }
    testSurfaceBuilt = true;
  }
  showScreen('testSurface');
}
document.getElementById('btn-test-surface-back').addEventListener('click', enterHome);

let activeGameId = 'sudoku'; // merkt sich, welches Spiel gerade die Levelauswahl/den Zurück-Pfeil benutzt

document.getElementById('btn-levels-back').addEventListener('click', () => {
  renderHomeContent();
  showScreen('home');
});
/* ============================================================
   DEV-PANEL: simuliert Online/Offline & Kaufstatus
   ============================================================ */
const devPanel = document.getElementById('dev-panel');
const langPanel = document.getElementById('lang-panel');

// Gemeinsame Schließ-/Öffnen-Steuerung für beide Panels ("Eigenschaften" und
// "Sprache"). Regeln (siehe Absprache): Antippen desselben Icons schließt,
// Antippen außerhalb schließt, Öffnen des einen schließt das andere, eine
// Rätselauswahl schließt beide, und die Zurück-Taste des Handys schließt
// zuerst ein offenes Panel, statt sofort die Seite zu verlassen.
let panelHistoryPushed = false; // true, solange wegen eines offenen Panels ein zusätzlicher History-Eintrag existiert

function anyPanelOpen(){
  return !devPanel.classList.contains('hidden') || !langPanel.classList.contains('hidden');
}

function closeAllPanels(){
  const wasOpen = anyPanelOpen();
  devPanel.classList.add('hidden');
  langPanel.classList.add('hidden');
  if(wasOpen && panelHistoryPushed){
    panelHistoryPushed = false;
    history.back(); // entfernt den beim Öffnen angelegten History-Eintrag wieder, löst KEINE echte Navigation aus
  }
}

function togglePanel(panel){
  const otherPanel = panel === devPanel ? langPanel : devPanel;
  const isCurrentlyOpen = !panel.classList.contains('hidden');
  otherPanel.classList.add('hidden'); // das jeweils andere Panel schließt immer mit
  if(isCurrentlyOpen){
    closeAllPanels(); // Icon erneut angetippt -> schließen (inkl. History-Aufräumen)
    return;
  }
  panel.classList.remove('hidden');
  if(!panelHistoryPushed){
    history.pushState({ arkimisPanel: true }, '');
    panelHistoryPushed = true;
  }
}

// Zurück-Taste des Handys (bzw. Browser-Zurück): wenn ein Panel offen war,
// hat der Browser den zusätzlichen History-Eintrag bereits selbst entfernt —
// hier nur noch die Panels optisch schließen, OHNE erneut history.back()
// aufzurufen (das würde sonst eine echte Seiten-Navigation auslösen).
window.addEventListener('popstate', () => {
  if(anyPanelOpen()){
    devPanel.classList.add('hidden');
    langPanel.classList.add('hidden');
    panelHistoryPushed = false;
  }
});

// Antippen außerhalb eines offenen Panels (und außerhalb seines eigenen
// Auslöse-Icons) schließt es.
document.addEventListener('click', event => {
  if(!anyPanelOpen()) return;
  const insideDev = devPanel.contains(event.target) || event.target.closest('#btn-dev-panel');
  const insideLang = langPanel.contains(event.target) || event.target.closest('#btn-lang-panel');
  if(!insideDev && !insideLang) closeAllPanels();
});

document.getElementById('btn-dev-panel').addEventListener('click', () => togglePanel(devPanel));
document.getElementById('toggle-online').addEventListener('change', e => {
  sim.online = e.target.checked;
  renderHomeContent();
  updateAdBanner();
});
document.getElementById('toggle-purchased').addEventListener('change', e => {
  sim.purchased = e.target.checked;
  renderHomeContent();
  updateAdBanner();
});

/* ============================================================
   SPRACHPANEL — steuert core/i18n.js. Aktuell nur Deutsch über die UI
   wählbar (Radio "en" bleibt in index.html bewusst disabled, siehe
   Phase-1-Abgrenzung); die Infrastruktur (setLocale/onLocaleChange)
   ist bereits vollständig funktionsfähig und unabhängig testbar.
   ============================================================ */
document.getElementById('btn-lang-panel').addEventListener('click', () => togglePanel(langPanel));
document.getElementById('lang-de').addEventListener('change', e => {
  if(e.target.checked) i18n.setLocale('de');
});
function syncLangPanelUI(){
  const radio = document.getElementById('lang-' + i18n.getLocale());
  if(radio) radio.checked = true;
}

/* ============================================================
   WERBEBANNER
   Regeneriert den Inhalt alle 60 Sekunden (Platzhalter-Rotation).
   Nur sichtbar in der Gratisversion.
   ============================================================ */
const AD_SAMPLES = [
  '🍩 Bäckerei um die Ecke — jetzt Angebote entdecken',
  '🚗 Fahrservice XY — deine erste Fahrt gratis',
  '🎧 Musik-Streaming — 30 Tage kostenlos testen',
  '📚 Lern-App — neue Sprache in 15 Min/Tag',
];
let adIndex = 0;
function rotateAd(){
  adIndex = (adIndex + 1) % AD_SAMPLES.length;
  document.getElementById('ad-content').innerHTML = AD_SAMPLES[adIndex];
}
setInterval(rotateAd, 60000); // alle 1 Minute neu generieren

function updateAdBanner(){
  const banner = document.getElementById('ad-banner');
  const showAd = !sim.purchased;
  banner.classList.toggle('hidden', !showAd);
  document.getElementById('view-toggle').classList.toggle('lifted', showAd);
}

document.getElementById('btn-success-next').addEventListener('click', () => {
  document.getElementById('success-overlay').classList.add('hidden');
  if(activeGameId && activeModule){
    const level = activeModule.getCurrentLevel();
    if(level) activeModule.start(level);
  }
});
document.getElementById('btn-success-levels').addEventListener('click', () => {
  document.getElementById('success-overlay').classList.add('hidden');
  if(activeGameId && activeModule){
    showModuleLevels(activeGameId);
    return;
  }
  showScreen('levels');
});
/* ============================================================
   START
   ============================================================ */
(async () => {
  await bootI18n();
  if(state.profileName){
    enterHome();
  } else {
    showScreen('profile');
  }
})();
