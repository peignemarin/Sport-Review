// Fonctions de formatage partagées entre les pages.

const SPORTS = {
  run:  { label: "Course",   icon: "🏃", color: "var(--run)" },
  bike: { label: "Vélo",     icon: "🚴", color: "var(--bike)" },
  swim: { label: "Natation", icon: "🏊", color: "var(--swim)" },
  hike: { label: "Rando",    icon: "🥾", color: "var(--hike)" },
  walk: { label: "Marche",   icon: "🚶", color: "var(--hike)" },
  gym:  { label: "Muscu",    icon: "🏋️", color: "var(--muted)" },
  other:{ label: "Autre",    icon: "•",  color: "var(--muted)" },
};

const fmtNumber = (n, digits = 0) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function fmtDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  const pad = (x) => String(x).padStart(2, "0");
  return h > 0 ? `${h}h${pad(m)}` : `${m}:${pad(s)}`;
}

// Format complet h:mm:ss, utile pour les temps officiels
function fmtClock(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  const pad = (x) => String(x).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function fmtPace(secondsPerKm) {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" });

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function el(tag, attrs = {}, html = "") {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  node.innerHTML = html;
  return node;
}
