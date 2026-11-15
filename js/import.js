// Page Import : envoie le .zip + nom/temps officiels au serveur local (server.py).

const form = document.getElementById("import-form");
const fileInput = document.getElementById("file");
const dropzone = document.getElementById("dropzone");
const dropzoneText = document.getElementById("dropzone-text");
const nameInput = document.getElementById("official-name");
const timeInput = document.getElementById("official-time");
const errorBox = document.getElementById("form-error");
const submitBtn = document.getElementById("submit");
const resultBox = document.getElementById("result");
const listBox = document.getElementById("imports");

let selectedFile = null;

// ---------- Choix du fichier (clic ou glisser-déposer) ----------

function setFile(file) {
  selectedFile = file || null;
  dropzone.classList.toggle("has-file", Boolean(file));
  dropzoneText.innerHTML = file
    ? `<strong>${escapeHtml(file.name)}</strong><br />${fmtNumber(file.size / 1024)} Ko · clique pour changer`
    : "<strong>Glisse ton fichier .zip ici</strong><br />ou clique pour le choisir";
}

fileInput.addEventListener("change", () => setFile(fileInput.files[0]));
["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("is-dragging"); }));
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("is-dragging"); }));
dropzone.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));

// ---------- Validation ----------

function parseTime(text) {
  const clean = text.trim().replace(/h/gi, ":").replace(/'/g, ":").replace(/"/g, "");
  if (!/^\d{1,2}(:\d{1,2}){1,2}$/.test(clean)) return null;
  const parts = clean.split(":").map(Number);
  if (parts.slice(1).some((p) => p >= 60)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function validate() {
  if (!selectedFile) return "Choisis un fichier .zip (ou .fit).";
  if (!/\.(zip|fit)$/i.test(selectedFile.name)) return "Le fichier doit être un .zip exporté de Garmin Connect (ou un .fit).";
  if (!nameInput.value.trim()) return "Renseigne le nom officiel.";
  if (parseTime(timeInput.value) === null) return "Temps officiel invalide : utilise le format h:mm:ss ou mm:ss (ex. 1:39:02).";
  return null;
}

// ---------- Envoi ----------

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const problem = validate();
  errorBox.textContent = problem || "";
  if (problem) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Import en cours…";
  try {
    const params = new URLSearchParams({
      name: nameInput.value.trim(),
      time: timeInput.value.trim(),
      filename: selectedFile.name,
    });
    const res = await fetch(`/api/imports?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: selectedFile,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);

    showResult(data.import);
    form.reset();
    setFile(null);
    loadImports();
  } catch (err) {
    errorBox.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Importer";
  }
});

function showResult(imp) {
  const a = imp.activity;
  const sport = SPORTS[a.sport] ?? SPORTS.other;
  const gap = a.duration_s != null ? imp.official_time_s - a.duration_s : null;
  resultBox.innerHTML = `
    <div class="notice notice--ok">
      <strong>✓ ${escapeHtml(imp.official_name)} importé.</strong>
      ${sport.icon} ${sport.label} du ${fmtDate(a.date)} · ${a.distance_km != null ? fmtNumber(a.distance_km, 2) + " km" : "distance inconnue"}
      · temps officiel ${fmtClock(imp.official_time_s)}
      ${gap != null ? `(montre : ${fmtClock(a.duration_s)}, écart ${gap >= 0 ? "+" : "−"}${fmtClock(Math.abs(gap))})` : ""}
    </div>`;
}

// ---------- Liste des imports ----------

function renderImports(imports) {
  if (!imports.length) {
    listBox.innerHTML = `<p class="empty">Aucun import pour l'instant.</p>`;
    return;
  }
  const rows = imports.map((imp) => {
    const a = imp.activity;
    const sport = SPORTS[a.sport] ?? SPORTS.other;
    const pace = a.distance_km
      ? (a.sport === "run" || a.sport === "walk" || a.sport === "hike"
        ? fmtPace(imp.official_time_s / a.distance_km)
        : `${fmtNumber(a.distance_km / (imp.official_time_s / 3600), 1)} km/h`)
      : "—";
    return `
      <tr>
        <td data-label="Date">${new Date(a.date).toLocaleDateString("fr-FR")}</td>
        <td data-label="Nom officiel" class="wrap"><strong>${escapeHtml(imp.official_name)}</strong></td>
        <td data-label="Sport">${sport.icon} ${sport.label}</td>
        <td data-label="Distance" class="num">${a.distance_km != null ? fmtNumber(a.distance_km, 2) + " km" : "—"}</td>
        <td data-label="Temps officiel" class="num"><strong>${fmtClock(imp.official_time_s)}</strong></td>
        <td data-label="Montre" class="num muted">${a.duration_s != null ? fmtClock(a.duration_s) : "—"}</td>
        <td data-label="Allure off." class="num">${pace}</td>
        <td data-label="FC moy." class="num">${a.avg_hr ?? "—"}</td>
        <td class="actions"><button type="button" class="btn-link" data-delete="${imp.id}" title="Supprimer cet import" aria-label="Supprimer">✕</button></td>
      </tr>`;
  }).join("");

  listBox.innerHTML = `
    <div class="table-wrap card">
      <table class="table">
        <thead><tr>
          <th>Date</th><th>Nom officiel</th><th>Sport</th><th class="num">Distance</th>
          <th class="num">Temps officiel</th><th class="num">Montre</th><th class="num">Allure off.</th>
          <th class="num">FC moy.</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// Suppression en deux clics (pas de boîte de dialogue)
listBox.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-delete]");
  if (!btn) return;
  if (!btn.classList.contains("confirm")) {
    btn.classList.add("confirm");
    btn.textContent = "Confirmer ?";
    setTimeout(() => { btn.classList.remove("confirm"); btn.textContent = "✕"; }, 3000);
    return;
  }
  const res = await fetch(`/api/imports/${encodeURIComponent(btn.dataset.delete)}`, { method: "DELETE" });
  if (res.ok) loadImports();
});

async function loadImports() {
  try {
    const res = await fetch("/api/imports");
    const data = await res.json();
    renderImports(data.imports);
  } catch {
    listBox.innerHTML = `<p class="empty">Impossible de charger les imports.</p>`;
  }
}

// ---------- Démarrage : le serveur local est-il lancé ? ----------

(async function init() {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error();
    loadImports();
  } catch {
    document.getElementById("server-warning").hidden = false;
    form.querySelectorAll("input, button").forEach((n) => (n.disabled = true));
    listBox.innerHTML = `<p class="empty">Lance le serveur local pour voir tes imports.</p>`;
  }
})();
