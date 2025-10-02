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
const ROUTES = {
  [MODES.SUBJECTIVE]: { file: './subjective.html', headerSel: '#headerItems', mainSel: '#grid' },
  [MODES.ROS]:        { file: './ROS.html',        headerSel: null,          mainSel: '#grid' },
  [MODES.MSE]:        { file: './MSE.html',        headerSel: null,          mainSel: '#grid' },
  [MODES.PE]: {
    header: { file: './PE_header.html',  sel: '#headerItems' },
    mains:  { General: { file: './PE_General.html', sel: '#grid' } },
    subtabs: ['General'], // extend later: ['General','Cardio','Lungs',...]
  },
};

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

function debounceFullNote(fn) {
  clearTimeout(_fullNoteTimer);
  _fullNoteTimer = setTimeout(fn, COMPLETE_NOTE_DEBOUNCE_MS);
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

function onClearPatients() {
  if (!confirm('Delete all saved patients and their note data? This cannot be undone.')) return;
  try {
    localStorage.removeItem(LS_KEYS.STATE);
    localStorage.removeItem(LS_KEYS.PATIENTS);
    localStorage.removeItem(LS_KEYS.ACTIVE_PATIENT);
  } catch {}
  // Reset in-memory state
  STATE.patientId = 'default';
  STATE.data = {
    default: {
      [MODES.SUBJECTIVE]: { General: bucket() },
      [MODES.ROS]:        { General: bucket() },
      [MODES.PE]:         { General: bucket() },
      [MODES.MSE]:        { General: bucket() },
    },
  };
  rehydrateFromState();
  renderOutputsNow();
}

/* ==========================================================================
   # Output Builders
   ========================================================================== */

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
  });
}

// Build concise output for the *current* mode/subtab by reading DOM (fields/checks/chips)
function buildSectionOutput() {
  const mode = STATE.mode;
  const sub  = (mode === MODES.PE ? STATE.subtab : 'General');
  const sec  = getSec(mode, sub);

  const chunks = [];

  // Fields
  for (const [k, v] of Object.entries(sec.fields)) {
    if (v != null && String(v).trim() !== '') chunks.push(`${k}: ${v}`);
  }

  // Checks (positive only)
  for (const [k, v] of Object.entries(sec.checks)) {
    if (v) chunks.push(`${k}: yes`);
  }

  // Chips
  const abn = Object.entries(sec.chips).filter(([,v]) => v === 'abn').map(([k]) => k);
  const neg = Object.entries(sec.chips).filter(([,v]) => v === 'neg').map(([k]) => k);
  if (abn.length) chunks.push(`abnormal: ${abn.join(', ')}`);
  if (neg.length) chunks.push(`negative: ${neg.join(', ')}`);

  return `[${mode}${mode===MODES.PE?`:${sub}`:''}] ` + (chunks.join(' | ') || '(no findings)');
}

// Build the full note by walking STATE (not DOM) and formatting to HTML
function buildCompleteNoteHTML() {
  const p = STATE.patientId;
  const ps = STATE.data[p] || {};
  const order = [MODES.SUBJECTIVE, MODES.ROS, MODES.PE, MODES.MSE];

  const secToText = (secObj) => {
    const chunks = [];
    for (const [k, v] of Object.entries(secObj.fields)) {
      if (v != null && String(v).trim() !== '') chunks.push(`${k}: ${v}`);
    }
    for (const [k, v] of Object.entries(secObj.checks)) {
      if (v) chunks.push(`${k}: yes`);
    }
    const abn = Object.entries(secObj.chips).filter(([,v]) => v === 'abn').map(([k]) => k);
    const neg = Object.entries(secObj.chips).filter(([,v]) => v === 'neg').map(([k]) => k);
    if (abn.length) chunks.push(`Abnormal: ${abn.join(', ')}`);
    if (neg.length) chunks.push(`Negative: ${neg.join(', ')}`);
    return chunks.join(' | ');
  };

  let html = '';
  for (const m of order) {
    const subs = ps[m] || {};
    const subNames = Object.keys(subs);
    if (!subNames.length) continue;

    html += `<section class="note-block"><h3>${m}</h3>`;
    for (const s of subNames) {
      const txt = secToText(subs[s]);
      if (!txt) continue;
      const label = (m === MODES.PE) ? `${m} — ${s}` : m;
      html += `<div class="note-section"><strong>${label}:</strong> ${escapeHTML(txt)}</div>`;
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

/* ==========================================================================
   # Boot
   ========================================================================== */

async function init() {
  // Version stamp (optional)
  const ver = document.querySelector('[data-app-version]');
  if (ver) ver.textContent = APP_VERSION;

  wireDelegatedEvents();
  // Default highlight for current patient in any patient UI (optional)
  highlightTier1(STATE.mode);
  await loadMode(STATE.mode);
}

document.addEventListener('DOMContentLoaded', init);
