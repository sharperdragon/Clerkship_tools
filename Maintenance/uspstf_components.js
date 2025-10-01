/* ================================================================
   USPSTF Components
   Small rendering helpers for chips and recommendation cards
   ================================================================ */

// ! DOM helpers
const $ = (sel, root = document) => root.querySelector(sel);

/* $ Render parsed patient data chips */
export function renderChips(host, model) {
  const bits = [];
  if (model.age != null) bits.push(`<span class="chip">Age ${model.age}</span>`);
  if (model.sex) bits.push(`<span class="chip">${capitalize(model.sex)}</span>`);
  if (model.pregnant) bits.push(`<span class="chip">Pregnant: ${model.pregnant}</span>`);
  if (model.tobacco) bits.push(`<span class="chip">Tobacco: ${model.tobacco}</span>`);
  if (model.sexuallyActive) bits.push(`<span class="chip">Sexual activity: ${model.sexuallyActive}</span>`);
  if (model.bmiCat) bits.push(`<span class="chip">BMI: ${model.bmiCat}</span>`);
  host.innerHTML = bits.join(" ") || "";
}

/* $ Render recommendation cards */
export function renderCards(host, payload) {
  const { list, grades, general, tools } = payload;
  if (!list || list.length === 0) {
    host.innerHTML = "";
    return;
  }
  const gtxt = (grade, ver) => (grades?.[grade]?.[ver]) || "";
  const items = list.map(rec => {
    const age = Array.isArray(rec.ageRange) ? `Ages ${rec.ageRange[0]}–${rec.ageRange[1]}` : "";
    const sex = rec.sex && rec.sex.toLowerCase() !== "men and women"
      ? `Sex: ${capitalize(rec.sex)}`
      : "";
    const meta = [
      rec.grade ? `<span class="badge grade-${rec.grade}">Grade ${rec.grade}</span>` : "",
      age, sex, rec.servFreq || ""
    ].filter(Boolean).join(" ");

    const risk = (rec.riskName || rec.riskText)
      ? `<div class="muted"><b>Risk:</b> ${rec.riskName || ""} ${rec.riskText || ""}</div>`
      : "";

    const body = rec.text ? `<div class="html">${rec.text}</div>` : "";

    const gradeFold = rec.grade
      ? `<details class="fold"><summary>Grade rationale</summary><div class="html">${gtxt(rec.grade, rec.gradeVer)}</div></details>`
      : "";

    let generalFold = "";
    if (rec.general != null && general && general[String(rec.general)]) {
      const g = general[String(rec.general)];
      generalFold = `<details class="fold">
        <summary>General recommendation: ${escapeHtml(g.title || g.topic || "details")}</summary>
        <div class="html">
          ${g.rationale ? `<h5>Rationale</h5>${g.rationale}` : ""}
          ${g.clinical ? `<h5>Clinical considerations</h5>${g.clinical}` : ""}
          ${g.discussion ? `<h5>Discussion</h5>${g.discussion}` : ""}
          ${g.other ? `<h5>Other</h5>${g.other}` : ""}
          ${g.clinicalUrl ? `<p><a href="${g.clinicalUrl}" target="_blank" rel="noreferrer">Clinical link</a></p>` : ""}
        </div>
      </details>`;
    }

    return `<article class="card">
      <h4>${escapeHtml(rec.title || "Untitled")}</h4>
      <div class="meta">${meta}</div>
      ${risk}
      ${body}
      ${gradeFold}
      ${generalFold}
    </article>`;
  });
  host.innerHTML = items.join("\n");
}

/* $ Toggle empty-state message */
export function setEmptyState(show) {
  const empty = $("#empty");
  if (!empty) return;
  empty.style.display = show ? "block" : "none";
}

/* Helpers */
export function capitalize(s) {
  return (s || "").charAt(0).toUpperCase() + (s || "").slice(1);
}

export function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}