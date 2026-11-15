// Formatting helpers shared by all pages.

const SPORTS = {
  run:  { label: "Run",   icon: "🏃", color: "var(--blue)" },
  bike: { label: "Bike",     icon: "🚴", color: "var(--blue)" },
  swim: { label: "Swim", icon: "🏊", color: "var(--blue)" },
  hike: { label: "Hike",    icon: "🥾", color: "var(--blue)" },
  walk: { label: "Walk",   icon: "🚶", color: "var(--blue)" },
  gym:  { label: "Gym",    icon: "🏋️", color: "var(--blue)" },
  other:{ label: "Other",    icon: "•",  color: "var(--blue)" },
};

const fmtNumber = (n, digits = 0) =>
  n.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function fmtDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  const pad = (x) => String(x).padStart(2, "0");
  return h > 0 ? `${h}h${pad(m)}` : `${m}:${pad(s)}`;
}

// Full h:mm:ss format, used for official times
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
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" });

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
