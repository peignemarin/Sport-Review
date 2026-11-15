// "Race settings" page: one collapsible panel per file.
// Race name and official time are saved automatically to data/courses.json (via server.py).

const list = document.getElementById("courses");
let editable = false;

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Climbs are stored as objects; edited as one line each: "cat | name | km | %"
function colsToText(cols) {
  return (cols || []).map((col) => {
    if (typeof col === "string") return col;
    const parts = [col.cat || "", col.name];
    if (col.length_km != null) parts.push(`${col.length_km} km`);
    if (col.gradient_pct != null) parts.push(`${col.gradient_pct} %`);
    return parts.join(" | ");
  }).join("\n");
}

const fileName = (path) => String(path || "").split("/").pop();

const fmtDay = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";

function render(courses) {
  if (!courses.length) {
    list.innerHTML = `<p class="note">No files yet.</p>`;
    return;
  }
  const disabled = editable ? "" : "disabled";
  list.innerHTML = `<datalist id="categories">${["Marathon", "Semi-marathon", "20 km", "16,2 km", "10 km", "5 km"].map((v) => `<option value="${v}">`).join("")}</datalist>` + courses.map((c) => `
    <details class="course" data-id="${escapeHtml(c.id)}">
      <summary>
        <span class="chevron" aria-hidden="true"></span>
        <span class="file-name">${escapeHtml(fileName(c.file))}</span>
        ${c.activity?.sport === "bike" ? `<span class="badge-mini">Bike</span>` : ""}
      </summary>
      <div class="course-fields">
        <div class="field">
          <span class="field-label">Date added</span>
          <span class="field-static">${fmtDay(c.added_at)}</span>
        </div>
        <label class="field">
          <span class="field-label">Race name</span>
          <input type="text" data-field="official_name" value="${escapeHtml(c.official_name)}" ${disabled} />
        </label>
        ${c.activity?.sport === "bike" ? `
        <label class="field">
          <span class="field-label">Distance (km)</span>
          <input type="text" inputmode="decimal" data-field="official_distance_km" value="${c.official_distance_km ?? ""}" ${disabled} />
        </label>
        <label class="field">
          <span class="field-label">Elevation gain (m)</span>
          <input type="text" inputmode="numeric" data-field="official_elevation_m" value="${c.official_elevation_m ?? ""}" ${disabled} />
        </label>
` : `
        <label class="field">
          <span class="field-label">Category</span>
          <input type="text" data-field="category" value="${escapeHtml(c.category)}" placeholder="Marathon, Semi-marathon, 10 km…" list="categories" ${disabled} />
        </label>
        <label class="field">
          <span class="field-label">Official time</span>
          <input type="text" data-field="official_time" value="${escapeHtml(c.official_time)}" placeholder="h:mm:ss" ${disabled} />
        </label>`}
        <label class="field field--top">
          <span class="field-label">Climbs<br /><small>category | name | km | %</small></span>
          <textarea rows="6" data-field="cols" placeholder="HC | Mont Ventoux | 15.7 km | 8.8 %" ${disabled}>${escapeHtml(colsToText(c.cols))}</textarea>
        </label>
      </div>
    </details>`).join("");
}

// Auto-save when leaving an edited field
list.addEventListener("change", async (e) => {
  const input = e.target.closest("[data-field]");
  if (!input) return;
  const id = input.closest(".course").dataset.id;
  input.classList.remove("saved", "error");
  try {
    const res = await fetch(`/api/courses/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [input.dataset.field]: input.value }),
    });
    if (!res.ok) throw new Error();
    input.classList.add("saved");
    setTimeout(() => input.classList.remove("saved"), 1200);
  } catch {
    input.classList.add("error");
  }
});

(async function init() {
  try {
    editable = (await fetch("/api/status")).ok;
  } catch { editable = false; }
  document.getElementById("readonly-note").hidden = editable;

  try {
    const data = await (await fetch("data/courses.json")).json();
    render(data.courses || []);
  } catch {
    render([]);
  }
})();
