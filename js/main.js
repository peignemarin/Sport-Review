// Track Record — map of France with the GPS track of every race.
// Data: data/courses.json (names, times, dates) + data/tracks.json (GPS points, built by tracks.py).
// Map: Leaflet (js/vendor/leaflet.js) drawing our own basemap (js/basemap.js), no external tiles.

const list = document.getElementById("race-list");
const resetBtn = document.getElementById("map-reset");
const tip = document.getElementById("map-tip");
const panel = document.querySelector(".map-panel");

const FRANCE = L.latLngBounds([41.3, -5.2], [51.1, 9.6]);
const COLORS = { run: "#1d3dff", bike: "#ff2a3d" };
const CLIMB_COLORS = { run: "#0b1f9e", bike: "#a8101f" }; // darker shade for climbs on the track
const CLIMB_MARKERS_ZOOM = 9;

const SPORTS_UI = {
  run:  { label: "Running", tag: "RUN",  unit: ["race", "races"] },
  bike: { label: "Cycling", tag: "BIKE", unit: ["ride", "rides"] },
};
const sportKey = (c) => (c.activity?.sport === "bike" ? "bike" : "run");
const fmtDay = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const raceName = (c) => c.official_name || (c.activity?.date ? `Race · ${fmtDay(c.activity.date)}` : "Race");
const raceTime = (c) => c.official_time || (c.activity?.duration_s ? fmtClock(c.activity.duration_s) : "—");

// ---------- Map ----------
const map = L.map("map", {
  zoomControl: false,
  zoomSnap: 0,                // continuous zoom levels
  zoomDelta: 1,
  scrollWheelZoom: false,     // replaced by the smooth wheel/trackpad zoom below
  minZoom: 4,
  maxZoom: 17,
});
map.fitBounds(FRANCE, { padding: [10, 10] }); // a view is needed before drawing layers

// Hand-drawn basemap (js/basemap.js): neighbours, French regions, coast, rivers, cities
map.createPane("base"); map.getPane("base").style.zIndex = 250;
map.createPane("labels"); map.getPane("labels").style.zIndex = 380; map.getPane("labels").style.pointerEvents = "none";
map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
map.attributionControl.addAttribution("Natural Earth · Régions © IGN / Etalab");
const flip = (ring) => ring.map(([x, y]) => [y, x]);
// The basemap is drawn on a single canvas (much faster to redraw while zooming than SVG),
// grouped into a handful of layers instead of dozens.
const baseCanvas = L.canvas({ pane: "base", padding: 0.5 });
const BASE = { pane: "base", renderer: baseCanvas, interactive: false, smoothFactor: 1.5 };
L.polygon(BASEMAP.neighbours.flatMap((polys) => polys.map((p) => p.map(flip))),
  { ...BASE, color: "#d6ccbb", weight: 1, fillColor: "#e7e0d3", fillOpacity: 1 }).addTo(map);
L.polygon(BASEMAP.regions.flatMap((r) => r.polys.map((p) => p.map(flip))),
  { ...BASE, color: "#d9cfbf", weight: 1, fillColor: "#f9f5ee", fillOpacity: 1 }).addTo(map);
L.polygon(BASEMAP.france.map((p) => p.map(flip)), { ...BASE, color: "#1f2226", weight: 1.3, fill: false }).addTo(map);
L.polygon(BASEMAP.lakes.map((polys) => polys.map(flip)),
  { ...BASE, color: "#9db8cc", weight: 0.8, fillColor: "#dfe7ea", fillOpacity: 1 }).addTo(map);
// rivers are coarse (Natural Earth): shown at country/region scale only
const rivers = L.polyline(BASEMAP.rivers.map(flip), { ...BASE, color: "#9db8cc", weight: 1.3, opacity: 0.9 }).addTo(map);
const cityLayers = BASEMAP.cities.map((c) => {
  const m = L.circleMarker(c.c, { ...BASE, renderer: undefined, radius: c.t === 1 ? 3.5 : 2.5, color: "#f9f5ee", weight: 1, fillColor: "#1f2226", fillOpacity: 1 });
  m.bindTooltip(c.n, { permanent: true, direction: "right", offset: [4, 0], className: `city-label city-${c.t}`, pane: "labels" });
  return { m, t: c.t };
});
function updateCities() {
  const z = map.getZoom();
  const minTier = z >= 9 ? 3 : z >= 6.6 ? 2 : 1;
  if (z >= 9 && map.hasLayer(rivers)) rivers.remove();
  if (z < 9 && !map.hasLayer(rivers)) rivers.addTo(map);
  cityLayers.forEach(({ m, t }) => {
    const show = t <= minTier;
    if (show && !map.hasLayer(m)) m.addTo(map);
    if (!show && map.hasLayer(m)) m.remove();
  });
}
map.on("zoomend", updateCities);
function updateSummits() {
  const show = map.getZoom() >= CLIMB_MARKERS_ZOOM;
  Object.entries(layers).forEach(([id, l]) => {
    const visible = show && (typeof matchesId !== "function" || matchesId(id));
    l.summits.forEach((m) => {
      if (visible && !map.hasLayer(m)) m.addTo(map);
      if (!visible && map.hasLayer(m)) m.remove();
    });
  });
}
map.on("zoomend", () => updateSummits());

// ---------- Smooth wheel & trackpad zoom ----------
// Leaflet zooms the wheel in steps; here the zoom glides towards a target level every frame,
// anchored on the mouse pointer, which feels continuous on a trackpad pinch or scroll.
(function smoothWheelZoom() {
  const el = map.getContainer();
  let target = null, anchor = null, frame = null;
  const clamp = (z) => Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), z));
  function step() {
    const z = map.getZoom();
    const next = Math.abs(target - z) < 0.01 ? target : z + (target - z) * 0.3;
    map.setZoomAround(anchor, next, { animate: false });
    frame = next === target ? null : requestAnimationFrame(step);
    if (!frame) target = null;
  }
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const speed = e.ctrlKey ? 0.012 : 0.004; // pinch gestures arrive as ctrl+wheel with small deltas
    target = clamp((target ?? map.getZoom()) - px * speed);
    anchor = map.mouseEventToContainerPoint(e);
    if (!frame) frame = requestAnimationFrame(step);
  }, { passive: false });
})();

const home = () => map.fitBounds(FRANCE, { padding: [10, 10] });
home();
let homeZoom = map.getZoom();
updateCities();

const layers = {}; // id -> { line, halo, dot }
let selected = null;
let hovered = null;

function styleAll() {
  const focus = hovered || selected;
  Object.entries(layers).forEach(([id, l]) => {
    const on = !focus || id === focus;
    const strong = id === focus;
    l.line.setStyle({ opacity: on ? 0.9 : 0.12, weight: strong ? 5 : 3 });
    l.dot.setStyle({ fillOpacity: on ? 1 : 0.2, opacity: on ? 1 : 0.2 });
    l.halo.setStyle({ fillOpacity: strong ? 0.3 : on ? 0.15 : 0.04 });
    l.climbLines.forEach((c) => c.setStyle({ opacity: on ? 0.95 : 0.1, weight: strong ? 8 : 6 }));
    l.summits.forEach((m) => m.setOpacity(on ? 1 : 0.25));
  });
  list.querySelectorAll(".race-card").forEach((card) => {
    card.classList.toggle("hover", card.dataset.id === hovered);
    card.classList.toggle("selected", card.dataset.id === selected);
    card.querySelector(".race").setAttribute("aria-pressed", String(card.dataset.id === selected));
  });
}

function drawMap(races) {
  races.forEach((race) => {
    const color = COLORS[sportKey(race.course)];
    const latlngs = race.points.map(([lon, lat]) => [lat, lon]);
    const line = L.polyline(latlngs, { color, weight: 3, opacity: 0.9, lineCap: "round", lineJoin: "round" });
    const halo = L.circleMarker(latlngs[0], { radius: 14, stroke: false, fillColor: color, fillOpacity: 0.15 });
    const dot = L.circleMarker(latlngs[0], { radius: 6, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 });
    // Climbs: darker, thicker stretch of the track + a category badge at the summit
    const sport = sportKey(race.course);
    const climbLines = [], summits = [];
    (race.climbs || []).forEach((cl) => {
      const pts = cl.points.map(([lon, lat]) => [lat, lon]);
      climbLines.push(L.polyline(pts, { color: CLIMB_COLORS[sport], weight: 6, opacity: 0.95, lineCap: "round", lineJoin: "round" }));
      const col = (race.course.cols || []).find((c) => c.name === cl.name) || cl;
      const details = [col.length_km != null ? `${fmtNumber(col.length_km, 1)} km` : "", col.gradient_pct != null ? `${fmtNumber(col.gradient_pct, 1)} %` : ""].filter(Boolean).join(" · ");
      const cat = cl.cat || "";
      const summit = L.marker(pts[pts.length - 1], {
        icon: L.divIcon({ className: `climb-marker sport-${sport}`, html: `<b class="cat ${cat ? `cat-${escapeHtml(cat)}` : "cat-none"}">${cat ? escapeHtml(cat) : "–"}</b>`, iconSize: null }),
        keyboard: false,
      });
      summit.bindTooltip(`<strong>${escapeHtml(cl.name)}</strong>${details ? `<br>${details}` : ""}`, { direction: "top", offset: [0, -12], className: "climb-tip" });
      summits.push(summit);
    });
    [line, ...climbLines, halo, dot].forEach((layer) => {
      layer.addTo(map);
      layer.on("mouseover", (e) => showTip(race, e.originalEvent));
      layer.on("mousemove", (e) => moveTip(e.originalEvent));
      layer.on("mouseout", hideTip);
      layer.on("click", () => select(race.id));
    });
    summits.forEach((m) => m.on("click", () => select(race.id)));
    layers[race.id] = { line, halo, dot, climbLines, summits };
  });
}

// ---------- Hover card ----------
function tipHtml(c) {
  const a = c.activity || {};
  const sport = sportKey(c);
  const line = sport === "bike"
    ? `${fmtNumber(c.official_distance_km ?? a.distance_km ?? 0, 1)} km · ${fmtNumber(c.official_elevation_m ?? a.elevation_m ?? 0)} m D+${c.cols?.length ? ` · ${c.cols.length} climbs` : ""}`
    : `${escapeHtml(raceTime(c))}${c.official_time ? "" : " (watch)"}`;
  return `
    <span class="tip-name"><span class="tag">${SPORTS_UI[sport].tag}${c.category ? ` · ${escapeHtml(c.category)}` : ""}</span> ${escapeHtml(raceName(c))}</span>
    <span class="tip-date">${a.date ? fmtDay(a.date) : ""}</span>
    <span class="tip-figure">${line}</span>`;
}

function moveTip(e) {
  const box = panel.getBoundingClientRect();
  let x = e.clientX - box.left + 14, y = e.clientY - box.top + 14;
  if (x + tip.offsetWidth > box.width - 8) x = e.clientX - box.left - tip.offsetWidth - 14;
  if (y + tip.offsetHeight > box.height - 8) y = e.clientY - box.top - tip.offsetHeight - 14;
  tip.style.transform = `translate(${x}px, ${y}px)`;
}

function showTip(race, e) {
  tip.innerHTML = tipHtml(race.course);
  tip.className = `map-tip sport-${sportKey(race.course)}`;
  tip.hidden = false;
  moveTip(e);
  hovered = race.id;
  styleAll();
  layers[race.id].line.bringToFront();
}

function hideTip() {
  tip.hidden = true;
  hovered = null;
  styleAll();
}

// ---------- Selection & zoom ----------
function select(id) {
  if (selected === id) return reset();
  selected = id;
  styleAll();
  map.flyToBounds(layers[id].line.getBounds(), { padding: [40, 40], duration: 0.9 });
}

function reset() {
  selected = null;
  styleAll();
  map.flyToBounds(FRANCE, { padding: [10, 10], duration: 0.8 });
}

map.on("zoomend moveend", () => {
  resetBtn.hidden = !selected && map.getZoom() <= homeZoom + 0.2;
});
resetBtn.addEventListener("click", reset);
document.getElementById("zoom-in").addEventListener("click", () => map.zoomIn(1));
document.getElementById("zoom-out").addEventListener("click", () => map.zoomOut(1));
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea")) return;
  if (e.key === "Escape") reset();
});

// ---------- List ----------
// Official race distance from the category (pace is computed on it), else the GPS distance
const CAT_KM = { "Marathon": 42.195, "Semi-marathon": 21.0975, "20 km": 20, "16,2 km": 16.2, "10 km": 10, "5 km": 5 };
const parseClock = (t) => {
  if (!String(t || "").trim()) return null;
  const parts = String(t).trim().split(":").map(Number);
  if (!parts.length || parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
};
function paceLine(c) {
  const a = c.activity || {};
  const secs = parseClock(c.official_time) ?? a.duration_s;
  const km = CAT_KM[c.category] ?? a.distance_km;
  return secs && km ? fmtPace(secs / km) : "";
}
function speedLine(c) {
  const a = c.activity || {};
  const km = c.official_distance_km ?? a.distance_km;
  const secs = parseClock(c.official_time) ?? a.duration_s;
  return secs && km ? `${fmtNumber(km / (secs / 3600), 1)} km/h` : "";
}

// Right-hand columns: category pill, then official time + pace (km / D+ / speed for bike rides)
function figures(c) {
  const a = c.activity || {};
  const pill = c.category ? `<span class="cat-pill">${escapeHtml(c.category)}</span>` : "";
  if (sportKey(c) === "bike") {
    const km = c.official_distance_km ?? a.distance_km;
    const dplus = c.official_elevation_m ?? a.elevation_m;
    return `
      <span class="fig fig-cat">${pill}</span>
      <span class="fig fig-stack">
        <span><strong>${km != null ? fmtNumber(km, 1) : "—"}</strong> km</span>
        <span><strong>${dplus != null ? fmtNumber(dplus) : "—"}</strong> m D+</span>
        <span class="fig-sub">${speedLine(c)}</span>
      </span>`;
  }
  return `
    <span class="fig fig-cat">${pill}</span>
    <span class="fig fig-stack">
      <span><strong>${escapeHtml(raceTime(c))}</strong>${c.official_time ? "" : " <em>watch</em>"}</span>
      <span class="fig-sub">${paceLine(c)}</span>
    </span>`;
}

// Climbs (cols / côtes) with their Tour-de-France-style category badge, one per row
function climbsHtml(cols) {
  const rows = cols.map((col) => {
    if (typeof col === "string") col = { name: col };
    const cat = col.cat || "";
    return `
      <li class="climb-row">
        <b class="cat ${cat ? `cat-${escapeHtml(cat)}` : "cat-none"}" title="${cat ? `Category ${escapeHtml(cat)}` : "Uncategorised"}">${cat ? escapeHtml(cat) : "–"}</b>
        <span>${escapeHtml(col.name)}</span>
        <span class="num">${col.length_km != null ? `${fmtNumber(col.length_km, 1)} km` : ""}</span>
        <span class="num muted">${col.gradient_pct != null ? `${fmtNumber(col.gradient_pct, 1)} %` : ""}</span>
      </li>`;
  }).join("");
  const label = cols.length === 1 ? "1 climb" : `${cols.length} climbs`;
  return `<details class="climbs"><summary><span class="chev" aria-hidden="true"></span>${label}</summary><ol class="climb-list">${rows}</ol></details>`;
}

function drawList(races) {
  if (!races.length) {
    list.innerHTML = `<li class="note">No race tracks yet.</li>`;
    return;
  }
  list.innerHTML = races.map((r) => {
    const a = r.course.activity || {};
    return `
      <li class="race-card sport-${sportKey(r.course)}" data-id="${escapeHtml(r.id)}">
        <button type="button" class="race" data-id="${escapeHtml(r.id)}">
          <span class="race-top">
            <span class="race-name">${escapeHtml(raceName(r.course))}</span>
            <span class="badge">${SPORTS_UI[sportKey(r.course)].tag}</span>
          </span>
          <span class="race-meta">${r.course.official_name && a.date ? fmtDay(a.date) : escapeHtml(String(r.course.file || "").split("/").pop())}</span>
          <span class="race-figures">${figures(r.course)}</span>
        </button>
        ${r.course.cols?.length ? climbsHtml(r.course.cols) : ""}
      </li>`;
  }).join("");
  list.querySelectorAll(".race").forEach((b) => {
    b.addEventListener("click", () => {
      select(b.dataset.id);
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const card = b.closest(".race-card");
    card.addEventListener("pointerenter", () => { hovered = card.dataset.id; styleAll(); layers[hovered].line.bringToFront(); });
    card.addEventListener("pointerleave", () => { hovered = null; styleAll(); });
  });
}

function drawLegend(races) {
  const present = [...new Set(races.map((r) => sportKey(r.course)))];
  document.getElementById("map-legend").innerHTML = present
    .map((k) => `<span class="legend-item sport-${k}"><i></i>${SPORTS_UI[k].tag}</span>`).join("");
}

function drawCounters(races) {
  const sum = (arr, f) => arr.reduce((t, r) => t + (f(r.course) || 0), 0);
  const runs = races.filter((r) => sportKey(r.course) === "run");
  const rides = races.filter((r) => sportKey(r.course) === "bike");
  const card = (k, items, figs) => `
    <div class="counter sport-${k}">
      <span class="counter-tag">${SPORTS_UI[k].tag}</span>
      <div>
        <p class="counter-value">${items.length}<span>${items.length === 1 ? SPORTS_UI[k].unit[0] : SPORTS_UI[k].unit[1]}</span></p>
      </div>
    </div>`;
  document.getElementById("counters").innerHTML =
    card("run", runs, `${fmtNumber(sum(runs, (c) => c.activity?.distance_km), 1)} km`) +
    card("bike", rides, `${fmtNumber(sum(rides, (c) => c.official_distance_km ?? c.activity?.distance_km), 1)} km · ${fmtNumber(sum(rides, (c) => c.official_elevation_m ?? c.activity?.elevation_m))} m D+`);
}

// ---------- Filters: sport (All / Run / Bike) and category ----------
const CAT_ORDER = ["Marathon", "Semi-marathon", "20 km", "16,2 km", "10 km", "5 km", "Course"];
let allRaces = [];
const filter = { sport: "all", cat: "all" };

function matches(r) {
  return (filter.sport === "all" || sportKey(r.course) === filter.sport)
    && (filter.cat === "all" || r.course.category === filter.cat);
}

function drawFilters() {
  const bySport = allRaces.filter((r) => filter.sport === "all" || sportKey(r.course) === filter.sport);
  const cats = [...new Map(bySport.filter((r) => r.course.category)
    .map((r) => [r.course.category, sportKey(r.course)])).entries()]
    .sort((a, b) => (CAT_ORDER.indexOf(a[0]) + 1 || 99) - (CAT_ORDER.indexOf(b[0]) + 1 || 99));
  const count = (f) => allRaces.filter(f).length;
  const chip = (group, value, label, sport, n) =>
    `<button type="button" class="chip chip-${sport}" data-group="${group}" data-value="${escapeHtml(value)}" aria-pressed="${filter[group] === value}">${escapeHtml(label)}<span class="chip-n">${n}</span></button>`;

  document.getElementById("race-filters").innerHTML = `
    <div class="filter-row" role="group" aria-label="Filter by sport">
      ${chip("sport", "all", "All", "all", allRaces.length)}
      ${chip("sport", "run", "Run", "run", count((r) => sportKey(r.course) === "run"))}
      ${chip("sport", "bike", "Bike", "bike", count((r) => sportKey(r.course) === "bike"))}
    </div>
    <div class="filter-row" role="group" aria-label="Filter by category">
      ${chip("cat", "all", "All categories", filter.sport === "all" ? "all" : filter.sport, bySport.length)}
      ${cats.map(([c, sp]) => chip("cat", c, c, sp, bySport.filter((r) => r.course.category === c).length)).join("")}
    </div>`;
}

function matchesId(id) {
  const r = allRaces.find((x) => x.id === id);
  return !r || matches(r);
}

function applyFilters() {
  const shown = allRaces.filter(matches);
  drawFilters();
  drawList(shown);
  // keep the map in sync: hide races that are filtered out
  allRaces.forEach((r) => {
    const l = layers[r.id];
    [l.line, ...l.climbLines, l.halo, l.dot].forEach((layer) => {
      if (matches(r) && !map.hasLayer(layer)) layer.addTo(map);
      if (!matches(r) && map.hasLayer(layer)) layer.remove();
    });
  });
  updateSummits();
  if (selected && !shown.some((r) => r.id === selected)) reset();
  styleAll();
}

document.getElementById("race-filters").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  filter[b.dataset.group] = b.dataset.value;
  if (b.dataset.group === "sport") filter.cat = "all"; // categories depend on the sport
  applyFilters();
});

(async function init() {
  try {
    const [c, t] = await Promise.all([
      fetch("data/courses.json").then((r) => r.json()),
      fetch("data/tracks.json").then((r) => (r.ok ? r.json() : { tracks: [] })),
    ]);
    const courses = Object.fromEntries((c.courses || []).map((x) => [x.id, x]));
    const races = (t.tracks || [])
      .filter((tr) => courses[tr.id] && tr.points.length > 1)
      .map((tr) => ({ ...tr, course: courses[tr.id] }))
      .sort((a, b) => new Date(b.course.activity?.date || 0) - new Date(a.course.activity?.date || 0));
    drawCounters(races);
    drawLegend(races);
    drawMap(races);
    allRaces = races;
    applyFilters();
  } catch (err) {
    console.error(err);
    list.innerHTML = `<li class="note">Could not load the races (${escapeHtml(err.message)}).</li>`;
  }
})();
