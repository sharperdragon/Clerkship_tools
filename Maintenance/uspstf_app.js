/* ================================================================
   uspstf_app.js
   Main application logic for USPSTF Preventive Care app
================================================================ */

// Imports
import { renderChips, renderCards, setEmptyState } from "./uspstf_components.js";
import { parsePasted } from "./uspstf_parser.js";

/**
 * @typedef {Object} Patient
 * @property {number} [age]
 * @property {"male"|"female"} [sex]
 * @property {"Y"|"N"} [pregnant]
 * @property {"Y"|"N"} [tobacco]
 * @property {"Y"|"N"} [sexuallyActive]
 * @property {"N"|"O"|"OB"} [bmiCat]
 */

// $ App state
const state = {
  patient: /** @type {Patient} */ ({}),
  apiUrl: "https://data.uspreventiveservicestaskforce.org/api/json?key=dzq4hAYYcRD8zZrYnA6Ehz",
  cache: null,
};

// DOM refs
const $paste = document.getElementById("paste");
const $btnParse = document.getElementById("btnParse");
const $btnClearPaste = document.getElementById("btnClearPaste");
const $chips = document.getElementById("chips");
const $quickForm = document.getElementById("quickForm");
const $btnFetch = document.getElementById("btnFetch");
const $btnLoadJSON = document.getElementById("btnLoadJSON");
const $fileJSON = document.getElementById("fileJSON");
const $status = document.getElementById("status");
const $results = document.getElementById("results");
const $toolsOnly = document.getElementById("toolsOnly");
const $btnCopy = document.getElementById("btnCopy");
const $btnPrint = document.getElementById("btnPrint");
const $btnExport = document.getElementById("btnExport");
const $themeSelect = document.getElementById("themeSelect");
const $lastUpdated = document.getElementById("lastUpdated");

// ================================================================
// Theme handling
// ================================================================
$themeSelect.addEventListener("change", () => {
  document.body.classList.remove("theme-light", "theme-dark", "theme-auto");
  document.body.classList.add($themeSelect.value);
});

// ================================================================
// Parsing & Quick Form
// ================================================================
$btnParse.addEventListener("click", () => {
  const text = $paste.value;
  const parsed = parsePasted(text);
  state.patient = { ...state.patient, ...parsed };
  updateForm();
  renderChips($chips, state.patient);
});

$btnClearPaste.addEventListener("click", () => {
  $paste.value = "";
  $chips.innerHTML = "";
});

function updateForm() {
  if (state.patient.age != null) $quickForm.age.value = state.patient.age;
  if (state.patient.sex) $quickForm.sex.value = state.patient.sex;
  if (state.patient.pregnant) $quickForm.pregnant.value = state.patient.pregnant;
  if (state.patient.tobacco) $quickForm.tobacco.value = state.patient.tobacco;
  if (state.patient.sexuallyActive) $quickForm.sexuallyActive.value = state.patient.sexuallyActive;
  if (state.patient.bmiCat) $quickForm.bmiCat.value = state.patient.bmiCat;
}

// Update model when quick form changes
$quickForm.addEventListener("input", () => {
  state.patient.age = numOrUndef($quickForm.age.value);
  state.patient.sex = strOrUndef($quickForm.sex.value);
  state.patient.pregnant = strOrUndef($quickForm.pregnant.value);
  state.patient.tobacco = strOrUndef($quickForm.tobacco.value);
  state.patient.sexuallyActive = strOrUndef($quickForm.sexuallyActive.value);
  state.patient.bmiCat = strOrUndef($quickForm.bmiCat.value);
  renderChips($chips, state.patient);
});

// ================================================================
// Fetch JSON
// ================================================================
$btnFetch.addEventListener("click", async () => {
  $status.textContent = "Fetching…";
  try {
    const data = await loadUSPSTF();
    $status.textContent = "Filtering…";
    const filtered = filterRecommendations(data, state.patient);
    renderCards($results, filtered);
    setEmptyState(filtered.list.length === 0);
    if (data?.lastModified) {
      $lastUpdated.textContent = `Last updated: ${new Date(data.lastModified).toLocaleDateString()}`;
    }
    $status.textContent = "";
  } catch (err) {
    console.error(err);
    $status.textContent = "Error fetching recommendations";
  }
});

$btnLoadJSON.addEventListener("click", () => $fileJSON.click());
$fileJSON.addEventListener("change", async () => {
  const file = $fileJSON.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    state.cache = JSON.parse(text);
    $status.textContent = "Loaded JSON file";
  } catch {
    $status.textContent = "Invalid JSON file";
  }
});

// ================================================================
// Filtering logic
// ================================================================
function filterRecommendations(data, patient) {
  if (!data?.recommendations) return { list: [] };

  const gradeFilters = Array.from(document.querySelectorAll("#gradeFilters input:checked"))
    .map(cb => cb.value);

  const list = data.recommendations.filter(r => {
    // Grade filter
    if (r.grade && !gradeFilters.includes(r.grade)) return false;

    // Age filter
    if (patient.age != null && Array.isArray(r.ageRange)) {
      const [min, max] = r.ageRange;
      if (patient.age < min || patient.age > max) return false;
    }

    // Sex filter
    if (patient.sex && r.sex && r.sex.toLowerCase() !== "men and women") {
      if (r.sex.toLowerCase() !== patient.sex.toLowerCase()) return false;
    }

    // Pregnancy filter
    if (patient.pregnant && r.pregnant && r.pregnant !== patient.pregnant) return false;

    // Tobacco filter
    if (patient.tobacco && r.tobacco && r.tobacco !== patient.tobacco) return false;

    // Sexual activity filter
    if (patient.sexuallyActive && r.sexuallyActive && r.sexuallyActive !== patient.sexuallyActive) return false;

    // BMI filter
    if (patient.bmiCat && r.bmiCat && r.bmiCat !== patient.bmiCat) return false;

    return true;
  });

  return { list, grades: data.grades, general: data.general, tools: data.tools };
}

// ================================================================
// Export / Copy / Print
// ================================================================
$btnCopy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($results.innerText);
    $status.textContent = "Copied to clipboard";
    setTimeout(() => ($status.textContent = ""), 1500);
  } catch {
    $status.textContent = "Copy failed";
  }
});

$btnPrint.addEventListener("click", () => window.print());

$btnExport.addEventListener("click", () => {
  if (!state.cache) {
    $status.textContent = "No data to export";
    return;
  }
  const blob = new Blob([JSON.stringify(state.cache, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "uspstf_export.json";
  a.click();
});

// ================================================================
// Helpers
// ================================================================
function numOrUndef(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function strOrUndef(v) {
  return v || undefined;
}

async function loadUSPSTF() {
  if (state.cache) return state.cache;
  const res = await fetch(state.apiUrl);
  if (!res.ok) throw new Error("Failed to fetch API");
  const json = await res.json();
  state.cache = json;
  return json;
}