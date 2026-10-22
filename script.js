"use strict";
/* =====================================================================
   Campus Quest - NDMU          (how this file is organised)

    1. CONFIGURATION       campus box, constants, map-tile sources
    2. DATA                places, history stories, events, quests
    3. ICONS               tiny inline SVG icons
    4. STATE & STORAGE     the one `state` object, localStorage, small helpers
    5. QUEST ENGINE        arrive -> stay (timer) -> 1 photo -> complete
    6. MAP & GEOLOCATION   Leaflet map, tiles, pins, GPS
    7. UI HELPERS          toast, banner, status pill
    8. RENDERING           draw the screen from `state`
    9. SHEETS, THEME, DEMO open/close pop-ups, dark mode, demo mode
   10. EVENT HANDLERS      every click/typing listener, attached once
   11. INITIALISATION      what runs when the page loads

   EXTERNAL SERVICES USED (none needs a secret key):
   - Leaflet 1.9.4 (map library, loaded in index.html)
   - Map tiles: OpenStreetMap or Esri (see TILE_SOURCES)
   - Browser APIs: Geolocation, File input (camera), Canvas, localStorage,
     Screen Wake Lock (optional)
   This file is ASCII-only on purpose (no encoding problems in VS Code).
   ===================================================================== */

/* ============================ 1. CONFIGURATION ============================ */
const CAMPUS = {
  name: "Notre Dame of Marbel University",
  center: [6.49571, 124.84114],
  // The part of the map shown on first load (all pins + a little margin)
  view: [[6.4939, 124.8390], [6.4975, 124.8432]],
  // The map cannot be panned/zoomed outside this box: campus only
  fence: [[6.4936, 124.8386], [6.4978, 124.8436]],
};
const LEVEL_XP = 100; // XP needed per level
const GRACE_MS = 10000; // how long you may step out before the timer resets
const DEMO_DWELL_SEC = 5; // dwell time used in demo mode
const DEFAULT_RADIUS = 25; // metres around a stop that counts as "here"
const KEYS = {
  progress: "campus-quest-v2",
  photos: "campus-quest-v2-photos",
  theme: "campus-quest-theme",
  demo: "campus-quest-demo",
  mapStyle: "campus-quest-map-style",
};

/* Keyless tile sources (CARTO now needs an API key).
   OSM standard tiles need a Referer, so they work when the site is served
   over http(s) (Netlify, GitHub Pages, Live Server) but not from file://.
   Esri World Street Map works without a key everywhere, so it is the
   fallback. If one source keeps failing, the app switches to the other. */
const TILE_SOURCES = {
  osm: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", native: 19,
    credit: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' },
  // Real aerial photos (keyless). Shown by default so visitors recognise buildings and paths.
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", native: 18, max: 19, // Esri has no photos above ~18 here ("map data not yet available"), so stop zooming one step later
    credit: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' },
  esri: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", native: 19,
    credit: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors' },
};

// Circumference of the timer ring in the SVG (2 * pi * radius 27).
const RING = 169.65;

/* ============================ 2. DATA ============================ */
// type: building | office | food | landmark
const PLACES = [
  { id: "gate", name: "Main Gate", type: "landmark", lat: 6.495612, lng: 124.839755, description: "Primary campus entrance and security checkpoint for visitors." },
  { id: "canteen", name: "Main Canteen", type: "food", lat: 6.495686, lng: 124.840345, description: "Meals, snacks, and merienda for students between classes." },
  { id: "chapel", name: "SMC Chapel", type: "building", lat: 6.495313, lng: 124.839655, description: "Campus chapel for Mass, recollection, and quiet prayer." },
  { id: "gym", name: "Gymnasium", type: "building", lat: 6.49493, lng: 124.842059, description: "Indoor court for PE classes, intramurals, and assemblies." },
  { id: "smc", name: "SMC", type: "building", lat: 6.495684, lng: 124.84197, description: "SMC building on campus." },
  { id: "teston", name: "Teston", type: "building", lat: 6.495495, lng: 124.841882, description: "Teston building on campus." },
  { id: "omer", name: "Omer", type: "building", lat: 6.495924, lng: 124.842367, description: "Omer building on campus." },
  { id: "brc", name: "BRC", type: "building", lat: 6.495455, lng: 124.840543, description: "BRC building on campus." },
  { id: "sucayan-gate", name: "Sucayan Gate", type: "landmark", lat: 6.494908, lng: 124.839723, description: "Campus entrance on the Sucayan side." },
  { id: "pantua-gate", name: "Pantua Gate", type: "landmark", lat: 6.494676, lng: 124.842622, description: "Campus entrance on the Pantua side." },
  { id: "gate2", name: "Gate 2", type: "landmark", lat: 6.496379, lng: 124.840334, description: "Secondary campus entrance." },
  { id: "creegan", name: "Creegan Hall", type: "building", lat: 6.494655, lng: 124.841407, description: "Creegan Hall classrooms and activity space." },
  { id: "doherty", name: "Doherty Hall", type: "building", lat: 6.496569, lng: 124.841005, description: "Doherty Hall classrooms and lecture rooms." },
  { id: "dumont", name: "Dumont Hall", type: "building", lat: 6.496406, lng: 124.841166, description: "Dumont Hall classrooms and lecture rooms." },
  { id: "athletics", name: "Athletics Court", type: "landmark", lat: 6.495476, lng: 124.842552, description: "Outdoor court for sports, practice, and student events." },
  { id: "alumni", name: "Alumni Relations Office", type: "office", lat: 6.494863, lng: 124.840251, description: "Alumni records, events, and graduate mentoring." },
  { id: "business-office", name: "Business Office", type: "office", lat: 6.495399, lng: 124.840474, description: "Payments, billing, and other business transactions." },
  { id: "clinic", name: "Clinic", type: "office", lat: 6.494818, lng: 124.841187, description: "Campus clinic for first aid and basic health assistance." },
  { id: "cbga", name: "CBGA Office", type: "office", lat: 6.496832, lng: 124.841509, description: "CBGA college office." },
  { id: "ceac", name: "CEAC Office", type: "office", lat: 6.495577, lng: 124.841965, description: "CEAC college office." },
  { id: "ced", name: "CED Office", type: "office", lat: 6.494485, lng: 124.840801, description: "CED college office." },
  { id: "cas", name: "CAS Office", type: "office", lat: 6.495596, lng: 124.840575, description: "CAS college office." },
  { id: "chs", name: "CHS Office", type: "office", lat: 6.495071, lng: 124.840254, description: "CHS college office." },
  { id: "doherty-canteen", name: "Doherty Canteen", type: "food", lat: 6.496936, lng: 124.841394, description: "Meals and snacks near Doherty Hall." },
  { id: "gym-canteen", name: "Gym Canteen", type: "food", lat: 6.494652, lng: 124.841847, description: "Quick meals and drinks near the Gymnasium." },
];

/* Campus stories ("brief history"). These are the texts shown while the
   timer runs and on the place detail sheet.
   VERIFIED from ndmu.edu.ph/our-history (and Wikipedia where noted):
   - started as a high school by the Oblates of Mary Immaculate with the RVM
     Sisters, first high school in the Koronadal Valley, South Cotabato
   - founding year: NDMU's own site says 1946 (Wikipedia says 1945)
   - 1950 Boys Dept -> Marist Brothers; 1955 College Department; 1992 university
   - motto "Ad Jesum Per Mariam"; colors gold and green
   - Doherty Hall 3rd floor renovated for Criminology labs (2010)
   - Creegan Hall 2nd floor -> College of Education Teaching-Learning Center
   - Bro. Renato Cruz Hall (2014-2015): Business Office, Guidance and
     Scholarship Center, University Museum, Convention Hall
   - Main gate and gymnasium renovated 2014-2015
   TO CONFIRM with your school (marked VERIFY): that "BRC" = Bro. Renato Cruz
   Hall, that "SMC" honors Saint Marcellin Champagnat, and any entry with no
   dated fact (those are written as plain descriptions on purpose).
   Edit freely - the app only reads this object. */
const HISTORY = {
  gate: "Every Marbelian story starts here. Notre Dame of Marbel began in 1946 as a high school run by the Oblates of Mary Immaculate together with the RVM Sisters - the first high school in South Cotabato's Koronadal Valley. This gate was renovated in 2014-2015.",
  chapel: "NDMU's motto is Ad Jesum Per Mariam - 'To Jesus through Mary' - and its colors are gold and green. The chapel is where that Marian heritage feels closest: a quiet place for Mass, recollection and prayer in the middle of a busy campus.",
  canteen: "Rest stop! While you refuel, here is a quick timeline: a high school in 1946, the Marist Brothers take over the boys' department in 1950, a College Department in 1955, and university status in 1992.",
  brc: "Bro. Renato Cruz Hall was developed in 2014-2015. It brings the Business Office, the Guidance and Scholarship Center, the University Museum and the Convention Hall under one roof. VERIFY: BRC = Bro. Renato Cruz Hall.",
  doherty: "In 2010 the third floor of Doherty Hall was renovated to house the Criminology laboratories - a sign of how the campus keeps growing together with its programs.",
  creegan: "In 2011-2012 the second floor of Creegan Hall became the College of Education's Teaching-Learning Center, where future teachers practice their craft.",
  smc: "The Marist Brothers took over the boys' department in 1950. The congregation was founded in 1817 by St. Marcellin Champagnat, whose name this hall is believed to honor. VERIFY the namesake.",
  gym: "The gymnasium was renovated in 2014-2015, together with the main gate. It hosts PE classes, assemblies and the intramurals - the loudest place on campus on game day.",
  teston: "Teston is one of the academic halls on campus that include science and computer laboratories.",
  omer: "Omer is one of the academic halls on campus that include science and computer laboratories.",
  dumont: "Dumont Hall sits in the northern part of campus, just beside Doherty Hall, and is home to lecture rooms.",
  athletics: "The open-air Athletics Court is where practice, sports days and student events spill outside the Gymnasium.",
  "sucayan-gate": "One of the side entrances to the campus. Besides the main gate, students and staff use side gates like this one every day.",
  "pantua-gate": "One of the side entrances to the campus, on the Pantua side.",
  gate2: "A secondary entrance on the north-west side of campus, near the lecture halls.",
  alumni: "Graduates return here to reconnect, join mentoring and take part in events such as the career and job fair.",
  clinic: "First aid and basic health help are available here during school hours. Good to know before you ever need it.",
  "business-office": "Payments and billing are handled here. The Business Office is listed among the offices of Bro. Renato Cruz Hall (VERIFY).",
};

// Event times are sample text - replace with your real schedule.
const EVENTS = [
  { id: "evt-orientation", name: "Freshmen Campus Orientation", type: "event", lat: 6.495684, lng: 124.84197, venue: "SMC", time: "Today \u00b7 9:00 AM \u2013 11:00 AM", description: "Welcome talk for new Marbelian students and a short campus walkthrough." },
  { id: "evt-mass", name: "Community Mass", type: "event", lat: 6.495313, lng: 124.839655, venue: "SMC Chapel", time: "Today \u00b7 12:00 NN", description: "Midday Mass open to students, faculty, and campus visitors." },
  { id: "evt-intramurals", name: "Intramurals Opening", type: "event", lat: 6.49493, lng: 124.842059, venue: "Gymnasium", time: "Tomorrow \u00b7 3:00 PM", description: "Parade of colors and opening program for college intramurals." },
  { id: "evt-jobfair", name: "Career and Job Fair", type: "event", lat: 6.494863, lng: 124.840251, venue: "Alumni Relations Office", time: "Fri \u00b7 8:00 AM \u2013 4:00 PM", description: "Employers and alumni mentors meeting graduating students." },
];

/* Quests. A quest is a list of stops. Every stop needs:
   arrive within `radius` m  ->  stay `dwell` seconds  ->  1 photo.      */
const LINES = {
  tour: { label: "FRESHMAN TOUR", short: "Freshmen" },
  visitor: { label: "VISITOR PATH", short: "Visitors" },
  fun: { label: "SIDE QUEST", short: "Side quest" },
};
function stop(place, dwell, xp, photo, go) {
  return { place, dwell, xp, photo, go, radius: DEFAULT_RADIUS };
}
const QUESTS = [
  {
    id: "tour", line: "tour", title: "Freshman Campus Tour", tag: "8 stops",
    blurb: "Your first walk around Notre Dame of Marbel. Eight stops, one short story at each, ending at the gym. Perfect for orientation week.",
    bonus: 80, badge: "Marbelian Freshman",
    stops: [
      stop("gate", 30, 20, "Photo of the Main Gate with the entrance in frame.", "Start where every Marbelian starts."),
      stop("chapel", 45, 20, "Photo of the chapel entrance. Be quiet and respectful.", "Follow the path to the chapel."),
      stop("canteen", 40, 20, "Photo of your favorite snack or the canteen counter.", "Time for a quick break at the canteen."),
      stop("brc", 45, 20, "Photo of the front of Bro. Renato Cruz Hall (BRC).", "Find the hall with the offices and museum."),
      stop("doherty", 40, 20, "Photo of Doherty Hall's front.", "Head north to the lecture halls."),
      stop("creegan", 40, 20, "Photo of Creegan Hall.", "Walk south to Creegan Hall."),
      stop("smc", 40, 20, "Photo of the SMC building.", "Almost there - find SMC."),
      stop("gym", 45, 20, "Selfie at the gym - you finished the tour!", "Final stop: the Gymnasium."),
    ],
  },
  {
    id: "visitor", line: "visitor", title: "Visitor Welcome Path", tag: "5 stops",
    blurb: "A relaxed 5-stop walk for guests and parents: the gate, the chapel, the museum hall, a snack, and the gym. Stories included.",
    bonus: 50, badge: "Welcome Guest",
    stops: [
      stop("gate", 30, 15, "Photo of the Main Gate - you have arrived!", "Welcome! Start at the main gate."),
      stop("chapel", 40, 15, "Photo of the chapel facade.", "A quiet stop: the campus chapel."),
      stop("brc", 40, 15, "Photo of Bro. Renato Cruz Hall, home of the University Museum.", "Next: the hall with the University Museum."),
      stop("canteen", 40, 15, "Photo of the canteen - enjoy a snack.", "Grab a bite at the main canteen."),
      stop("gym", 40, 15, "Photo of the Gymnasium.", "Finish at the Gymnasium."),
    ],
  },
  sideQuest("first-steps", "First Steps", "Quick", "gate", 20, 20, "Selfie at the Main Gate.", "Walk to the main entrance and say hello to campus.", "First Steps"),
  sideQuest("hall-hopper", "Hall Hopper", "Explorer", "doherty", 45, 40, "Photo of the hall's front door or name.", "Find the lecture hall at the north end of campus.", "Hall Hopper"),
  sideQuest("merienda", "Merienda Run", "Snack", "canteen", 60, 30, "Photo of your merienda (or the menu).", "Eat like a Marbelian: stay a full minute and enjoy it.", "Food Scout"),
  sideQuest("reflect", "Two Quiet Minutes", "Chill", "chapel", 120, 50, "Photo of a calm corner near the chapel.", "Stay two full minutes. No rushing - this one is about stillness.", "Pilgrim"),
  sideQuest("court-side", "Court Side", "Sporty", "gym", 60, 35, "Photo of the court.", "Reach the indoor court used for PE and intramurals.", "Athlete"),
  sideQuest("sprinter", "Victory Pose", "Sporty", "athletics", 45, 35, "Photo of your best victory pose on the court.", "Strike a winner's pose at the open-air Athletics Court.", "Sprinter"),
  sideQuest("gate-keeper", "Sucayan Sidestep", "Quick", "sucayan-gate", 30, 25, "Photo of the Sucayan Gate.", "Discover a side entrance most freshmen never use.", "Gate Keeper"),
  sideQuest("pantua", "Pantua Pathfinder", "Explorer", "pantua-gate", 30, 25, "Photo of the Pantua Gate.", "Walk all the way to the Pantua side of campus.", "Pathfinder"),
  sideQuest("alumni-alley", "Alumni Alley", "Explorer", "alumni", 40, 30, "Photo of the Alumni Relations Office sign.", "See where graduates come back to.", "Alumni Friend"),
  sideQuest("first-aid", "Know Your Clinic", "Safety", "clinic", 30, 25, "Photo of the clinic sign, so you know where help is.", "Learn where to go if you ever feel unwell on campus.", "Safety Scout"),
  sideQuest("dumont-detective", "Dumont Detective", "Explorer", "dumont", 40, 30, "Photo of Dumont Hall.", "Spot the hall that hides beside Doherty.", "Hall Detective"),
  sideQuest("refuel", "Gym Refuel", "Snack", "gym-canteen", 60, 30, "Photo of your drink or snack.", "Refuel at the canteen beside the gym - stay a minute.", "Refuel Champ"),
  sideQuest("science-scout", "Science Scout", "Explorer", "teston", 40, 35, "Photo of Teston.", "Find one of the halls with science and computer labs.", "Science Scout"),
];
// A side quest is a quest with exactly one stop.
function sideQuest(id, title, tag, place, dwell, xp, photo, blurb, badge) {
  return {
    id: "fun-" + id, line: "fun", title, tag, blurb, bonus: 0, badge,
    stops: [stop(place, dwell, xp, photo, blurb)],
  };
}

const TYPE_ICON = { building: "building", office: "briefcase", food: "cup", landmark: "flag", event: "star", quest: "route" };
const TYPE_LABEL = { building: "Building", office: "Office", food: "Food", landmark: "Gate / court", event: "Event" };

/* ============================ 3. ICONS ============================ */
const ICONS = {
  pin: '<path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4Z"/><circle cx="12" cy="13.5" r="3.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M10 17h4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
  building: '<path d="M5 21V4h9v17M14 9h5v12M3 21h18M8 8h3M8 12h3M8 16h3"/>',
  briefcase: '<path d="M4 8h16v11H4ZM9 8V5h6v3M4 13h16"/>',
  cup: '<path d="M5 3v7a3 3 0 0 0 3 3v8M8 3v5M19 3c-2 1-3 3.5-3 6s1 3 3 3v9"/>',
  flag: '<path d="M5 21V4M5 5h12l-2 4 2 4H5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  locate: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M4 17l5-4 4 3 3-2 4 3"/>',
};
function icon(name) {
  return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || "") + "</svg>";
}
function hydrateIcons(root) {
  (root || document).querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
}

/* ============================ 4. STATE & STORAGE ============================ */
// `state` is the single source of truth. Render functions read it; handlers change it.
const state = {
  map: null, layer: null, routeLayer: null, tiles: null,
  userMarker: null, accCircle: null, fix: null, watchId: null,
  mapStyle: "satellite", sim: false, demo: false, filter: "all", query: "",
  progress: { xp: 0, done: {}, badges: [], finished: [], active: null },
  photos: {}, session: null, pending: null, lastTick: 0, wake: null,
  focusedBeforeSheet: null, boardQuestId: null, lastStage: "", completeNext: null,
};
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function loadJSON(key, fallback) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch (e) { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
}
function questById(id) { return QUESTS.find((q) => q.id === id); }
function placeById(id) { return PLACES.find((p) => p.id === id); }
function stopKey(q, i) { return q.id + ":" + i; }
function validKey(k) {
  const m = /^(.+):(\d+)$/.exec(k);
  const q = m && questById(m[1]);
  return !!(q && +m[2] < q.stops.length);
}
function loadProgress() {
  const d = loadJSON(KEYS.progress, {}) || {};
  const done = {};
  if (d.done && typeof d.done === "object") {
    Object.keys(d.done).forEach((k) => { if (validKey(k)) done[k] = d.done[k]; });
  }
  return {
    xp: Number.isFinite(+d.xp) && +d.xp > 0 ? Math.floor(+d.xp) : 0,
    done,
    badges: Array.isArray(d.badges) ? d.badges.filter((x) => typeof x === "string") : [],
    finished: Array.isArray(d.finished) ? d.finished.filter((id) => questById(id)) : [],
    active: questById(d.active) && !(d.finished || []).includes(d.active) ? d.active : null,
  };
}
function loadPhotos() {
  const p = loadJSON(KEYS.photos, {}) || {};
  const out = {};
  Object.keys(p).forEach((k) => { if (validKey(k) && typeof p[k] === "string" && p[k].startsWith("data:image/")) out[k] = p[k]; });
  return out;
}
function persist() {
  const ok = saveJSON(KEYS.progress, state.progress);
  const okp = saveJSON(KEYS.photos, state.photos);
  if (!ok || !okp) showToast("Storage is full - your newest photo may not be saved on this device.");
}
function levelOf(xp) { return 1 + Math.floor(xp / LEVEL_XP); }

function doneCount(q) { return q.stops.filter((_, i) => state.progress.done[stopKey(q, i)]).length; }
function curIdx(q) { return q.stops.findIndex((_, i) => !state.progress.done[stopKey(q, i)]); }
function activeQuest() { return questById(state.progress.active); }
function activeStop() {
  const q = activeQuest();
  if (!q) return null;
  const i = curIdx(q);
  if (i < 0) return null;
  const s = q.stops[i];
  return { q, i, stop: s, place: placeById(s.place), key: stopKey(q, i) };
}
function questDwellTotal(q) { return q.stops.reduce((n, s) => n + s.dwell, 0); }
function questXp(q) { return q.stops.reduce((n, s) => n + s.xp, 0) + q.bonus; }

function haversineMeters(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}
function fmtDur(sec) { return sec >= 60 ? (sec % 60 ? Math.floor(sec / 60) + " min " + (sec % 60) + " s" : sec / 60 + " min") : sec + " s"; }

/* ============================ 5. QUEST ENGINE ============================ */
function syncSession() {
  const a = activeStop();
  const key = a ? a.key : null;
  if (state.session && state.session.key === key) return;
  state.session = key ? { key, dwellMs: 0, dwellDone: false, outsideSince: null, photo: null } : null;
}
function dwellNeed(a) { return state.demo ? Math.min(a.stop.dwell, DEMO_DWELL_SEC) : a.stop.dwell; }
function distanceToStop(a) { return state.fix && a ? haversineMeters(state.fix, a.place) : null; }
function isInside(a) {
  if (!a || !state.fix) return false;
  const d = distanceToStop(a);
  const tol = Math.min(state.fix.acc || 0, 15); // forgive some GPS wobble
  return d <= a.stop.radius + tol;
}
function stageOf(a) {
  if (!a) return "none";
  const s = state.session;
  if (s.dwellDone) return s.photo ? "submit" : "photo";
  return state.inside ? "dwell" : "travel";
}

// Runs once per second.
function tick() {
  const now = Date.now();
  const dt = state.lastTick ? Math.min(now - state.lastTick, 15000) : 0;
  state.lastTick = now;
  syncSession();
  const a = activeStop();
  if (a && !state.session.dwellDone) {
    if (state.sim && state.fix) state.fix.t = now;
    const fresh = state.fix && now - state.fix.t < 60000;
    const inside = !!fresh && isInside(a);
    state.inside = inside;
    const s = state.session;
    if (inside) {
      s.outsideSince = null;
      s.dwellMs += dt;
      if (s.dwellMs >= dwellNeed(a) * 1000) {
        s.dwellDone = true;
        s.dwellMs = dwellNeed(a) * 1000;
        try { navigator.vibrate && navigator.vibrate(200); } catch (e) { /* ignore */ }
        showToast("Timer complete! Now take your photo.");
      }
    } else if (fresh && s.dwellMs > 0) {
      if (!s.outsideSince) s.outsideSince = now;
      else if (now - s.outsideSince > GRACE_MS) {
        s.dwellMs = 0; s.outsideSince = null;
        showToast("You left the area - the timer was reset.");
      }
    }
  } else if (!a) state.inside = false;
  holdScreen(!!a && stageOf(a) === "dwell");
  renderQuest();
}
async function holdScreen(on) {
  try {
    if (on && "wakeLock" in navigator && !state.wake) {
      state.wake = await navigator.wakeLock.request("screen");
      state.wake.addEventListener("release", () => { state.wake = null; });
    } else if (!on && state.wake) { const w = state.wake; state.wake = null; await w.release(); }
  } catch (e) { state.wake = null; }
}

function startQuest(id) {
  const q = questById(id);
  if (!q) return;
  if (state.progress.finished.includes(id)) { showToast("You already completed this quest."); return; }
  state.progress.active = id;
  persist();
  syncSession();
  closeAllSheets();
  renderAll();
  startGeolocation();
  const a = activeStop();
  if (a) focusPlace(a.place, 19);
  showToast("Quest started: " + q.title);
}

function processPhoto(file, caption) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 720;
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), hgt = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement("canvas");
      c.width = w; c.height = hgt;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, w, hgt);
      // caption strip so the photo is clearly "proof" from this stop
      const bar = Math.max(26, Math.round(hgt * 0.07));
      g.fillStyle = "rgba(18,22,20,0.62)";
      g.fillRect(0, hgt - bar, w, bar);
      g.fillStyle = "#ffffff";
      g.font = "600 " + Math.round(bar * 0.46) + "px system-ui, sans-serif";
      g.textBaseline = "middle";
      g.fillText(caption, 12, hgt - bar / 2, w - 24);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable image")); };
    img.src = url;
  });
}
async function onPhotoChosen(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = "";
  const a = activeStop();
  if (!file || !a) return;
  if (!/^image\//.test(file.type)) { showToast("Please choose an image file."); return; }
  try {
    const stamp = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    state.pending = await processPhoto(file, "NDMU Campus Quest \u00b7 " + a.place.name + " \u00b7 " + stamp);
    $("photo-preview").src = state.pending;
    $("photo-sheet-prompt").textContent = a.stop.photo;
    openSheet("photo-sheet");
  } catch (e) {
    showToast("That photo could not be read. Try again.");
  }
}
function usePhoto() {
  if (!state.pending || !state.session) return;
  state.session.photo = state.pending;
  state.pending = null;
  closeSheet("photo-sheet");
  renderQuest();
  showToast("Photo attached. Complete the stop!");
}

function completeStop() {
  const a = activeStop();
  const s = state.session;
  if (!a || !s || !s.dwellDone || !s.photo) return;
  const before = levelOf(state.progress.xp);
  state.progress.done[a.key] = { at: Date.now() };
  state.photos[a.key] = s.photo;
  let gained = a.stop.xp;
  const finished = curIdx(a.q) === -1;
  if (finished) {
    gained += a.q.bonus;
    if (!state.progress.badges.includes(a.q.badge)) state.progress.badges.push(a.q.badge);
    state.progress.finished.push(a.q.id);
    state.progress.active = null;
  }
  state.progress.xp += gained;
  persist();
  const next = finished ? null : activeStop();
  const photo = s.photo;
  state.session = null;
  syncSession();
  // fill the completion sheet
  $("complete-tag").textContent = finished ? "QUEST COMPLETE" : "STOP " + (a.i + 1) + " OF " + a.q.stops.length + " COMPLETE";
  $("complete-title").textContent = finished ? a.q.title + " - done!" : a.place.name;
  $("complete-photo").src = photo;
  $("complete-caption").textContent = a.place.name + " \u00b7 " + new Date().toLocaleDateString();
  let line = "+" + gained + " XP";
  if (finished) line += " (includes +" + a.q.bonus + " bonus) \u00b7 Badge: " + a.q.badge;
  if (levelOf(state.progress.xp) > before) line += " \u00b7 Level up!";
  $("complete-xp").textContent = line;
  $("complete-story").textContent = HISTORY[a.stop.place] || a.place.description;
  const btn = $("complete-next");
  if (finished) { btn.textContent = "See rewards"; state.completeNext = () => { closeSheet("complete-sheet"); openRewards(); }; }
  else {
    btn.textContent = "Next: " + next.place.name;
    state.completeNext = () => { closeSheet("complete-sheet"); focusPlace(next.place, 19); };
  }
  renderAll();
  openSheet("complete-sheet");
}

/* ============================ 6. MAP & GEOLOCATION ============================ */
function setTiles(source) {
  if (!state.map) return;
  const streetKey = state.tileKey === "osm" || state.tileKey === "esri" ? state.tileKey : (location.protocol.indexOf("http") === 0 ? "osm" : "esri");
  const key = source || (state.mapStyle === "satellite" ? "satellite" : streetKey);
  state.tileKey = key;
  const src = TILE_SOURCES[key];
  if (state.tiles) state.tiles.remove();
  let errs = 0;
  state.tiles = L.tileLayer(src.url, { maxNativeZoom: src.native, maxZoom: src.max || 20, minZoom: 15, crossOrigin: true });
  state.tiles.on("tileerror", () => {
    errs += 1;
    if (errs === 6 && key !== "satellite" && !state.tileSwitched) { state.tileSwitched = true; showToast("Switching map source..."); setTiles(key === "osm" ? "esri" : "osm"); }
  });
  state.tiles.addTo(state.map);
  state.map.setMaxZoom(src.max || 20); // the map itself may not zoom past what the tiles can show
  state.tiles.bringToBack();
  const c = $("map-credit");
  if (c) c.innerHTML = src.credit;
}
function loadMapStyle() {
  try { return localStorage.getItem(KEYS.mapStyle) === "streets" ? "streets" : "satellite"; } catch (e) { return "satellite"; }
}
// Switch between aerial photos and the street map; the button label shows what a tap will switch TO.
function setMapStyle(style, persistIt) {
  state.mapStyle = style;
  document.body.classList.toggle("sat", style === "satellite");
  const btn = $("map-style");
  if (btn) {
    btn.lastElementChild.textContent = style === "satellite" ? "Street map" : "Satellite";
    btn.setAttribute("aria-pressed", String(style === "satellite"));
  }
  state.tileSwitched = false;
  setTiles();
  drawMap();
  if (persistIt) { try { localStorage.setItem(KEYS.mapStyle, style); } catch (e) { /* ignore */ } }
}
function fitLimits() {
  const m = state.map;
  if (!m) return;
  m.invalidateSize();
  const z = m.getBoundsZoom(CAMPUS.fence, true); // smallest zoom that never shows outside the campus box
  m.setMinZoom(z);
  if (m.getZoom() < z) m.setZoom(z, { animate: false });
}
function initMap() {
  if (typeof L === "undefined") {
    setLocationStatus("Map unavailable");
    showBanner("The map library could not load. Check your connection and reload.");
    return;
  }
  const map = L.map("map", {
    zoomControl: false, attributionControl: false,
    zoomSnap: 0.25, zoomDelta: 0.5, maxZoom: 20, minZoom: 16,
    maxBounds: CAMPUS.fence, maxBoundsViscosity: 1.0,
  });
  state.map = map;
  state.layer = L.layerGroup().addTo(map);
  state.routeLayer = L.layerGroup().addTo(map);
  map.setView(CAMPUS.center, 18, { animate: false });
  setMapStyle(loadMapStyle(), false);
  requestAnimationFrame(() => {
    map.invalidateSize();
    map.fitBounds(CAMPUS.view, { padding: [40, 40], animate: false });
    fitLimits();
    drawMap();
  });
  window.addEventListener("resize", fitLimits);
  if ("ResizeObserver" in window) new ResizeObserver(fitLimits).observe($("map"));
}
function focusPlace(p, zoom) {
  if (state.map && p) state.map.flyTo([p.lat, p.lng], zoom || 19, { duration: 0.8 });
  document.body.classList.remove("panel-open");
  setNav("map");
}
function pinIcon(type, cls) {
  return L.divIcon({
    className: "pin-wrap",
    html: '<span class="pin pin-' + type + (cls ? " " + cls : "") + '">' + icon(TYPE_ICON[type] || "pin") + "</span>",
    iconSize: [34, 34], iconAnchor: [17, 17],
  });
}
function stopIcon(n, mode) {
  const inner = mode === "done" ? icon("check") : String(n);
  return L.divIcon({
    className: "pin-wrap",
    html: '<span class="stop-pin ' + mode + '">' + inner + "</span>",
    iconSize: [36, 36], iconAnchor: [18, 18],
  });
}
function allQuestPlaceIds() {
  const s = new Set();
  QUESTS.forEach((q) => q.stops.forEach((x) => s.add(x.place)));
  return s;
}
function itemMatches(item) {
  if (state.filter === "event" && item.type !== "event") return false;
  if (state.filter === "quest") { if (item.type === "event" || !allQuestPlaceIds().has(item.id)) return false; }
  else if (!["all", "event"].includes(state.filter) && item.type !== state.filter) return false;
  if (state.filter === "all" && item.type === "event") return false; // events only on the Events chip (less clutter)
  if (!state.query) return true;
  return [item.name, item.type, item.venue, item.description, item.time].filter(Boolean).join(" ").toLowerCase().includes(state.query);
}
function drawMap() {
  if (!state.map) return;
  state.layer.clearLayers();
  state.routeLayer.clearLayers();
  const q = activeQuest();
  const showRoute = q && ["all", "quest"].includes(state.filter) && !state.query;
  const routeIds = new Set(showRoute ? q.stops.map((s) => s.place) : []);
  [...PLACES, ...EVENTS].filter(itemMatches).forEach((item) => {
    if (routeIds.has(item.id)) return; // drawn as numbered stop below
    const m = L.marker([item.lat, item.lng], { icon: pinIcon(item.type), title: item.name, alt: item.name, keyboard: true });
    m.bindTooltip(item.name, { direction: "top", offset: [0, -14], className: "pin-label" });
    m.on("click", () => openDetail(item));
    m.addTo(state.layer);
  });
  if (!showRoute) return;
  const pts = q.stops.map((s) => { const p = placeById(s.place); return [p.lat, p.lng]; });
  if (pts.length > 1) {
    L.polyline(pts, state.mapStyle === "satellite"
      ? { color: "#74E785", weight: 4, opacity: 0.95, dashArray: "2 9", lineCap: "round" }
      : { color: "#2D7A41", weight: 3, opacity: 0.55, dashArray: "2 9", lineCap: "round" }).addTo(state.routeLayer);
  }
  const cur = curIdx(q);
  q.stops.forEach((s, i) => {
    const p = placeById(s.place);
    const isDone = !!state.progress.done[stopKey(q, i)];
    const mode = isDone ? "done" : i === cur ? "current" : "todo";
    const m = L.marker([p.lat, p.lng], { icon: stopIcon(i + 1, mode), title: p.name, zIndexOffset: mode === "current" ? 800 : 400 });
    m.bindTooltip(p.name, { permanent: mode === "current", direction: "top", offset: [0, -16], className: "pin-label" });
    m.on("click", () => openDetail(p));
    m.addTo(state.routeLayer);
    if (i === cur) {
      L.circle([p.lat, p.lng], { radius: s.radius, color: "#2D7A41", weight: 2, fillColor: "#74E785", fillOpacity: 0.22, interactive: false }).addTo(state.routeLayer);
    }
  });
}

function onFix(lat, lng, acc) {
  if (state.sim) return; // demo mode controls the position
  setFix(lat, lng, acc);
}
function setFix(lat, lng, acc) {
  state.fix = { lat, lng, acc: acc || 0, t: Date.now() };
  if (!state.map) return;
  const ll = [lat, lng];
  const icn = L.divIcon({ className: "user-wrap", html: '<span class="user-pin"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
  if (!state.userMarker) state.userMarker = L.marker(ll, { icon: icn, zIndexOffset: 1500, title: "Your location", interactive: false }).addTo(state.map);
  else state.userMarker.setLatLng(ll);
  if (state.accCircle) { state.accCircle.remove(); state.accCircle = null; }
  if (acc && acc < 120) state.accCircle = L.circle(ll, { radius: acc, color: "#2D7A41", weight: 1, fillColor: "#74E785", fillOpacity: 0.12, interactive: false }).addTo(state.map);
}
function handleGeoError(err) {
  const map = {
    1: ["Location permission denied", "Location access is off. You can still explore the map, or turn on Demo mode in Help."],
    2: ["GPS unavailable", "Your location is unavailable right now. Campus places are still visible."],
    3: ["Location timed out", "Finding your location took too long. Try again in a moment."],
  };
  const m = map[err && err.code] || ["Location unavailable", "Could not read your location. You can continue browsing the map."];
  setLocationStatus(m[0]);
  showBanner(m[1]);
}
function startGeolocation() {
  if (state.sim) return;
  if (!navigator.geolocation) {
    setLocationStatus("Location not supported");
    showBanner("This browser does not support location. Turn on Demo mode in Help to try the quests.");
    return;
  }
  hideBanner();
  setLocationStatus("Finding location...");
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  const first = { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 };
  navigator.geolocation.getCurrentPosition((pos) => {
    hideBanner();
    setLocationStatus("Location on", true);
    const c = pos.coords;
    onFix(c.latitude, c.longitude, c.accuracy);
    if (state.map && L.latLngBounds(CAMPUS.fence).contains([c.latitude, c.longitude])) {
      if (!activeStop()) state.map.flyTo([c.latitude, c.longitude], 19, { duration: 0.8 });
    } else showToast("You seem to be off campus. Visit NDMU to play, or try Demo mode in Help.");
  }, handleGeoError, first);
  state.watchId = navigator.geolocation.watchPosition((pos) => {
    hideBanner();
    setLocationStatus("Location on", true);
    onFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
  }, handleGeoError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}
function simulateArrival() {
  const a = activeStop();
  if (!a) return;
  state.sim = true;
  setFix(a.place.lat, a.place.lng, 5);
  setLocationStatus("Demo location", true);
  hideBanner();
  focusPlace(a.place, 19);
}

/* ============================ 7. UI HELPERS ============================ */
function setLocationStatus(text, on) {
  const el = $("location-status");
  el.replaceChildren();
  const dot = h("span", "status-dot" + (on ? " is-on" : ""));
  el.append(dot, document.createTextNode(text));
}
function showBanner(msg) { const b = $("error-banner"); b.textContent = msg; b.hidden = false; }
function hideBanner() { $("error-banner").hidden = true; }
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ============================ 8. RENDERING ============================ */
function renderHud() {
  const xp = state.progress.xp, lvl = levelOf(xp), cur = xp % LEVEL_XP, pct = (cur / LEVEL_XP) * 100;
  $("points-label").textContent = String(xp);
  $("level-label").textContent = "LEVEL " + lvl;
  $("profile-completed").textContent = String(state.progress.finished.length);
  $("profile-xp-fill").style.width = pct + "%";
  $("progress-copy").textContent = cur + " / " + LEVEL_XP + " XP to next level";
  $("xp-fill").style.width = pct + "%";
}

function setBtn(btn, label, action, disabled) {
  const span = btn.querySelector("span");
  (span || btn).textContent = label;
  btn.dataset.action = action;
  btn.disabled = !!disabled;
}
function renderQuest() {
  syncSession();
  const a = activeStop();
  const q = activeQuest();
  const stage = stageOf(a);
  const s = state.session;
  const dock = $("quest-dock");
  document.body.classList.toggle("has-quest", !!a);
  $("sim-button").hidden = !(state.demo && a);
  $("route-card").hidden = !q;
  if (!a) {
    $("quest-line").textContent = "YOUR QUEST";
    $("quest-state").textContent = "READY";
    $("quest-title").textContent = "Choose your next adventure";
    $("quest-summary").textContent = "Take the freshman tour, follow the visitor path, or pick a quick side quest.";
    ["stop-meta", "steps", "timer-row", "story-box", "photo-slot", "photo-prompt"].forEach((id) => { $(id).hidden = true; });
    setBtn($("primary-action"), "Browse quests", "board", false);
    $("dock-title").textContent = "No active quest";
    $("dock-sub").textContent = "Tap to choose one";
    $("dock-bar-fill").style.width = "0%";
    setBtn($("dock-action"), "Browse", "board", false);
    dock.hidden = true;
    return;
  }
  const need = dwellNeed(a);
  const left = s.dwellDone ? 0 : need - s.dwellMs / 1000;
  const prog = s.dwellDone ? 1 : Math.min(1, s.dwellMs / (need * 1000));
  const dist = distanceToStop(a);
  $("quest-line").textContent = LINES[a.q.line].label;
  $("quest-title").textContent = a.q.title;
  $("quest-summary").textContent = a.stop.go;
  $("stop-meta").hidden = false;
  $("stop-meta").textContent = "Stop " + (a.i + 1) + " of " + a.q.stops.length + " \u00b7 " + a.place.name + " \u00b7 +" + a.stop.xp + " XP";
  $("steps").hidden = false;
  $("timer-row").hidden = false;
  $("step-stay-sub").textContent = fmtDur(need);

  const stepState = { arrive: stage !== "travel", stay: s.dwellDone, photo: !!s.photo };
  let currentSet = false;
  document.querySelectorAll("#steps li").forEach((li) => {
    const done = stepState[li.dataset.step];
    li.classList.toggle("is-done", done);
    const isCur = !done && !currentSet;
    if (isCur) currentSet = true;
    li.classList.toggle("is-current", isCur);
  });

  $("ring-fg").setAttribute("stroke-dashoffset", String(RING * (1 - prog)));
  $("ring-ico").innerHTML = icon(s.dwellDone ? "check" : "clock");
  $("timer-text").textContent = s.dwellDone ? "Time met" : fmtTime(left);

  let stateText = "EN ROUTE", sub = "", label = "", action = "", disabled = false, dockSub = "";
  if (stage === "travel") {
    if (!state.fix) {
      sub = "Turn on location so we can see when you arrive.";
      label = "Turn on location"; action = "locate"; dockSub = "Location is off";
    } else {
      const d = Math.max(0, Math.round(dist - a.stop.radius));
      sub = s.dwellMs > 0 && s.outsideSince
        ? "You stepped out - get back within " + Math.max(0, Math.ceil((GRACE_MS - (Date.now() - s.outsideSince)) / 1000)) + " s or the timer resets."
        : d + " m to the spot. The timer starts when you arrive.";
      label = "Show on map"; action = "focus"; dockSub = d + " m away";
    }
  } else if (stage === "dwell") {
    stateText = "STAYING";
    sub = "Stay within " + a.stop.radius + " m. Leaving for over " + GRACE_MS / 1000 + " s resets the timer.";
    label = "Stay for " + fmtTime(left); action = "wait"; disabled = true; dockSub = "Stay " + fmtTime(left);
  } else if (stage === "photo") {
    stateText = "PHOTO TIME";
    sub = "Great! The stay requirement is done.";
    label = "Take your photo"; action = "photo"; dockSub = "Take 1 photo";
  } else {
    stateText = "READY";
    sub = "Photo attached. Complete the stop!";
    label = "Complete stop"; action = "complete"; dockSub = "Ready to complete";
  }
  $("quest-state").textContent = stateText;
  $("timer-sub").textContent = sub;
  setBtn($("primary-action"), label, action, disabled);

  const showStory = stage !== "travel";
  $("story-box").hidden = !showStory;
  if (showStory) {
    $("story-label").textContent = stage === "dwell" ? "WHILE YOU WAIT" : "CAMPUS STORY";
    $("story-text").textContent = HISTORY[a.stop.place] || a.place.description;
  }
  $("photo-prompt").hidden = !(stage === "photo");
  $("photo-prompt").textContent = "Photo challenge: " + a.stop.photo;
  $("photo-slot").hidden = !s.photo;
  if (s.photo && $("photo-thumb").getAttribute("src") !== s.photo) $("photo-thumb").src = s.photo;

  $("dock-title").textContent = a.place.name + " \u00b7 " + (a.i + 1) + "/" + a.q.stops.length;
  $("dock-sub").textContent = dockSub;
  $("dock-bar-fill").style.width = Math.round(prog * 100) + "%";
  setBtn($("dock-action"), action === "wait" ? fmtTime(left) : label.replace("Turn on location", "Locate").replace("Take your photo", "Photo").replace("Show on map", "Map").replace("Complete stop", "Complete"), action, disabled);
  dock.hidden = false;

  if (state.lastStage !== a.key + stage) { state.lastStage = a.key + stage; renderRoute(); }
}
function renderRoute() {
  const q = activeQuest();
  const list = $("route-list");
  list.replaceChildren();
  if (!q) return;
  $("route-count").textContent = doneCount(q) + " / " + q.stops.length + " DONE";
  const cur = curIdx(q);
  q.stops.forEach((s, i) => {
    const p = placeById(s.place);
    const li = h("li", "route-item" + (state.progress.done[stopKey(q, i)] ? " is-done" : i === cur ? " is-current" : ""));
    const b = h("button", "route-btn");
    b.type = "button";
    const n = h("span", "route-node");
    if (state.progress.done[stopKey(q, i)]) n.innerHTML = icon("check"); else n.textContent = String(i + 1);
    const t = h("span", "route-copy");
    t.append(h("strong", "", p.name), h("small", "", fmtDur(s.dwell) + " stay \u00b7 1 photo \u00b7 +" + s.xp + " XP"));
    b.append(n, t);
    b.addEventListener("click", () => focusPlace(p, 19));
    li.append(b);
    list.append(li);
  });
}
function renderLineCards() {
  const host = $("line-cards");
  host.replaceChildren();
  ["tour", "visitor"].forEach((id) => {
    const q = questById(id);
    const n = doneCount(q);
    const b = h("button", "line-card" + (id === "tour" ? " is-feature" : ""));
    b.type = "button";
    b.append(h("span", "pill-tag", LINES[id].label));
    b.append(h("strong", "", q.title));
    b.append(h("small", "", n + " / " + q.stops.length + " stops \u00b7 +" + questXp(q) + " XP"));
    const bar = h("span", "mini-bar"); const fill = h("i"); fill.style.width = (n / q.stops.length) * 100 + "%"; bar.append(fill);
    b.append(bar);
    b.addEventListener("click", () => openQuestDetail(id));
    host.append(b);
  });
  const funs = QUESTS.filter((q) => q.line === "fun");
  const doneFun = funs.filter((q) => state.progress.finished.includes(q.id)).length;
  const b = h("button", "line-card wide");
  b.type = "button";
  b.append(h("span", "pill-tag", "SIDE QUESTS"));
  b.append(h("strong", "", funs.length + " quick quests to try"));
  b.append(h("small", "", doneFun + " completed \u00b7 snacks, sports, secret gates and more"));
  b.addEventListener("click", openBoard);
  host.append(b);
}

function renderBoard() {
  const host = $("board-list");
  host.replaceChildren();
  const headings = { tour: "Guided tour for freshmen", visitor: "For visitors", fun: "Fun side quests" };
  Object.keys(headings).forEach((line) => {
    const group = QUESTS.filter((q) => q.line === line);
    const title = headings[line];
    host.append(h("h3", "board-h", title));
    const grid = h("div", "board-grid");
    group.forEach((q) => {
      const finished = state.progress.finished.includes(q.id);
      const active = state.progress.active === q.id;
      const b = h("button", "quest-tile" + (finished ? " is-done" : "") + (active ? " is-active" : ""));
      b.type = "button";
      const top = h("span", "tile-top");
      top.append(h("span", "pill-tag", q.line === "fun" ? q.tag : LINES[q.line].short), h("span", "tile-xp", "+" + questXp(q) + " XP"));
      const stopsTxt = q.stops.length + (q.stops.length > 1 ? " stops" : " stop");
      b.append(top, h("strong", "", q.title),
        h("small", "", stopsTxt + " \u00b7 stay " + fmtDur(questDwellTotal(q)) + " \u00b7 " + q.stops.length + " photo" + (q.stops.length > 1 ? "s" : "")),
        h("span", "tile-state", finished ? "Completed" : active ? "In progress" : doneCount(q) ? "Continue" : "Start"));
      b.addEventListener("click", () => openQuestDetail(q.id));
      grid.append(b);
    });
    host.append(grid);
  });
}
function openBoard() { renderBoard(); openSheet("board-sheet"); }
function openQuestDetail(id) {
  const q = questById(id);
  if (!q) return;
  state.boardQuestId = id;
  $("qd-tag").textContent = LINES[q.line].label;
  $("qd-title").textContent = q.title;
  $("qd-blurb").textContent = q.blurb;
  const chips = $("qd-chips");
  chips.replaceChildren();
  [q.stops.length + " stop" + (q.stops.length > 1 ? "s" : ""), "Stay " + fmtDur(questDwellTotal(q)) + " total", q.stops.length + " photo" + (q.stops.length > 1 ? "s" : ""), "+" + questXp(q) + " XP", "Badge: " + q.badge].forEach((t) => chips.append(h("span", "meta-chip", t)));
  const list = $("qd-stops");
  list.replaceChildren();
  q.stops.forEach((s, i) => {
    const p = placeById(s.place);
    const li = h("li", "route-item" + (state.progress.done[stopKey(q, i)] ? " is-done" : ""));
    const row = h("div", "route-btn");
    const n = h("span", "route-node");
    if (state.progress.done[stopKey(q, i)]) n.innerHTML = icon("check"); else n.textContent = String(i + 1);
    const t = h("span", "route-copy");
    t.append(h("strong", "", p.name), h("small", "", fmtDur(s.dwell) + " stay \u00b7 " + s.photo));
    row.append(n, t);
    li.append(row);
    list.append(li);
  });
  const fin = state.progress.finished.includes(id);
  const act = state.progress.active === id;
  const btn = $("qd-start");
  btn.textContent = fin ? "Completed" : act ? "Continue quest" : doneCount(q) ? "Continue quest" : "Start quest";
  btn.disabled = fin;
  openSheet("quest-sheet");
}

function openDetail(item) {
  $("detail-type").textContent = (TYPE_LABEL[item.type] || item.type).toUpperCase();
  $("detail-title").textContent = item.name;
  $("detail-meta").textContent = item.time ? item.time + " \u00b7 " + item.venue : CAMPUS.name;
  $("detail-description").textContent = item.description || "Explore this campus location.";
  const story = HISTORY[item.id];
  $("detail-story-box").hidden = !story;
  if (story) $("detail-story").textContent = story;
  $("navigate-place").onclick = () => { closeSheet("detail-sheet"); focusPlace(item, 19); };
  openSheet("detail-sheet");
}

function openRewards() { renderRewards(); openSheet("rewards-sheet"); }
function renderRewards() {
  const xp = state.progress.xp, lvl = levelOf(xp), cur = xp % LEVEL_XP, pct = (cur / LEVEL_XP) * 100;
  $("reward-points").textContent = String(xp);
  $("reward-level").textContent = String(lvl);
  $("reward-done").textContent = String(state.progress.finished.length);
  const keys = Object.keys(state.progress.done).filter((k) => state.photos[k]).sort((x, y) => state.progress.done[y].at - state.progress.done[x].at);
  $("reward-photos").textContent = String(keys.length);
  $("level-progress-label").textContent = Math.round(pct) + "%";
  $("level-progress-copy").textContent = cur + " / " + LEVEL_XP + " XP to next level";
  $("level-track-fill").style.width = pct + "%";
  const badges = $("badge-list");
  badges.replaceChildren();
  (state.progress.badges.length ? state.progress.badges : ["Your first badge is waiting"]).forEach((x) => badges.append(h("li", "", x)));
  const jr = $("journal");
  jr.replaceChildren();
  if (!keys.length) jr.append(h("p", "muted", "Complete a stop and your photo appears here."));
  keys.forEach((k) => {
    const [qid, idx] = k.split(":");
    const q = questById(qid), p = placeById(q.stops[+idx].place);
    const fig = h("button", "journal-item");
    fig.type = "button";
    const img = h("img"); img.src = state.photos[k]; img.alt = "Photo at " + p.name; img.loading = "lazy";
    fig.append(img, h("span", "", p.name));
    fig.addEventListener("click", () => {
      $("pv-img").src = state.photos[k];
      $("pv-caption").textContent = p.name + " \u00b7 " + q.title + " \u00b7 " + new Date(state.progress.done[k].at).toLocaleDateString();
      openSheet("photoview-sheet");
    });
    jr.append(fig);
  });
  const done = $("done-list");
  done.replaceChildren();
  if (!state.progress.finished.length) done.append(h("li", "", "Complete a quest to see it here."));
  state.progress.finished.forEach((id) => { const q = questById(id); done.append(h("li", "", q.title + " \u00b7 +" + questXp(q) + " XP")); });
}

function placeRow(item, cls) {
  const b = h("button", cls);
  b.type = "button";
  const ic = h("span", "place-icon");
  ic.innerHTML = icon(TYPE_ICON[item.type] || "pin");
  const text = h("span", "place-copy");
  text.append(h("strong", "", item.name), h("small", "", TYPE_LABEL[item.type] || item.type));
  b.append(ic, text);
  b.addEventListener("click", () => { closeAllSheets(); focusPlace(item, 19); openDetail(item); });
  return b;
}
function renderLists() {
  const quick = $("quick-links"), dir = $("directory-list"), ev = $("event-list"), all = $("all-events-list");
  [quick, dir, ev, all].forEach((e) => e.replaceChildren());
  ["gate", "canteen", "chapel", "gym"].forEach((id) => quick.append(placeRow(placeById(id), "quick-link")));
  PLACES.forEach((p) => dir.append(placeRow(p, "directory-row")));
  EVENTS.forEach((item) => {
    const mk = () => {
      const b = h("button", "event-row");
      b.type = "button";
      b.append(h("span", "event-date", item.time.split("\u00b7")[0].trim()));
      const t = h("span", "event-copy");
      t.append(h("strong", "", item.name), h("small", "", item.venue));
      b.append(t);
      b.addEventListener("click", () => { closeAllSheets(); focusPlace(item, 19); openDetail(item); });
      return b;
    };
    ev.append(mk());
    all.append(mk());
  });
}

function renderSearch() {
  const box = $("search-results"), query = state.query;
  $("clear-search").hidden = !query;
  if (!query) { box.hidden = true; box.replaceChildren(); drawMap(); return; }
  // Events only show on the map under the "Events" chip, but they should still be searchable from "All places".
  const searchable = (i) => [i.name, i.venue, i.description].join(" ").toLowerCase().includes(query);
  const places = [...PLACES, ...EVENTS].filter((i) => itemMatches(i) || (state.filter === "all" && i.type === "event" && searchable(i)));
  const quests = state.filter === "all" || state.filter === "quest"
    ? QUESTS.filter((q) => (q.title + " " + q.blurb + " " + q.tag).toLowerCase().includes(query)) : [];
  box.replaceChildren();
  if (!places.length && !quests.length) box.append(h("p", "search-empty", "No matches. Try another word."));
  quests.slice(0, 4).forEach((q) => {
    const b = h("button", "result-item");
    b.type = "button"; b.setAttribute("role", "option");
    b.append(h("strong", "", q.title), h("small", "", "Quest \u00b7 " + (q.line === "fun" ? q.tag : LINES[q.line].short)));
    b.addEventListener("click", () => { box.hidden = true; openQuestDetail(q.id); });
    box.append(b);
  });
  places.slice(0, 7).forEach((item) => {
    const b = h("button", "result-item");
    b.type = "button"; b.setAttribute("role", "option");
    b.append(h("strong", "", item.name), h("small", "", (TYPE_LABEL[item.type] || item.type) + (item.venue ? " \u00b7 " + item.venue : "")));
    b.addEventListener("click", () => { box.hidden = true; focusPlace(item, 19); openDetail(item); });
    box.append(b);
  });
  box.hidden = false;
  drawMap();
}

function renderAll() {
  renderHud();
  renderLineCards();
  state.lastStage = "";
  renderQuest();
  renderRoute();
  drawMap();
}

/* ============================ 9. SHEETS, THEME, DEMO ============================ */
function openSheet(id) {
  const sheet = $(id);
  if (!sheet) return;
  document.querySelectorAll(".sheet:not([hidden])").forEach((x) => { x.hidden = true; });
  state.focusedBeforeSheet = document.activeElement;
  sheet.hidden = false;
  document.body.classList.add("sheet-open");
  requestAnimationFrame(() => { const f = sheet.querySelector("button"); if (f) f.focus({ preventScroll: true }); });
}
function closeSheet(id) {
  const sheet = $(id);
  if (!sheet) return;
  sheet.hidden = true;
  if (!document.querySelector(".sheet:not([hidden])")) {
    document.body.classList.remove("sheet-open");
    const f = state.focusedBeforeSheet;
    if (f && f.isConnected) f.focus({ preventScroll: true });
  }
}
function closeAllSheets() {
  document.querySelectorAll(".sheet:not([hidden])").forEach((s) => closeSheet(s.id));
}
function setNav(name) {
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.nav === name));
}

function setTheme(theme, persistIt) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark", b = $("theme-toggle");
  b.innerHTML = icon(dark ? "sun" : "moon");
  b.setAttribute("aria-pressed", String(dark));
  b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  const meta = document.querySelector("meta[name=theme-color]");
  if (meta) meta.setAttribute("content", dark ? "#0C110E" : "#F6F8F5");
  if (persistIt) { try { localStorage.setItem(KEYS.theme, theme); } catch (e) { /* ignore */ } }
}
function setDemo(on, persistIt) {
  state.demo = on;
  $("demo-toggle").checked = on;
  document.body.classList.toggle("demo", on);
  if (!on && state.sim) { state.sim = false; state.fix = null; if (state.userMarker) { state.userMarker.remove(); state.userMarker = null; } setLocationStatus("Location off"); }
  if (persistIt) { try { localStorage.setItem(KEYS.demo, on ? "1" : "0"); } catch (e) { /* ignore */ } }
  if (state.session) { state.session.dwellMs = Math.min(state.session.dwellMs, dwellNeed(activeStop()) * 1000); }
  renderQuest();
}

function doAction(action) {
  if (action === "board") openBoard();
  else if (action === "locate") startGeolocation();
  else if (action === "focus") { const a = activeStop(); if (a) focusPlace(a.place, 19); }
  else if (action === "photo") $("photo-input").click();
  else if (action === "complete") completeStop();
}

/* ============================ 10. EVENT HANDLERS ============================ */
// bindUi() runs ONCE at start-up. Each helper below attaches one group of listeners.
function bindUi() {
  bindTopBarAndMapButtons();
  bindQuestControls();
  bindSearchAndFilters();
  bindSheets();
  bindMobileNav();
  // If the phone slept, don't count the sleeping time as time spent at the spot.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.session && !state.session.dwellDone) state.lastTick = Date.now();
  });
}

function bindTopBarAndMapButtons() {
  $("theme-toggle").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true));
  $("help-button").addEventListener("click", () => openSheet("help-sheet"));
  $("demo-toggle").addEventListener("change", (e) => setDemo(e.target.checked, true));
  $("open-rewards").addEventListener("click", openRewards);
  $("progress-link").addEventListener("click", openRewards);
  $("see-all-places").addEventListener("click", () => openSheet("directory-sheet"));
  $("show-events").addEventListener("click", () => openSheet("events-sheet"));
  $("recenter").addEventListener("click", startGeolocation);
  $("map-style").addEventListener("click", () => setMapStyle(state.mapStyle === "satellite" ? "streets" : "satellite", true));
  $("zoom-in").addEventListener("click", () => state.map && state.map.zoomIn(1));
  $("zoom-out").addEventListener("click", () => state.map && state.map.zoomOut(1));
  $("reset-progress").addEventListener("click", resetProgress);
}

function bindQuestControls() {
  // The big button changes its job (locate / photo / complete...), so it just reads data-action.
  ["primary-action", "dock-action"].forEach((id) => $(id).addEventListener("click", (e) => {
    const action = e.currentTarget.dataset.action;
    if (action) doAction(action);
  }));
  $("open-board").addEventListener("click", openBoard);
  $("see-board").addEventListener("click", openBoard);
  $("sim-button").addEventListener("click", simulateArrival);
  $("retake").addEventListener("click", () => $("photo-input").click());
  $("photo-input").addEventListener("change", onPhotoChosen);
  $("photo-retake").addEventListener("click", () => { state.pending = null; $("photo-input").click(); });
  $("photo-use").addEventListener("click", usePhoto);
  $("qd-start").addEventListener("click", () => startQuest(state.boardQuestId));
  $("complete-next").addEventListener("click", () => state.completeNext && state.completeNext());
}

function bindSearchAndFilters() {
  document.querySelectorAll(".chip").forEach((chip) => chip.addEventListener("click", () => {
    state.filter = chip.dataset.filter;
    document.querySelectorAll(".chip").forEach((x) => {
      x.classList.toggle("is-active", x === chip);
      x.setAttribute("aria-pressed", String(x === chip));
    });
    renderSearch();
  }));
  const readQuery = () => { state.query = $("search-input").value.trim().toLowerCase(); renderSearch(); };
  $("search-form").addEventListener("submit", (e) => { e.preventDefault(); readQuery(); });
  $("search-input").addEventListener("input", readQuery);
  $("clear-search").addEventListener("click", () => { $("search-input").value = ""; readQuery(); $("search-input").focus(); });
  // Click anywhere outside the search box closes the result list.
  document.addEventListener("click", (e) => { if (!e.target.closest(".search-wrap")) $("search-results").hidden = true; });
}

function bindSheets() {
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeSheet(b.closest(".sheet").id)));
  // Clicking the dark backdrop (not the card) closes a sheet.
  document.querySelectorAll(".sheet").forEach((sh) => sh.addEventListener("click", (e) => { if (e.target === sh) closeSheet(sh.id); }));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = document.querySelector(".sheet:not([hidden])");
    if (open) closeSheet(open.id); else $("search-results").hidden = true;
  });
}

function bindMobileNav() {
  const showPanel = () => { document.body.classList.add("panel-open"); setNav("quest"); };
  const showMap = () => { document.body.classList.remove("panel-open"); setNav("map"); };
  $("dock-open").addEventListener("click", showPanel);
  $("nav-quest").addEventListener("click", showPanel);
  $("panel-close").addEventListener("click", showMap);
  document.querySelector('[data-nav="map"]').addEventListener("click", showMap);
  $("nav-directory").addEventListener("click", () => { setNav("directory"); openSheet("directory-sheet"); });
  $("nav-rewards").addEventListener("click", () => { setNav("rewards"); openRewards(); });
}

function resetProgress() {
  if (!window.confirm("Reset all quests, XP and photos on this device?")) return;
  state.progress = { xp: 0, done: {}, badges: [], finished: [], active: null };
  state.photos = {};
  try { localStorage.removeItem(KEYS.progress); localStorage.removeItem(KEYS.photos); } catch (e) { /* storage blocked: nothing to remove */ }
  state.session = null;
  renderAll();
  renderRewards();
}

/* ============================ 11. INITIALISATION ============================ */

// Start-up order matters: load saved data -> attach listeners -> draw lists -> start the map -> draw everything.
document.addEventListener("DOMContentLoaded", () => {
  hydrateIcons();
  state.progress = loadProgress();
  state.photos = loadPhotos();
  bindUi();
  renderLists();
  initMap();
  setTheme(document.documentElement.dataset.theme || "light");
  let demo = false;
  try { demo = localStorage.getItem(KEYS.demo) === "1"; } catch (e) { /* ignore */ }
  setDemo(demo, false);
  renderAll();
  setInterval(tick, 1000);
});
window.addEventListener("pagehide", () => {
  if (state.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(state.watchId);
});
