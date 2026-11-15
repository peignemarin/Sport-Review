// Sport Review — charge data/activities.json et construit la page.

// Les helpers (SPORTS, fmtNumber, fmtDuration, fmtPace, fmtDate, el) sont dans js/format.js

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function statCard(label, value, unit, meta = "") {
  return el("div", { class: "card" }, `
    <p class="label">${label}</p>
    <p class="value">${value}<span class="unit">${unit}</span></p>
    ${meta ? `<p class="meta">${meta}</p>` : ""}`);
}

function renderTotals(activities) {
  const year = new Date(activities[0]?.date ?? Date.now()).getFullYear();
  const thisYear = activities.filter((a) => new Date(a.date).getFullYear() === year);
  const km = thisYear.reduce((sum, a) => sum + a.distance_km, 0);
  const seconds = thisYear.reduce((sum, a) => sum + a.duration_s, 0);
  const elevation = thisYear.reduce((sum, a) => sum + (a.elevation_m || 0), 0);

  document.getElementById("totals-title").textContent = `En ${year}`;
  const root = document.getElementById("totals");
  root.replaceChildren(
    statCard("Distance", fmtNumber(km), "km"),
    statCard("Activités", thisYear.length, ""),
    statCard("Temps d'effort", fmtNumber(seconds / 3600), "h"),
    statCard("Dénivelé positif", fmtNumber(elevation), "m"),
  );
}

function renderRecords(records) {
  const root = document.getElementById("records");
  root.replaceChildren(
    ...records.map((r) => statCard(r.label, fmtDuration(r.time_s), "", `${fmtDate(r.date)}${r.event ? " · " + r.event : ""}`)),
  );
}

function renderVolumeChart(activities) {
  // 12 derniers mois glissants
  const last = new Date(activities[0]?.date ?? Date.now());
  const buckets = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(last.getFullYear(), last.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], km: 0 });
  }
  activities.forEach((a) => {
    const d = new Date(a.date);
    const b = buckets.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (b) b.km += a.distance_km;
  });

  const W = 720, H = 240, padTop = 24, padBottom = 28, gap = 10;
  const max = Math.max(...buckets.map((b) => b.km), 1);
  const barW = (W - gap * (buckets.length - 1)) / buckets.length;
  const bars = buckets.map((b, i) => {
    const h = ((H - padTop - padBottom) * b.km) / max;
    const x = i * (barW + gap);
    const y = H - padBottom - h;
    return `
      <g>
        <title>${b.label} : ${fmtNumber(b.km)} km</title>
        <rect class="bar" x="${x}" y="${y}" width="${barW}" height="${Math.max(h, 1)}" rx="4"></rect>
        ${b.km > 0 ? `<text class="bar-value" x="${x + barW / 2}" y="${y - 6}" text-anchor="middle">${fmtNumber(b.km)}</text>` : ""}
        <text class="axis-label" x="${x + barW / 2}" y="${H - 8}" text-anchor="middle">${b.label}</text>
      </g>`;
  }).join("");

  document.getElementById("volume-chart").innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${bars}</svg>`;
}

function renderActivities(activities, filter = "all") {
  const list = document.getElementById("activities");
  const shown = activities.filter((a) => filter === "all" || a.sport === filter).slice(0, 10);
  list.replaceChildren(...shown.map((a) => {
    const sport = SPORTS[a.sport] ?? { label: a.sport, icon: "•", color: "var(--accent)" };
    const pace = a.sport === "run" ? fmtPace(a.duration_s / a.distance_km)
      : `${fmtNumber(a.distance_km / (a.duration_s / 3600), 1)} km/h`;
    const li = el("li", { class: "activity", style: `--sport-color: ${sport.color}` }, `
      <div class="icon" aria-hidden="true">${sport.icon}</div>
      <div>
        <p class="title">${a.name}</p>
        <p class="date">${sport.label} · ${fmtDate(a.date)}</p>
      </div>
      <div class="numbers">
        <div><strong>${fmtNumber(a.distance_km, 1)} km</strong><span>Distance</span></div>
        <div><strong>${fmtDuration(a.duration_s)}</strong><span>Durée</span></div>
        <div><strong>${pace}</strong><span>${a.sport === "run" ? "Allure" : "Vitesse"}</span></div>
      </div>`);
    return li;
  }));
}

function renderFilters(activities) {
  const root = document.getElementById("filters");
  const order = Object.keys(SPORTS);
  const present = [...new Set(activities.map((a) => a.sport))]
    .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  const options = [["all", "Tout"], ...present.map((s) => [s, SPORTS[s]?.label ?? s])];
  root.replaceChildren(...options.map(([value, label]) => {
    const btn = el("button", { type: "button", "data-sport": value, "aria-pressed": String(value === "all") }, label);
    btn.addEventListener("click", () => {
      root.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      renderActivities(activities, value);
    });
    return btn;
  }));
}

async function init() {
  try {
    const res = await fetch("data/activities.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const activities = [...data.activities].sort((a, b) => new Date(b.date) - new Date(a.date));

    document.getElementById("updated").textContent = `Mis à jour le ${fmtDate(data.updated_at)}`;
    renderTotals(activities);
    renderRecords(data.records);
    renderVolumeChart(activities);
    renderFilters(activities);
    renderActivities(activities);
  } catch (err) {
    console.error(err);
    document.querySelector("main").innerHTML =
      `<p class="card">Impossible de charger les données (${err.message}). Ouvre le site via un serveur local (voir README).</p>`;
  }
}

init();
