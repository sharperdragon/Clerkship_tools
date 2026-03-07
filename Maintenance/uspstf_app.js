/* ================================================================
   uspstf_app.js
   Main application logic for USPSTF Preventive Care app
================================================================ */

// Imports
import { renderChips, renderCards, setEmptyState } from "./uspstf_components.js";
import { parsePasted } from "./uspstf_parser.js";

// ================================================================
// App constants (change here)
// ================================================================
const DEFAULT_API_URL = "https://data.uspreventiveservicestaskforce.org/api/json?key=dzq4hAYYcRD8zZrYnA6Ehz";
const API_URL_STORAGE_KEY = "uspstf-api-url";
const THEME_MODE_STORAGE_KEY = "uspstf-theme-mode";
const THEME_SYSTEM_MEDIA_QUERY = "(prefers-color-scheme: dark)";
const COPY_STATUS_RESET_MS = 1500;
const EXPORT_FILENAME = "uspstf_export.json";

const STATUS = {
  FETCHING: "Fetching recommendations...",
  FILTERING: "Filtering recommendations...",
  FETCH_ERROR: "Error fetching recommendations",
  FILE_LOADED: "Loaded JSON file",
  FILE_INVALID: "Invalid JSON file",
  COPIED: "Copied to clipboard",
  COPY_FAILED: "Copy failed",
  NO_EXPORT_DATA: "No data to export",
  SETTINGS_SAVED: "Settings saved",
  SETTINGS_SAVED_REFRESH: "Settings saved. API URL changed, cache cleared.",
  SETTINGS_INVALID_URL: "Please enter a valid http(s) URL",
  TOOLS_FILTER_PARTIAL: (count) =>
    `Tools filter partially applied: ${count} item(s) missing tool metadata remain visible.`,
};

const STATUS_LEVEL = {
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
};

const THEME_MODES = new Set(["theme-light", "theme-dark", "theme-auto"]);

/**
 * @typedef {Object} Patient
 * @property {number} [age]
 * @property {"male"|"female"} [sex]
 * @property {"Y"|"N"} [pregnant]
 * @property {"Y"|"N"} [tobacco]
 * @property {"Y"|"N"} [sexuallyActive]
 * @property {"N"|"O"|"OB"} [bmiCat]
 */

// ================================================================
// App state
// ================================================================
const state = {
  patient: /** @type {Patient} */ ({}),
  apiUrl: readApiUrlFromStorage(),
  cache: null,
  transientStatus: "",
  advisoryStatus: "",
  advisoryLevel: STATUS_LEVEL.WARNING,
};

// ================================================================
// DOM refs
// ================================================================
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
const $btnCopy = document.getElementById("btnCopy");
const $btnPrint = document.getElementById("btnPrint");
const $btnExport = document.getElementById("btnExport");
const $themeSelect = document.getElementById("themeSelect");
const $lastUpdated = document.getElementById("lastUpdated");
const $toolsOnly = document.getElementById("toolsOnly");
const $gradeFilters = document.getElementById("gradeFilters");

const $btnSettings = document.getElementById("btnSettings");
const $dlgSettings = document.getElementById("dlgSettings");
const $settingsForm = $dlgSettings ? $dlgSettings.querySelector("form") : null;
const $apiUrl = document.getElementById("apiUrl");

const systemThemeMedia = window.matchMedia(THEME_SYSTEM_MEDIA_QUERY);
let transientStatusTimer = null;

// ================================================================
// Theme handling
// ================================================================
function readThemeMode() {
  const saved = localStorage.getItem(THEME_MODE_STORAGE_KEY);
  return THEME_MODES.has(saved) ? saved : "theme-light";
}

function resolveThemeClass(mode) {
  if (mode === "theme-dark") return "theme-dark";
  if (mode === "theme-auto") {
    return systemThemeMedia.matches ? "theme-dark" : "theme-light";
  }
  return "theme-light";
}

function applyThemeMode(mode, { persist = true } = {}) {
  const safeMode = THEME_MODES.has(mode) ? mode : "theme-light";
  const resolvedClass = resolveThemeClass(safeMode);

  document.body.classList.remove("theme-light", "theme-dark", "theme-auto");
  document.body.classList.add(resolvedClass);
  if (safeMode === "theme-auto") {
    document.body.classList.add("theme-auto");
  }

  document.body.dataset.themeMode = safeMode;
  document.body.dataset.themeResolved = resolvedClass;
  if ($themeSelect) $themeSelect.value = safeMode;
  if (persist) localStorage.setItem(THEME_MODE_STORAGE_KEY, safeMode);
}

if ($themeSelect) {
  $themeSelect.addEventListener("change", () => {
    applyThemeMode($themeSelect.value, { persist: true });
  });
}

if (typeof systemThemeMedia.addEventListener === "function") {
  systemThemeMedia.addEventListener("change", () => {
    if (readThemeMode() === "theme-auto") {
      applyThemeMode("theme-auto", { persist: false });
    }
  });
}

// ================================================================
// Status helpers
// ================================================================
function renderStatus() {
  if (!$status) return;
  $status.textContent = state.transientStatus || state.advisoryStatus || "";
}

function setTransientStatus(message, level = STATUS_LEVEL.INFO, timeoutMs = 0) {
  if (transientStatusTimer) {
    clearTimeout(transientStatusTimer);
    transientStatusTimer = null;
  }
  state.transientStatus = message || "";
  if ($status) {
    $status.dataset.level = message
      ? level
      : (state.advisoryStatus ? state.advisoryLevel : STATUS_LEVEL.INFO);
  }
  renderStatus();

  if (message && timeoutMs > 0) {
    transientStatusTimer = setTimeout(() => {
      state.transientStatus = "";
      if ($status) {
        $status.dataset.level = state.advisoryStatus ? state.advisoryLevel : STATUS_LEVEL.INFO;
      }
      renderStatus();
    }, timeoutMs);
  }
}

function setAdvisoryStatus(message, level = STATUS_LEVEL.WARNING) {
  state.advisoryStatus = message || "";
  state.advisoryLevel = message ? level : STATUS_LEVEL.INFO;
  if (!state.transientStatus && $status) {
    $status.dataset.level = state.advisoryStatus ? state.advisoryLevel : STATUS_LEVEL.INFO;
  }
  renderStatus();
}

// ================================================================
// Parsing & Quick Form
// ================================================================
$btnParse.addEventListener("click", () => {
  const parsed = parsePasted($paste.value);
  state.patient = { ...state.patient, ...parsed };
  updateForm();
  renderChips($chips, state.patient);
  runFilterAndRender();
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

$quickForm.addEventListener("input", () => {
  state.patient.age = numOrUndef($quickForm.age.value);
  state.patient.sex = strOrUndef($quickForm.sex.value);
  state.patient.pregnant = strOrUndef($quickForm.pregnant.value);
  state.patient.tobacco = strOrUndef($quickForm.tobacco.value);
  state.patient.sexuallyActive = strOrUndef($quickForm.sexuallyActive.value);
  state.patient.bmiCat = strOrUndef($quickForm.bmiCat.value);
  renderChips($chips, state.patient);
  runFilterAndRender();
});

// ================================================================
// Settings dialog
// ================================================================
function openSettingsDialog() {
  if (!$dlgSettings) return;
  if ($btnSettings) $btnSettings.setAttribute("aria-expanded", "true");
  if ($apiUrl) $apiUrl.value = state.apiUrl;
  if (typeof $dlgSettings.showModal === "function") {
    $dlgSettings.showModal();
    return;
  }
  $dlgSettings.setAttribute("open", "");
}

function closeSettingsDialog() {
  if (!$dlgSettings) return;
  if ($btnSettings) $btnSettings.setAttribute("aria-expanded", "false");
  if (typeof $dlgSettings.close === "function") {
    $dlgSettings.close();
    return;
  }
  $dlgSettings.removeAttribute("open");
}

function saveApiUrlSetting() {
  if (!$apiUrl) return false;

  const sanitized = sanitizeUrl($apiUrl.value);
  if (!sanitized) {
    setTransientStatus(STATUS.SETTINGS_INVALID_URL, STATUS_LEVEL.ERROR);
    return false;
  }

  const changed = sanitized !== state.apiUrl;
  state.apiUrl = sanitized;
  localStorage.setItem(API_URL_STORAGE_KEY, sanitized);

  if (changed) {
    state.cache = null;
    if ($lastUpdated) $lastUpdated.textContent = "";
    runFilterAndRender();
    setTransientStatus(STATUS.SETTINGS_SAVED_REFRESH, STATUS_LEVEL.INFO, COPY_STATUS_RESET_MS);
  } else {
    setTransientStatus(STATUS.SETTINGS_SAVED, STATUS_LEVEL.INFO, COPY_STATUS_RESET_MS);
  }
  return true;
}

if ($btnSettings) {
  $btnSettings.addEventListener("click", openSettingsDialog);
}

if ($settingsForm) {
  $settingsForm.addEventListener("submit", (event) => {
    const submitter = event.submitter;
    if (submitter && submitter.value === "cancel") {
      event.preventDefault();
      closeSettingsDialog();
      return;
    }

    event.preventDefault();
    const saved = saveApiUrlSetting();
    if (saved) closeSettingsDialog();
  });
}

if ($dlgSettings) {
  $dlgSettings.addEventListener("close", () => {
    if ($btnSettings) $btnSettings.setAttribute("aria-expanded", "false");
    if ($apiUrl) $apiUrl.value = state.apiUrl;
  });
}

// ================================================================
// Fetch / file load
// ================================================================
$btnFetch.addEventListener("click", async () => {
  setTransientStatus(STATUS.FETCHING, STATUS_LEVEL.INFO);
  try {
    await loadUSPSTF();
    setTransientStatus(STATUS.FILTERING, STATUS_LEVEL.INFO);
    runFilterAndRender();
    setTransientStatus("");
  } catch (err) {
    console.error(err);
    setTransientStatus(STATUS.FETCH_ERROR, STATUS_LEVEL.ERROR);
  }
});

$btnLoadJSON.addEventListener("click", () => $fileJSON.click());
$fileJSON.addEventListener("change", async () => {
  const file = $fileJSON.files[0];
  if (!file) return;

  const text = await file.text();
  try {
    state.cache = JSON.parse(text);
    runFilterAndRender();
    setTransientStatus(STATUS.FILE_LOADED, STATUS_LEVEL.INFO, COPY_STATUS_RESET_MS);
  } catch {
    setTransientStatus(STATUS.FILE_INVALID, STATUS_LEVEL.ERROR);
  } finally {
    $fileJSON.value = "";
  }
});

if ($gradeFilters) {
  $gradeFilters.addEventListener("change", () => {
    runFilterAndRender();
  });
}

if ($toolsOnly) {
  $toolsOnly.addEventListener("change", () => {
    runFilterAndRender();
  });
}

// ================================================================
// Filtering and rendering pipeline
// ================================================================
function runFilterAndRender() {
  if (!state.cache?.recommendations) {
    renderCards($results, { list: [] });
    setEmptyState(true);
    $btnCopy.disabled = true;
    setAdvisoryStatus("");
    return;
  }

  const filtered = filterRecommendations(state.cache, state.patient, {
    toolsOnly: $toolsOnly && $toolsOnly.checked,
  });

  renderCards($results, filtered);
  setEmptyState(filtered.list.length === 0);
  $btnCopy.disabled = filtered.list.length === 0;

  if (state.cache?.lastModified && $lastUpdated) {
    $lastUpdated.textContent = `Last updated: ${new Date(state.cache.lastModified).toLocaleDateString()}`;
  } else if ($lastUpdated) {
    $lastUpdated.textContent = "";
  }

  if (filtered.toolsOnly && filtered.unknownToolCount > 0) {
    setAdvisoryStatus(STATUS.TOOLS_FILTER_PARTIAL(filtered.unknownToolCount), STATUS_LEVEL.WARNING);
  } else {
    setAdvisoryStatus("");
  }
}

function filterRecommendations(data, patient, { toolsOnly = false } = {}) {
  if (!data?.recommendations) {
    return { list: [], toolsOnly, unknownToolCount: 0 };
  }

  const gradeFilters = getSelectedGradeFilters();
  const toolLookup = buildToolLookup(data);
  let unknownToolCount = 0;

  const list = data.recommendations.filter((rec) => {
    if (rec.grade && !gradeFilters.includes(rec.grade)) return false;

    const ageRange = getAgeRange(rec);
    if (patient.age != null && ageRange) {
      const [min, max] = ageRange;
      if (patient.age < min || patient.age > max) return false;
    }

    if (!matchesSex(patient.sex, rec.sex)) return false;
    if (!matchesFlag(patient.pregnant, rec.pregnant)) return false;
    if (!matchesFlag(patient.tobacco, rec.tobacco)) return false;
    if (!matchesFlag(patient.sexuallyActive, rec.sexuallyActive)) return false;
    if (!matchesFlag(patient.bmiCat, rec.bmiCat)) return false;

    if (!toolsOnly) return true;

    const toolMeta = classifyToolRecord(rec, toolLookup);
    if (toolMeta.known) return toolMeta.isTool;

    unknownToolCount += 1;
    return true;
  });

  return {
    list,
    grades: data.grades,
    general: data.general,
    tools: data.tools,
    toolsOnly,
    unknownToolCount,
  };
}

function getSelectedGradeFilters() {
  return Array.from(document.querySelectorAll("#gradeFilters input:checked")).map((cb) => cb.value);
}

function getAgeRange(rec) {
  if (Array.isArray(rec.ageRange) && rec.ageRange.length >= 2) {
    const min = Number(rec.ageRange[0]);
    const max = Number(rec.ageRange[1]);
    if (Number.isFinite(min) && Number.isFinite(max)) return [min, max];
  }

  const min = Number(rec.minAge);
  const max = Number(rec.maxAge);
  if (Number.isFinite(min) && Number.isFinite(max)) return [min, max];

  return null;
}

function matchesSex(patientSex, recSex) {
  if (!patientSex || !recSex) return true;

  const candidate = String(recSex).toLowerCase();
  if (candidate.includes("men and women") || candidate.includes("all")) return true;
  if (patientSex === "male") {
    return candidate.includes("male") || candidate.includes("men");
  }
  if (patientSex === "female") {
    return candidate.includes("female") || candidate.includes("women");
  }
  return true;
}

function normalizeFlag(v) {
  if (v == null || v === "") return undefined;
  if (v === true) return "Y";
  if (v === false) return "N";

  const s = String(v).trim().toUpperCase();
  if (["Y", "YES", "TRUE", "1"].includes(s)) return "Y";
  if (["N", "NO", "FALSE", "0"].includes(s)) return "N";
  return s;
}

function matchesFlag(patientValue, recValue) {
  if (patientValue == null || patientValue === "") return true;
  if (recValue == null || recValue === "") return true;
  return normalizeFlag(patientValue) === normalizeFlag(recValue);
}

function buildToolLookup(data) {
  const titles = new Set();
  const ids = new Set();

  const addCandidate = (raw) => {
    if (raw == null) return;
    const value = String(raw).trim().toLowerCase();
    if (!value) return;
    titles.add(value);
  };

  const addObject = (obj) => {
    if (!obj || typeof obj !== "object") return;
    [obj.id, obj.toolId, obj.key, obj.slug].forEach((raw) => {
      if (raw == null) return;
      const value = String(raw).trim().toLowerCase();
      if (value) ids.add(value);
    });
    [obj.title, obj.topic, obj.name, obj.label].forEach(addCandidate);
  };

  const { tools } = data || {};
  if (Array.isArray(tools)) {
    tools.forEach((item) => {
      if (typeof item === "string") addCandidate(item);
      else addObject(item);
    });
  } else if (tools && typeof tools === "object") {
    Object.entries(tools).forEach(([key, value]) => {
      addCandidate(key);
      if (typeof value === "string") addCandidate(value);
      else addObject(value);
    });
  }

  return { titles, ids };
}

function classifyToolRecord(rec, lookup) {
  if (!rec || typeof rec !== "object") return { known: false, isTool: false };

  if (typeof rec.isTool === "boolean") return { known: true, isTool: rec.isTool };
  if (typeof rec.tool === "boolean") return { known: true, isTool: rec.tool };

  const typeFields = [rec.type, rec.category, rec.recommendationType];
  if (typeFields.some((field) => String(field || "").toLowerCase().includes("tool"))) {
    return { known: true, isTool: true };
  }

  if (rec.toolId || rec.toolUrl) {
    return { known: true, isTool: true };
  }

  if (Array.isArray(rec.tags) && rec.tags.some((tag) => String(tag).toLowerCase() === "tool")) {
    return { known: true, isTool: true };
  }

  const idCandidates = [rec.id, rec.toolId, rec.key, rec.slug]
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean);
  if (idCandidates.some((id) => lookup.ids.has(id))) {
    return { known: true, isTool: true };
  }

  const titleCandidates = [rec.title, rec.topic, rec.name, rec.label]
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean);
  if (titleCandidates.some((title) => lookup.titles.has(title))) {
    return { known: true, isTool: true };
  }

  return { known: false, isTool: false };
}

// ================================================================
// Export / Copy / Print
// ================================================================
$btnCopy.addEventListener("click", async () => {
  if ($btnCopy.disabled) return;

  try {
    await navigator.clipboard.writeText($results.innerText.trim());
    setTransientStatus(STATUS.COPIED, STATUS_LEVEL.INFO, COPY_STATUS_RESET_MS);
  } catch {
    setTransientStatus(STATUS.COPY_FAILED, STATUS_LEVEL.ERROR);
  }
});

$btnPrint.addEventListener("click", () => window.print());

$btnExport.addEventListener("click", () => {
  if (!state.cache) {
    setTransientStatus(STATUS.NO_EXPORT_DATA, STATUS_LEVEL.WARNING);
    return;
  }

  const blob = new Blob([JSON.stringify(state.cache, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = EXPORT_FILENAME;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
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

function sanitizeUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function readApiUrlFromStorage() {
  const saved = sanitizeUrl(localStorage.getItem(API_URL_STORAGE_KEY));
  return saved || DEFAULT_API_URL;
}

async function loadUSPSTF() {
  if (state.cache) return state.cache;

  const res = await fetch(state.apiUrl);
  if (!res.ok) throw new Error("Failed to fetch API");

  const json = await res.json();
  state.cache = json;
  return json;
}

// ================================================================
// Initial boot
// ================================================================
if ($apiUrl) {
  $apiUrl.value = state.apiUrl;
}

applyThemeMode(readThemeMode(), { persist: false });
renderChips($chips, state.patient);
runFilterAndRender();
