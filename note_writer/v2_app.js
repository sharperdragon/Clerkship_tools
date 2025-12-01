/* -------------------------------------------------------------------------- */
/* v2_app.js – Minimal wiring for Note Writer (HTML-first; no dynamic templ.) */
/* -------------------------------------------------------------------------- */

/* ==========================================================================
   # Config (top-of-file, explicit)
   ========================================================================== */

// $ Version tag (optional for footer/debug)
const APP_VERSION = 'v2.0.0';

// $ Storage keys
const LS_KEYS = {
  STATE: 'note_writer_state_v1',
  PATIENTS: 'note_writer_patients_v1',
  ACTIVE_PATIENT: 'note_writer_active_patient_v1',
};

// $ Mode constants
const MODES = {
  SUBJECTIVE: 'subjective',
  ROS: 'ROS',
  PE: 'PE',
  MSE: 'MSE',
};

// $ Files (served from the same folder as writer_base.html)
const ROUTES = (window.NOTE_CONFIG && NOTE_CONFIG.routes)
  ? {
      [MODES.SUBJECTIVE]: NOTE_CONFIG.routes.SUBJECTIVE,
      [MODES.ROS]:        NOTE_CONFIG.routes.ROS,
      [MODES.MSE]:        NOTE_CONFIG.routes.MSE,
      [MODES.PE]:         NOTE_CONFIG.routes.PE,
    }
  : {
      [MODES.SUBJECTIVE]: { file: './html/subjective.html', headerSel: '#headerItems', mainSel: '#grid' },
      [MODES.ROS]:        { file: './html/ROS.html',        headerSel: null,          mainSel: '#grid' },
      [MODES.MSE]:        { file: './html/MSE.html',        headerSel: null,          mainSel: '#grid' },
      [MODES.PE]: {
        header: { file: './html/PE_header.html',  sel: '#headerItems' },
        mains:  { General: { file: './html/PE_General.html', sel: '#grid' } },
        subtabs: ['General'], // extend later: ['General','Cardio','Lungs',...]
      },
    };

// $ Subjective-specific field groups (fed from note_config.js when available)
const SUBJECTIVE_HEADER_FIELDS  = (window.NOTE_CONFIG && NOTE_CONFIG.subjective && NOTE_CONFIG.subjective.headerFields)  || [];
const SUBJECTIVE_HPI_FIELDS     = (window.NOTE_CONFIG && NOTE_CONFIG.subjective && NOTE_CONFIG.subjective.hpiFields)     || [];
const SUBJECTIVE_HISTORY_FIELDS = (window.NOTE_CONFIG && NOTE_CONFIG.subjective && NOTE_CONFIG.subjective.historyFields) || [];
const SUBJECTIVE_MULTILINE_FIELDS = new Set(
  (window.NOTE_CONFIG && NOTE_CONFIG.subjective && NOTE_CONFIG.subjective.multilineFields) || []
);

// $ Selectors in writer_base.html
const SEL = {
  tier1: '#tier1',
  tier2: '#tier2',
  headerSlot: '#headerItems',
  contentSlot: '#content',
  out: '#out',
  completeOutView: '#completeOutView',
  copyBtn: '#copyBtn',
  clearSectionBtn: '#clearSectionBtn',
  clearAllBtn: '#clearAllBtn',
  clearPatientsBtn: '[data-role="clear-patients"]',
  appRoot: '#app',
};

// $ Debounce settings
const SAVE_DEBOUNCE_MS = 300;
const COMPLETE_NOTE_DEBOUNCE_MS = 250;

/* ==========================================================================
   # State
   ========================================================================== */

function bucket() {
  // Each bucket represents a mode:subtab "section" data
  return {
    fields:   Object.create(null), // id -> string/number
    checks:   Object.create(null), // id -> boolean
    chips:    Object.create(null), // id -> 'abn' | 'neg' | null
    negPanels:Object.create(null), // panelKey -> true (for ROS defaults)
    misc:     Object.create(null), // radios/sliders/etc.
  };
}

const STATE = {
  patientId: loadActivePatient() || 'default',
  mode: MODES.SUBJECTIVE,
  subtab: 'General', // only meaningful for PE
  data: loadState() || {
    default: {
      [MODES.SUBJECTIVE]: { General: bucket() },
      [MODES.ROS]:        { General: bucket() },
      [MODES.PE]:         { General: bucket() },
      [MODES.MSE]:        { General: bucket() },
    },
  },
};

let _saveTimer = null;
let _fullNoteTimer = null;

/* ==========================================================================
   # Utilities
   ========================================================================== */

const QS  = (sel, root = document) => root.querySelector(sel);
const QSA = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function getPatientSpace() {
  const p = STATE.patientId;
  return (STATE.data[p] ||= {
    [MODES.SUBJECTIVE]: { General: bucket() },
    [MODES.ROS]:        { General: bucket() },
    [MODES.PE]:         { General: bucket() },
    [MODES.MSE]:        { General: bucket() },
  });
}

function getSec(mode = STATE.mode, sub = (mode === MODES.PE ? STATE.subtab : 'General')) {
  const ps = getPatientSpace();
  return (ps[mode][sub] ||= bucket());
}

function saveStateSoon() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEYS.STATE, JSON.stringify(STATE.data));
      localStorage.setItem(LS_KEYS.ACTIVE_PATIENT, STATE.patientId);
    } catch (err) {
      console.warn('Save failed:', err);
    }
  }, SAVE_DEBOUNCE_MS);
}

function loadState() {
  try {
    const s = localStorage.getItem(LS_KEYS.STATE);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function loadActivePatient() {
  try {
    return localStorage.getItem(LS_KEYS.ACTIVE_PATIENT);
  } catch {
    return null;
  }
}

// --- Patient list helpers ---
function getPatientList() {
  try {
    const raw = localStorage.getItem(LS_KEYS.PATIENTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setPatientList(list) {
  try {
    localStorage.setItem(LS_KEYS.PATIENTS, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function setActivePatientId(id) {
  STATE.patientId = id;
  try {
    localStorage.setItem(LS_KEYS.ACTIVE_PATIENT, id);
  } catch {
    // ignore
  }
}

function fmtPatientTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function ensurePatientList() {
  let list = getPatientList();
  const now = Date.now();
  const existingIds = Object.keys(STATE.data || {});

  // If no stored list, bootstrap from existing STATE.data or create default
  if (!list.length) {
    if (existingIds.length) {
      list = existingIds.map((id) => ({ id, createdAt: now }));
    } else {
      STATE.data = {
        default: {
          [MODES.SUBJECTIVE]: { General: bucket() },
          [MODES.ROS]:        { General: bucket() },
          [MODES.PE]:         { General: bucket() },
          [MODES.MSE]:        { General: bucket() },
        },
      };
      list = [{ id: 'default', createdAt: now }];
    }
    setPatientList(list);
  }

  // Ensure active patient id is valid and synced
  let active = loadActivePatient();
  if (!active || !list.some((p) => p.id === active)) {
    active = list[0].id;
  }
  setActivePatientId(active);
}


function debounceFullNote(fn) {
  clearTimeout(_fullNoteTimer);
  _fullNoteTimer = setTimeout(fn, COMPLETE_NOTE_DEBOUNCE_MS);
}

// * Simple timestamp helper for debug logs – format: HH-MM_MM-DD
function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}-${pad(d.getMinutes())}_${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function fetchFragment(fileUrl, selector) {
  const res = await fetch(fileUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to fetch ${fileUrl}: ${res.status}`);
  const html = await res.text();
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return selector ? QS(selector, tmp) : tmp;
}

function setVisible(el, yes) {
  if (!el) return;
  el.style.display = yes ? '' : 'none';
}

/* ==========================================================================
   # Loaders (Mode + PE subtabs)
   ========================================================================== */

async function loadMode(mode) {
  STATE.mode = mode;

  // Tier-1 highlight
  highlightTier1(mode);

  // Show/hide tier-2 for PE
  const tier2 = QS(SEL.tier2);
  if (mode === MODES.PE) {
    setVisible(tier2, true);
    renderTier2(); // builds subtabs if needed
  } else {
    if (tier2) tier2.innerHTML = '';
    setVisible(tier2, false);
  }

  // Load header + main according to route
  const headerSlot = QS(SEL.headerSlot);
  const contentSlot = QS(SEL.contentSlot);

  try {
    if (mode === MODES.PE) {
      // PE header
      const h = await fetchFragment(ROUTES.PE.header.file, ROUTES.PE.header.sel);
      if (headerSlot) {
        headerSlot.replaceChildren(h ? h : document.createComment('no pe header'));
      }

      // PE main for current subtab
      const sub = STATE.subtab || 'General';
      const map = ROUTES.PE.mains[sub];
      if (!map) throw new Error(`No PE main mapping for subtab "${sub}"`);
      const main = await fetchFragment(map.file, map.sel);
      if (contentSlot) {
        contentSlot.replaceChildren(main ? main : document.createComment('no pe main'));
      }
    } else {
      const route = ROUTES[mode];
      if (!route) throw new Error(`Unknown mode "${mode}"`);
      // header (optional)
      if (headerSlot) {
        if (route.headerSel) {
          const h = await fetchFragment(route.file, route.headerSel);
          headerSlot.replaceChildren(h ? h : document.createComment('no header'));
        } else {
          headerSlot.replaceChildren(); // empty
        }
      }
      // main (required)
      const main = await fetchFragment(route.file, route.mainSel);
      if (contentSlot) {
        contentSlot.replaceChildren(main ? main : document.createComment('no main'));
      }
    }

    // After DOM swapped in: rehydrate + wire + render
    rehydrateFromState();
    wireDelegatedEvents(); // idempotent: uses single root listener
    renderOutputsNow();
  } catch (err) {
    console.error('loadMode error:', err);
    if (contentSlot) {
      const pre = document.createElement('pre');
      pre.textContent = String(err);
      contentSlot.replaceChildren(pre);
    }
  }
}

function renderTier2() {
  const tier2 = QS(SEL.tier2);
  if (!tier2) return;
  const subtabs = ROUTES.PE.subtabs || [];
  if (!subtabs.length) return;

  // Build tabs only if empty (simple guard to avoid duplication)
  if (!tier2.children.length) {
    for (const name of subtabs) {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.textContent = name;
      btn.setAttribute('data-subtab', name);
      tier2.appendChild(btn);
    }
  }

  // Highlight current
  QSA('.tab', tier2).forEach(btn => {
    const isActive = btn.getAttribute('data-subtab') === STATE.subtab;
    btn.classList.toggle('active', isActive);
  });

  // Click handling (once)
  if (!tier2._wired) {
    tier2.addEventListener('click', async (e) => {
      const btn = e.target.closest('.tab[data-subtab]');
      if (!btn) return;
      const sub = btn.getAttribute('data-subtab');
      if (sub === STATE.subtab) return;
      STATE.subtab = sub;
      saveStateSoon();
      // Reload PE main only
      const contentSlot = QS(SEL.contentSlot);
      try {
        const map = ROUTES.PE.mains[sub];
        if (!map) throw new Error(`No PE main mapping for subtab "${sub}"`);
        const main = await fetchFragment(map.file, map.sel);
        if (contentSlot) contentSlot.replaceChildren(main ? main : document.createComment('no pe main'));
        renderTier2();           // update highlight
        rehydrateFromState();    // reapply values
        renderOutputsNow();      // refresh outputs
      } catch (err) {
        console.error('PE subtab load error:', err);
      }
    });
    tier2._wired = true;
  }
}

function highlightTier1(mode) {
  const t1 = QS(SEL.tier1);
  if (!t1) return;
  QSA('.tab[data-tab]', t1).forEach(btn => {
    const isActive = btn.getAttribute('data-tab') === mode;
    btn.classList.toggle('active', isActive);
  });
}

/* ==========================================================================
   # Rehydrate (DOM <- STATE)
   ========================================================================== */

function rehydrateFromState() {
  const mode = STATE.mode;
  const sub  = (mode === MODES.PE ? STATE.subtab : 'General');
  const sec  = getSec(mode, sub);

  const rootHeader = QS(SEL.headerSlot);
  const rootMain   = QS(SEL.contentSlot);

  // Fields (text/textarea/range/number) – use [data-field-id]
  const allFields = [
    ...QSA('[data-field-id]', rootHeader),
    ...QSA('[data-field-id]', rootMain),
  ];
  for (const el of allFields) {
    const id = el.getAttribute('data-field-id');
    const v  = sec.fields[id];
    if (v != null) {
      if ('value' in el) el.value = v;
    }
  }

  // Checkboxes – use [data-check-id]
  const allChecks = [
    ...QSA('input[type="checkbox"][data-check-id]', rootHeader),
    ...QSA('input[type="checkbox"][data-check-id]', rootMain),
  ];
  for (const el of allChecks) {
    const id = el.getAttribute('data-check-id');
    const v  = !!sec.checks[id];
    el.checked = v;
  }

  // Radios/range sliders or misc – data-misc-id
  const allMisc = [
    ...QSA('[data-misc-id]', rootHeader),
    ...QSA('[data-misc-id]', rootMain),
  ];
  for (const el of allMisc) {
    const id = el.getAttribute('data-misc-id');
    const v = sec.misc[id];
    if (el.type === 'radio') {
      el.checked = (String(v) === String(el.value));
    } else if ('value' in el && v != null) {
      el.value = v;
    }
  }

  // Chips – container or button with [data-chip-id]
  const allChips = [
    ...QSA('[data-chip-id]', rootHeader),
    ...QSA('[data-chip-id]', rootMain),
  ];
  for (const el of allChips) {
    const id = el.getAttribute('data-chip-id');
    applyChipVisual(el, sec.chips[id] || null);
  }

  // ROS defaults – reapply flagged panels if HTML hints exist
  // We store panelKey in negPanels; on rehydrate, try to mark chips to "neg"
  QSA('[data-panel-key]', rootMain).forEach(panel => {
    const key = panel.getAttribute('data-panel-key');
    if (sec.negPanels[key]) {
      applyNegDefaultsToPanel(panel, sec);
    }
  });
}

/* ==========================================================================
   # Event Delegation (one-time wiring on root)
   ========================================================================== */

function wireDelegatedEvents() {
  const root = QS(SEL.appRoot) || document;
  if (root._wired) return;

  // Input / Change – fields, checkboxes, radios, sliders
  root.addEventListener('input', onInputOrChange, true);
  root.addEventListener('change', onInputOrChange, true);

  // Click – chips, ROS defaults, tier1 tabs, toolbar
  root.addEventListener('click', onClick, true);

  // Toolbar buttons
  QS(SEL.copyBtn)?.addEventListener('click', onCopy);
  QS(SEL.clearSectionBtn)?.addEventListener('click', onClearSection);
  QS(SEL.clearAllBtn)?.addEventListener('click', onClearAll);
  QS(SEL.clearPatientsBtn)?.addEventListener('click', onClearPatients);

  // Tier-1 tabs
  const t1 = QS(SEL.tier1);
  if (t1 && !t1._wired) {
    t1.addEventListener('click', async (e) => {
      const btn = e.target.closest('.tab[data-tab]');
      if (!btn) return;
      const tab = btn.getAttribute('data-tab');
      if (!tab || tab === STATE.mode) return;
      await loadMode(tab);
      saveStateSoon();
    });
    t1._wired = true;
  }

  root._wired = true;
}

function onInputOrChange(e) {
  const t = e.target;
  const mode = STATE.mode;
  const sub  = (mode === MODES.PE ? STATE.subtab : 'General');
  const sec  = getSec(mode, sub);

  // Fields
  if (t.hasAttribute('data-field-id')) {
    const id = t.getAttribute('data-field-id');
    sec.fields[id] = t.value ?? '';
    saveStateSoon();
    renderOutputsNow();
    return;
  }

  // Checkboxes
  if (t.matches('input[type="checkbox"][data-check-id]')) {
    const id = t.getAttribute('data-check-id');
    sec.checks[id] = !!t.checked;
    saveStateSoon();
    renderOutputsNow();
    return;
  }

  // Radios/sliders/misc
  if (t.hasAttribute('data-misc-id')) {
    const id = t.getAttribute('data-misc-id');
    if (t.type === 'radio') {
      if (t.checked) sec.misc[id] = t.value;
    } else {
      sec.misc[id] = t.value;
    }
    saveStateSoon();
    renderOutputsNow();
    return;
  }
}

function onClick(e) {
  const mode = STATE.mode;
  const sub  = (mode === MODES.PE ? STATE.subtab : 'General');
  const sec  = getSec(mode, sub);

  // Chips
  const chipEl = e.target.closest('[data-chip-id]');
  if (chipEl) {
    const id = chipEl.getAttribute('data-chip-id');
    const next = nextChipState(sec.chips[id] || null, e);
    sec.chips[id] = next;
    applyChipVisual(chipEl, next);
    saveStateSoon();
    renderOutputsNow();
    return;
  }

  // ROS panel "defaults" – any element with .neg-df-btn inside a panel
  const dfBtn = e.target.closest('.neg-df-btn');
  if (dfBtn) {
    const panel = dfBtn.closest('[data-panel-key]');
    if (panel) {
      const key = panel.getAttribute('data-panel-key') || panel.querySelector('.panel-title')?.textContent?.trim() || '';
      applyNegDefaultsToPanel(panel, sec);
      if (key) sec.negPanels[key] = true;
      saveStateSoon();
      renderOutputsNow();
    }
    return;
  }
}

/* ==========================================================================
   # Chip Helpers
   ========================================================================== */

// ? Cycle: null -> 'abn' -> 'neg' -> null
function nextChipState(curr, evt) {
  if (curr === null) return 'abn';
  if (curr === 'abn') return 'neg';
  return null;
}

function applyChipVisual(el, state) {
  el.setAttribute('data-state', state || 'neutral');
  el.classList.toggle('is-abn', state === 'abn');
  el.classList.toggle('is-neg', state === 'neg');
  el.classList.toggle('is-neutral', !state);
}

// Apply "neg" to all chips in this panel that qualify
function applyNegDefaultsToPanel(panel, sec) {
  const chips = QSA('[data-chip-id]', panel);
  for (const c of chips) {
    const id = c.getAttribute('data-chip-id');
    sec.chips[id] = 'neg';
    applyChipVisual(c, 'neg');
  }
}

/* ==========================================================================
   # Toolbar Actions
   ========================================================================== */

async function onCopy() {
  try {
    const out = QS(SEL.out);
    const text = out?.value || '';
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.warn('Clipboard copy failed', err);
  }
}

function onClearSection() {
  const mode = STATE.mode;
  const sub  = (mode === MODES.PE ? STATE.subtab : 'General');
  const ps   = getPatientSpace();
  ps[mode][sub] = bucket();
  saveStateSoon();
  rehydrateFromState();
  renderOutputsNow();
}

function onClearAll() {
  const ps = getPatientSpace();
  for (const m of Object.keys(ps)) {
    for (const s of Object.keys(ps[m])) {
      ps[m][s] = bucket();
    }
  }
  saveStateSoon();
  rehydrateFromState();
  renderOutputsNow();
}

// --- Patient lifecycle helpers ---
function newPatientId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createNewPatient() {
  const id = newPatientId();
  const createdAt = Date.now();

  const list = getPatientList();
  list.push({ id, createdAt });
  setPatientList(list);

  // Initialize patient space
  STATE.data[id] = {
    [MODES.SUBJECTIVE]: { General: bucket() },
    [MODES.ROS]:        { General: bucket() },
    [MODES.PE]:         { General: bucket() },
    [MODES.MSE]:        { General: bucket() },
  };

  setActivePatientId(id);
  saveStateSoon();
  rehydrateFromState();
  renderOutputsNow();
  renderPatientControls();
}

function loadPatientById(id) {
  if (!id) return;
  const list = getPatientList();
  const exists = list.some((p) => p.id === id);
  if (!exists) return;

  setActivePatientId(id);

  // Lazily init data bucket if missing
  if (!STATE.data[id]) {
    STATE.data[id] = {
      [MODES.SUBJECTIVE]: { General: bucket() },
      [MODES.ROS]:        { General: bucket() },
      [MODES.PE]:         { General: bucket() },
      [MODES.MSE]:        { General: bucket() },
    };
  }

  saveStateSoon();
  rehydrateFromState();
  renderOutputsNow();
  renderPatientControls();
}

function onClearPatients() {
  if (!confirm('Delete all saved patients and their note data? This cannot be undone.')) return;
  try {
    localStorage.removeItem(LS_KEYS.STATE);
    localStorage.removeItem(LS_KEYS.PATIENTS);
    localStorage.removeItem(LS_KEYS.ACTIVE_PATIENT);
  } catch {}

  // Reset in-memory state and bootstrap a fresh default patient
  const createdAt = Date.now();
  STATE.patientId = 'default';
  STATE.data = {
    default: {
      [MODES.SUBJECTIVE]: { General: bucket() },
      [MODES.ROS]:        { General: bucket() },
      [MODES.PE]:         { General: bucket() },
      [MODES.MSE]:        { General: bucket() },
    },
  };

  setPatientList([{ id: 'default', createdAt }]);
  setActivePatientId('default');

  rehydrateFromState();
  renderOutputsNow();
  renderPatientControls();
}

function renderPatientControls() {
  const host = document.querySelector('[data-role="patient-controls"]');
  if (!host) return;

  host.innerHTML = '';

  const list = getPatientList().slice().sort((a, b) => b.createdAt - a.createdAt);
  const curId = STATE.patientId;

  // New Patient button
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'New Patient';
  btn.title = 'Start a new patient session';
  btn.addEventListener('click', () => {
    createNewPatient();
  });
  host.appendChild(btn);

  // Previous patients dropdown
  const sel = document.createElement('select');

  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = 'Select previous…';
  sel.appendChild(opt0);

  list.forEach((p) => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = fmtPatientTime(p.createdAt);
    if (p.id === curId) o.selected = true;
    sel.appendChild(o);
  });

  sel.addEventListener('change', (e) => {
    const id = e.target.value;
    if (id) {
      loadPatientById(id);
    } else if (curId) {
      // Revert to current if user picked placeholder
      e.target.value = curId;
    }
  });

  host.appendChild(sel);
}


// === Output helpers (ported to mirror original phrasing) ===================
function capFirst(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function lcFirst(s){ return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
function joinWithOxford(list, conj="or"){
  if (!list || list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} ${conj} ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, ${conj} ${list[list.length - 1]}`;
}

// * Decide if a field should be rendered as multi-line (bulleted) in Subjective
function isMultilineField(id, label){
  if (SUBJECTIVE_MULTILINE_FIELDS.has(id)) return true;
  const name = String(label || '').toLowerCase();
  return [
    'past medical',
    'surgical hx',
    'meds',
    'allergies',
    'social',
    'lmp',
    'family hx',
    'family history',
  ].some((k) => name.startsWith(k));
}

// Normalize checkbox labels like the original (drop leading "+", "nl" -> "Normal")
function formatPECheckLabel(raw){
  if (!raw) return "";
  let s = raw.trim().replace(/^\+\s*/,"");
  s = s.replace(/(^|\s)nl(\s|$)/i, (m, p1, p2) => `${p1}Normal${p2}`);
  return capFirst(s);
}

// Vital signs scrubber: returns { line1, line2 } or null
function scrubVitalSigns(raw) {
  if (!raw) return null;
  const s = String(raw);

  let bpBang = "", bpSys = "", bpDia = "";
  { const m = s.match(/BP\s*(\(!\))?\s*([0-9]{2,3})\s*\/\s*([0-9]{2,3})/i);
    if (m) { bpBang = m[1] ? "(!) " : ""; bpSys = m[2]; bpDia = m[3]; } }

  let pulse = ""; { const m = s.match(/Pulse\s*([0-9]{1,3})/i); if (m) pulse = m[1]; }
  let temp = "", site = ""; {
    const m = s.match(/Temp\s*([\d.]+)\s*°?\s*F(?:\s*\(([^)]+)\))?/i);
    if (m) { temp = m[1]; site = m[2] || ""; }
  }
  let resp = ""; { const m = s.match(/Resp\s*([0-9]{1,3})/i); if (m) resp = m[1]; }
  let spo2 = ""; {
    let m = s.match(/(?:SpO2|O2\s*Sat|Oxygen\s*Sat)\s*([0-9]{1,3})\s*%/i);
    if (!m) m = s.match(/\bO2\b\s*([0-9]{1,3})\s*%/i);
    if (m) spo2 = m[1];
  }
  let bmi = ""; {
    let m = s.match(/BMI\s*([\d.]+)\s*kg\/m(?:2|²)/i);
    if (!m) m = s.match(/BMI\s*([\d.]+)/i);
    if (m) bmi = m[1];
  }

  const parts = [];
  if (temp) parts.push(`Temp ${temp} °F${site ? ` (${site})` : ""}`);
  if (bpSys && bpDia) parts.push(`BP ${bpBang}${bpSys}/${bpDia}`);
  if (pulse) parts.push(`HR ${pulse}`);
  if (resp) parts.push(`RR ${resp}`);
  if (spo2) parts.push(`SpO2 ${spo2}%`);

  let line1 = parts.join(", ");
  line1 = line1.replace(", HR", ",  HR"); // double space before HR to match legacy look
  if (/\bOxygen sat \(O2\)\b/i.test(line1)) {
    if (spo2) line1 = line1.replace(/\bOxygen sat \(O2\)\b/gi, `SpO2 ${spo2}%`);
    else line1 = line1.replace(/\s*,?\s*\bOxygen sat \(O2\)\b/gi, "").replace(/,\s*,/g, ", ").replace(/,\s*$/, "");
  }
  const line2 = bmi ? `BMI: ${bmi}` : "";
  if (!line1 && !line2) return null;
  return { line1, line2 };
}

// Find human-readable labels from the current DOM (HTML-first)
function getControlLabelFromDOM(kind, id){
  const roots = [QS(SEL.headerSlot), QS(SEL.contentSlot)];
  for (const root of roots) {
    if (!root) continue;
    if (kind === 'field') {
      const input = root.querySelector(`[data-field-id="${CSS.escape(id)}"]`);
      const lab = input?.closest('label')?.querySelector('.field-label');
      if (lab?.textContent?.trim()) return lab.textContent.trim();
    }
    if (kind === 'check') {
      const el = root.querySelector(`input[type="checkbox"][data-check-id="${CSS.escape(id)}"]`);
      const wrap = el?.closest('label');
      if (wrap) {
        const clone = wrap.cloneNode(true);
        clone.querySelector('input')?.remove();
        const t = clone.textContent.trim();
        if (t) return t;
      }
    }
    if (kind === 'chip') {
      const el = root.querySelector(`[data-chip-id="${CSS.escape(id)}"]`);
      if (el) {
        const t = el.textContent?.trim();
        if (t) return t;
      }
    }
  }
  return id; // fallback
}

// Chip state helpers
function isPosChip(v){ return v === 'abn'; }
function isNegChip(v){ return v === 'neg'; }

function formatChipNegForOutput(id){
  const label = getControlLabelFromDOM('chip', id);
  if (STATE.mode === MODES.ROS) return `Denies ${label}`;
  return `No ${label}`;
}
function formatChipPosForOutput(id){
  return getControlLabelFromDOM('chip', id);
}


/* ==========================================================================
   # Complete Note Enhancements (metrics, autosize, select-all)
   ========================================================================== */

function enhanceCompleteNoteUI(){
  const view = document.getElementById('completeOutView');
  const ta   = document.getElementById('completeOut');

  // If there's no textarea, we only support view + metrics.
  // If already enhanced, skip.
  if (view) {
    if (!view.dataset.enhanced) {
      // Scoped Select-All inside the view
      view.addEventListener('keydown', (e) => {
        const isSelectAll = (e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A');
        if (!isSelectAll) return;
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(view);
        sel.removeAllRanges();
        sel.addRange(range);
        e.preventDefault();
        e.stopPropagation();
      });
      view.dataset.enhanced = "1";
    }
  }

  // Metrics element (create if missing) — placed right before the textarea if present,
  // otherwise appended after the view.
  let metrics = document.querySelector('.cn-metrics[data-cn="metrics"]');
  if (!metrics) {
    metrics = document.createElement('div');
    metrics.className = 'cn-metrics';
    metrics.dataset.cn = 'metrics';
    if (ta && ta.parentElement) {
      ta.parentElement.insertBefore(metrics, ta);
    } else if (view && view.parentElement) {
      view.parentElement.insertBefore(metrics, view.nextSibling);
    }
  }

  if (ta) {
    // Hide the textarea by default; it remains the canonical plain-text store.
    if (!ta.dataset.enhanced) {
      ta.style.display = 'none';
      ta.addEventListener('input', () => { _updateCnMetrics(); _autosizeCnTextarea(); });
      ta.dataset.enhanced = "1";
    }
    _updateCnMetrics();
    _autosizeCnTextarea();
    window.addEventListener('resize', _autosizeCnTextarea);
  }
}

function _updateCnMetrics(){
  const ta = document.getElementById('completeOut');
  const m  = document.querySelector('.cn-metrics[data-cn="metrics"]');
  if (!ta || !m) return;
  const txt = ta.value || "";
  const chars = txt.length;
  const words = (txt.trim().match(/\S+/g) || []).length;
  const lines = txt ? txt.split(/\r\n|\n|\r/).length : 0;
  m.textContent = `${chars} chars · ${words} words · ${lines} lines`;
}

function _autosizeCnTextarea(){
  const ta = document.getElementById('completeOut');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight + 2, Math.floor(window.innerHeight * 0.6)) + 'px';
}

/* ==========================================================================
   # Output Builders
   ========================================================================== */

// ! Core render: rebuilds current section and debounced full note
function renderOutputsNow() {
  // Build current section output from DOM/state
  const sectionText = buildSectionOutput();
  const outEl = QS(SEL.out);
  if (outEl) outEl.value = sectionText;

  // Build full note (debounced)
  debounceFullNote(() => {
    const html = buildCompleteNoteHTML();
    const view = QS(SEL.completeOutView);
    if (view) view.innerHTML = html;

    // Keep a plain-text mirror for copy/export and metrics/autosize
    const ta = document.getElementById('completeOut');
    if (ta) {
      // Convert the HTML view to a reasonable plain text (line breaks preserved)
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const text = tmp.textContent || '';
      ta.value = text.trim();
      _updateCnMetrics();
      _autosizeCnTextarea();
    }
  });
}

// * Subjective-only builder – uses NOTE_CONFIG.subjective to group fields
function buildSubjectiveSectionOutput(sec){
  const lines = [];

  // 1) Header-style fields (visit note, chief complaint, etc.)
  for (const id of SUBJECTIVE_HEADER_FIELDS) {
    const raw = sec.fields?.[id];
    const val = (raw == null ? '' : String(raw)).trim();
    if (!val) continue;
    const label = getControlLabelFromDOM('field', id);
    lines.push(`${label}: ${val}.`);
  }

  // 2) HPI – emit a single narrative line composed of each filled HPI field
  const hpiSentences = [];
  for (const id of SUBJECTIVE_HPI_FIELDS) {
    const raw = sec.fields?.[id];
    const val = (raw == null ? '' : String(raw)).trim();
    if (!val) continue;
    const label = getControlLabelFromDOM('field', id);
    hpiSentences.push(`${label}: ${val}.`);
  }
  if (hpiSentences.length) {
    const hpiLine = hpiSentences.join(' ').trim();
    // One narrative-style HPI line (matches old app.js style better)
    lines.push(`HPI: ${hpiLine}`);
  }

  // 3) General History – multiline-aware where appropriate
  for (const id of SUBJECTIVE_HISTORY_FIELDS) {
    const raw = sec.fields?.[id];
    const val = (raw == null ? '' : String(raw)).trim();
    if (!val) continue;

    const label = getControlLabelFromDOM('field', id);
    if (isMultilineField(id, label) && /[\r\n]/.test(val)) {
      const pieces = val.split(/\r\n|\n|\r/).map((s) => s.trim()).filter(Boolean);
      if (!pieces.length) continue;
      lines.push(`${label}:`);
      pieces.forEach((p) => lines.push(`- ${p}`));
    } else {
      lines.push(`${label}: ${val}.`);
    }
  }

  return lines.join("\n");
}

// ! Core: builds the current section text from STATE + live DOM
function buildSectionOutput(){
  const mode = STATE.mode;
  const sub  = (mode === MODES.PE ? STATE.subtab : 'General');
  const sec  = getSec(mode, sub);

  // Subjective uses a dedicated builder wired to NOTE_CONFIG.subjective
  if (mode === MODES.SUBJECTIVE) {
    return buildSubjectiveSectionOutput(sec);
  }

  const lines = [];

  // --- Header area: fields and vitals formatting ---
  (function(){
    const headerFields = QSA('[data-field-id]', QS(SEL.headerSlot));
    const textParts = [];
    let emittedVitals = false;

    headerFields.forEach(el => {
      const id = el.getAttribute('data-field-id');
      const val = (sec.fields?.[id] ?? '').toString().trim();
      if (!val) return;

      if (id === 'vital_signs_text') {
        const fmt = scrubVitalSigns(val);
        if (fmt) {
          if (fmt.line1) { lines.push(fmt.line1); emittedVitals = true; }
          if (fmt.line2) lines.push(fmt.line2);
        }
        return; // skip generic "Label: value."
      }

      const label = getControlLabelFromDOM('field', id);
      textParts.push(`${label}: ${val}.`);
    });
    if (textParts.length) lines.push(...textParts);

    // Header checkboxes (emit only if vitals didn’t already summarize)
    if (!emittedVitals) {
      const hdrChecks = QSA('input[type="checkbox"][data-check-id]', QS(SEL.headerSlot))
        .filter(input => !!sec.checks?.[input.getAttribute('data-check-id')])
        .map(input => formatPECheckLabel(getControlLabelFromDOM('check', input.getAttribute('data-check-id'))));
      if (hdrChecks.length) {
        lines.push(`${sub}: ${hdrChecks.join('. ')}.`);
      }
    }
  })();

  // --- Main content: positives first, then grouped negatives, then checks ---
  (function(){
    const contentRoot = QS(SEL.contentSlot);
    if (!contentRoot) {
      // ? No content root yet (e.g., initial load error) — return header-only lines
      return lines.join("\n");
    }

    const checks = QSA('input[type="checkbox"][data-check-id]', contentRoot)
      .map(el => el.getAttribute('data-check-id'));
    const chips  = QSA('[data-chip-id]', contentRoot)
      .map(el => el.getAttribute('data-chip-id'));

    const posParts = chips
      .filter(id => isPosChip(sec.chips?.[id]))
      .map(id => formatChipPosForOutput(id));

    const negPartsRaw = chips
      .filter(id => isNegChip(sec.chips?.[id]))
      .map(id => formatChipNegForOutput(id));

    const deniesItems = [];
    const noItems = [];
    negPartsRaw.forEach(t => {
      const s = String(t).trim();
      if (/^denies\b/i.test(s)) deniesItems.push(lcFirst(s.replace(/^denies\s+/i, "")));
      else if (/^no\b/i.test(s)) noItems.push(lcFirst(s.replace(/^no\s+/i, "")));
      else noItems.push(lcFirst(s.replace(/^(denies|no)\s+/i, "")));
    });

    const cbParts = checks
      .filter(id => !!sec.checks?.[id])
      .map(id => formatPECheckLabel(getControlLabelFromDOM('check', id)));

    if (posParts.length || deniesItems.length || noItems.length || cbParts.length){
      let line = `${sub}: `;

      if (posParts.length){
        const posPlainList = posParts.map((t,i)=> i===0 ? capFirst(t) : t);
        line += `${posPlainList.join("; ")}.` + ((deniesItems.length || noItems.length || cbParts.length) ? " " : "");
      }

      const negSentences = [];
      if (deniesItems.length) negSentences.push(`Denies ${joinWithOxford(deniesItems, "and")}.`);
      if (noItems.length)     negSentences.push(`No ${joinWithOxford(noItems, "or")}.`);
      if (cbParts.length)     negSentences.push(`${cbParts.join("; ")}.`);

      line += negSentences.join(" ");
      lines.push(line);
    }
  })();

  return lines.join("\n");
}

function buildCompleteNoteHTML(){
  const p = STATE.patientId;
  const ps = STATE.data[p] || {};
  const order = [MODES.SUBJECTIVE, MODES.ROS, MODES.PE, MODES.MSE];

  let html = '';
  for (const m of order) {
    const subs = ps[m] || {};
    const subNames = Object.keys(subs);
    if (!subNames.length) continue;

    html += `<section class="note-block"><h3>${m}</h3>`;
    for (const s of subNames) {
      // temporarily switch context to reuse the same builder (uses DOM labels)
      const prevMode = STATE.mode, prevSub = STATE.subtab;
      STATE.mode = m; STATE.subtab = (m === MODES.PE ? s : 'General');

      const txt = buildSectionOutput();

      STATE.mode = prevMode; STATE.subtab = prevSub;

      if (txt && txt.trim()) {
        const label = (m === MODES.PE) ? `${m} — ${s}` : m;
        html += `<div class="note-section"><strong>${label}:</strong> ${escapeHTML(txt).replace(/\n/g,'<br/>')}</div>`;
      }
    }
    html += `</section>`;
  }

  return html || '<em>(No content yet)</em>';
}

function escapeHTML(str) {
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}


// * Debug helpers (dev-only) – access from console via `NoteWriter.*`
window.NoteWriter = window.NoteWriter || {};
window.NoteWriter.dumpState = function () {
  const mode = STATE.mode;
  const sub  = (mode === MODES.PE ? STATE.subtab : 'General');
  const sec  = getSec(mode, sub);
  console.log('! dumpState', ts(), { mode, sub, sec });
};
window.NoteWriter.forceRender = function () {
  console.log('! forceRender', ts(), { mode: STATE.mode, subtab: STATE.subtab });
  renderOutputsNow();
};

/* ==========================================================================
   # Boot
   ========================================================================== */

async function init() {
  // Version stamp (optional)
  const ver = document.querySelector('[data-app-version]');
  if (ver) ver.textContent = APP_VERSION;

  wireDelegatedEvents();
  ensurePatientList();
  // Default highlight for current mode in tier-1 tabs
  highlightTier1(STATE.mode);
  await loadMode(STATE.mode);
  renderPatientControls();
  enhanceCompleteNoteUI();
}

document.addEventListener('DOMContentLoaded', init);
