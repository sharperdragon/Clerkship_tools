// app/core.js
// Config, template loader (with cache), state/cache, utils, section-aware builder

// ----- CONFIG (ids, classes, keys, timings) -----
export const CONFIG = {
  IDS: {
    tier1: '#tier1',          // top HPI/ROS/PE/MSE bar
    tier2: '#tier2',          // section tabs
    grid:  '#grid',           // panels/chips area
    out:   '#out',            // per-tab output textarea
    completeOut: '#completeOut', // always-visible cumulative note
    btnNewPatient: '#btnNewPatient',
    btnClearPatients: '#btnClearPatients',
  },
  CLASSES: {
    active: 'active',
    chip: 'chip',
    selected: 'selected',
    critical: 'critical',
    negative: 'neg',
  },
  STORAGE: {
    currentPatientId: 'cn_current_patient_id',
    patientsIndex:    'cn_patients_index',
    patientPrefix:    'cn_patient_',         // cn_patient_<id>
    lastMode:         'cn_last_mode',
    lastSection:      'cn_last_section_',    // cn_last_section_<mode>
  },
  AUTOSAVE_MS: 800, // debounced localStorage writes
  TEMPLATE_PATHS: {
    HPI: './template_HPI.json',
    ROS: './template_ROS.json',
    PE:  './template_pe.json',
    MSE: './template_MSE.json',   // NEW: MSE mode
  },
  // NEW: template cache controls
  TEMPLATE_TTL_MS: 24 * 60 * 60 * 1000, // 1 day
  TEMPLATE_VERSION: 'v1',               // bump to invalidate cached JSON
};

// ----- UTILS -----
export const qs  = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const el  = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c?.nodeType ? c : document.createTextNode(String(c ?? '')));
  return node;
};
export const debounce = (fn, ms) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};
export const storage = {
  get: (k, fallback = null) => {
    try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  rm: (k) => localStorage.removeItem(k),
};

// ----- SELECTION HELPERS -----
// Normalize any selection into: null | 'pos' | 'neg' | { state, text?, mods? }
export function normalizeSel(v) {
  if (v == null || v === 'pos' || v === 'neg') return v ?? null;
  if (typeof v === 'object') {
    const state = (v.state === 'pos' || v.state === 'neg') ? v.state : (v.state == null ? null : null);
    const text = (v.text ?? '').trim();
    const mods = v.mods && typeof v.mods === 'object' ? v.mods : undefined;
    const cleanMods = mods ? Object.fromEntries(Object.entries(mods).filter(([, val]) => !(val === '' || val === false || val == null))) : undefined;
    const payload = { state };
    if (text) payload.text = text;
    if (cleanMods && Object.keys(cleanMods).length) payload.mods = cleanMods;
    return (payload.text || payload.mods || payload.state != null) ? payload : null;
  }
  // strings treated as custom text => positive finding
  if (typeof v === 'string') {
    const t = v.trim();
    return t ? { state: 'pos', text: t } : null;
  }
  return null;
}
export function nextTriState(cur) {
  const s = (typeof cur === 'object') ? cur.state : cur;
  // neutral -> pos -> neutral (keep simple; right-click or minus handles 'neg')
  return s === 'pos' ? null : 'pos';
}
// Choose what right-click means in your app: 'pos' or 'neg'
export function rightClickState() { return 'pos'; }
export function minusToggle(cur) {
  const s = (typeof cur === 'object') ? cur.state : cur;
  return s === 'neg' ? null : 'neg';
}

// ----- TEMPLATE LOADER (with cache/TTL) -----
const TEMPLATES = { HPI: null, ROS: null, PE: null, MSE: null };

function _tplStorageKey(mode) { return `tpl_${CONFIG.TEMPLATE_VERSION}_${mode}`; }
function _tplMetaKey(mode)    { return `tpl_meta_${CONFIG.TEMPLATE_VERSION}_${mode}`; }

async function _loadWithCache(mode, path) {
  const meta = storage.get(_tplMetaKey(mode), null);
  const now = Date.now();
  if (meta?.ts && (now - meta.ts) < CONFIG.TEMPLATE_TTL_MS) {
    const cached = storage.get(_tplStorageKey(mode), null);
    if (cached) return cached;
  }
  const fresh = await (await fetch(path)).json();
  storage.set(_tplStorageKey(mode), fresh);
  storage.set(_tplMetaKey(mode), { ts: now });
  return fresh;
}

export async function loadTemplates() {
  // NOTE: served over http(s); local file:// won’t allow fetch.
  TEMPLATES.HPI = await _loadWithCache('HPI', CONFIG.TEMPLATE_PATHS.HPI);
  TEMPLATES.ROS = await _loadWithCache('ROS', CONFIG.TEMPLATE_PATHS.ROS);
  TEMPLATES.PE  = await _loadWithCache('PE',  CONFIG.TEMPLATE_PATHS.PE);
  TEMPLATES.MSE = await _loadWithCache('MSE', CONFIG.TEMPLATE_PATHS.MSE);
}

export function getTemplate(mode) {
  return TEMPLATES[mode] || null;
}

// ----- SECTION INDEXING (works with rich or simple schemas) -----
/*
Supports either schema:
A) Rich:
   { sectionsByMode: {HPI:[...], ROS:[...], PE:[...], MSE:[...]}, sectionDefs: { "Chief Complaint": {kind, items/groups/matrix...}, ... } }
B) Simple (fallback):
   { sections: [ { title, items: [...] }, ... ] }
*/
function getSectionsForMode(mode) {
  const tpl = getTemplate(mode) || {};
  if (tpl.sectionsByMode && tpl.sectionDefs) return tpl.sectionsByMode[mode] || [];
  if (Array.isArray(tpl.sections)) return tpl.sections.map(s => s.title).filter(Boolean);
  return [];
}
function getSectionDef(mode, sectionTitle) {
  const tpl = getTemplate(mode) || {};
  if (tpl.sectionDefs && tpl.sectionDefs[sectionTitle]) return tpl.sectionDefs[sectionTitle];
  if (Array.isArray(tpl.sections)) return tpl.sections.find(s => s.title === sectionTitle) || null;
  return null;
}
function buildItemIndex(def) {
  if (!def) return { byId: {}, allIds: [] };
  if (def.__index) return def.__index;

  const byId = {};
  const allIds = [];

  const indexItem = (it) => {
    if (!it?.id) return;
    byId[it.id] = { label: it.label ?? it.id, ref: it };
    allIds.push(it.id);
  };

  if (Array.isArray(def.items)) {
    def.items.forEach(indexItem);
  }
  if (Array.isArray(def.groups)) {
    def.groups.forEach(g => (g.items || []).forEach(indexItem));
  }
  if (def.matrix?.rows && Array.isArray(def.matrix.rows)) {
    def.matrix.rows.forEach(indexItem);
  }

  def.__index = { byId, allIds };
  return def.__index;
}
function labelOf(id, def) {
  const idx = buildItemIndex(def);
  return idx.byId[id]?.label || id;
}
function itemRefOf(id, def) {
  const idx = buildItemIndex(def);
  return idx.byId[id]?.ref || null;
}
function collectItemIds(def) {
  return buildItemIndex(def).allIds;
}

// ----- PHRASE HELPERS -----
function joinList(arr) {
  const a = arr.filter(Boolean);
  if (a.length === 0) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`;
}
function modsText(mods) {
  if (!mods || !Object.keys(mods).length) return '';
  return ` (${Object.values(mods).join(', ')})`;
}
function phraseNeg(negLabels) {
  if (!negLabels.length) return '';
  return `Denies ${joinList(negLabels)}.`;
}
function phrasePos(posPairs) {
  if (!posPairs.length) return '';
  // join positives with semicolons; ensure trailing period
  const s = posPairs.map(([lbl, extra]) => extra ? `${lbl} ${extra}` : lbl).join('; ');
  return s.endsWith('.') ? s : s + '.';
}
function phraseChecks(checkLabels) {
  if (!checkLabels.length) return '';
  // Join with sentences; keep short, neutral statements
  return checkLabels.map(l => `${l}.`).join(' ');
}

// ----- STATE -----
/*
Shape:
state = {
  patientId: 'p_2025-09-16_1930',
  selections: { HPI: {...}, ROS: {...}, PE: {...}, MSE: {...} }, // item -> 'pos'|'neg'|null|{state,text?,mods?}
  outputs:    { HPI: '', ROS: '', PE: '', MSE: '' },              // per-tab assembled
}
*/
const _state = {
  patientId: null,
  selections: { HPI: {}, ROS: {}, PE: {}, MSE: {} },
  outputs:    { HPI: '', ROS: '', PE: '', MSE: '' },
  _dirty: false,
};

const saveNow = () => {
  if (!_state.patientId) return;
  const key = CONFIG.STORAGE.patientPrefix + _state.patientId;
  storage.set(key, { selections: _state.selections, outputs: _state.outputs });
};

const debouncedSave = debounce(saveNow, CONFIG.AUTOSAVE_MS);

function ensureIndex(id) {
  const idx = storage.get(CONFIG.STORAGE.patientsIndex, []);
  if (!idx.includes(id)) {
    idx.unshift(id);
    storage.set(CONFIG.STORAGE.patientsIndex, idx.slice(0, 50)); // keep recent 50
  }
}

export const State = {
  init() {
    // restore current patient or create new
    const cur = storage.get(CONFIG.STORAGE.currentPatientId, null);
    if (cur) {
      const key = CONFIG.STORAGE.patientPrefix + cur;
      const data = storage.get(key, null);
      if (data) {
        _state.patientId = cur;
        _state.selections = Object.assign({ HPI: {}, ROS: {}, PE: {}, MSE: {} }, data.selections);
        _state.outputs    = Object.assign({ HPI: '', ROS: '', PE: '', MSE: '' }, data.outputs);
        return;
      }
    }
    // create new
    this.setPatient(this._makeId());
  },

  _makeId() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `p_${d.getFullYear()}-${mm}-${dd}_${hh}${mi}`;
  },

  setPatient(id) {
    _state.patientId = id;
    storage.set(CONFIG.STORAGE.currentPatientId, id);
    ensureIndex(id);
    // fresh state for new patient
    _state.selections = { HPI: {}, ROS: {}, PE: {}, MSE: {} };
    _state.outputs    = { HPI: '', ROS: '', PE: '', MSE: '' };
    debouncedSave();
  },

  listPatients() {
    return storage.get(CONFIG.STORAGE.patientsIndex, []);
  },

  clearPatients() {
    for (const id of this.listPatients()) {
      storage.rm(CONFIG.STORAGE.patientPrefix + id);
    }
    storage.set(CONFIG.STORAGE.patientsIndex, []);
    storage.rm(CONFIG.STORAGE.currentPatientId);
    this.setPatient(this._makeId());
  },

  patientId() { return _state.patientId; },

  mode(next) {
    if (next) storage.set(CONFIG.STORAGE.lastMode, next);
    return storage.get(CONFIG.STORAGE.lastMode, null);
  },

  section(mode, next) {
    const key = CONFIG.STORAGE.lastSection + mode;
    if (next) storage.set(key, next);
    return storage.get(key, null);
  },

  getSelections(mode) {
    return _state.selections[mode];
  },

  // UPDATED: accepts direct value or mutator function
  updateSelection(mode, id, mutatorOrValue) {
    const cur = _state.selections[mode][id] ?? null;
    const next = (typeof mutatorOrValue === 'function') ? mutatorOrValue(cur) : mutatorOrValue;
    _state.selections[mode][id] = normalizeSel(next);
    _state._dirty = true;
    debouncedSave();
  },

  // Convenience setters for events.js
  setPos(mode, id)       { this.updateSelection(mode, id, () => 'pos'); },
  setNeg(mode, id)       { this.updateSelection(mode, id, minusToggle); },
  cyclePos(mode, id)     { this.updateSelection(mode, id, nextTriState); },
  setText(mode, id, txt) {
    const text = (txt ?? '').trim();
    this.updateSelection(mode, id, (cur) => {
      const base = (typeof cur === 'object') ? cur : { state: cur ?? null };
      const state = base.state ?? (text ? 'pos' : null);
      const mods = base.mods && Object.keys(base.mods).length ? base.mods : undefined;
      const out = { state };
      if (text) out.text = text;
      if (mods) out.mods = mods;
      return out;
    });
  },
  setMod(mode, id, modId, value) {
    this.updateSelection(mode, id, (cur) => {
      const base = (typeof cur === 'object') ? cur : { state: cur ?? null };
      const mods = { ...(base.mods || {}) };
      if (value == null || value === false || value === '') delete mods[modId];
      else mods[modId] = value;
      const cleaned = Object.keys(mods).length ? mods : undefined;
      return { state: base.state ?? null, ...(base.text ? { text: base.text } : {}), ...(cleaned ? { mods: cleaned } : {}) };
    });
  },

  setOutput(mode, text) {
    _state.outputs[mode] = text || '';
    _state._dirty = true;
    debouncedSave();
  },

  getOutput(mode) {
    return _state.outputs[mode] || '';
  },

  // NEW: section-aware builder with positives → denies → checks (checks optional)
  assembleTab(mode) {
    const sections = getSectionsForMode(mode);
    const blocks = sections.map(sec => {
      const text = buildSectionText(mode, sec);
      return text ? `${sec}: ${text}` : '';
    }).filter(Boolean);
    return blocks.join('\n');
  },

  assembleComplete() {
    const modes = ['HPI', 'ROS', 'PE', 'MSE'];
    return modes
      .map(m => this.getOutput(m))
      .filter(Boolean)
      .join('\n\n');
  },
};

// ----- BUILDER (per-section) -----
function buildSectionText(mode, sectionTitle) {
  const def = getSectionDef(mode, sectionTitle);
  if (!def) return '';

  const ids = collectItemIds(def);
  if (!ids.length) return '';

  const sel = State.getSelections(mode);
  const posPairs = [];   // [label, extra]
  const negLabels = [];  // [label]
  const checkLabels = []; // simple neutral/affirmative statements (header/checks)

  for (const id of ids) {
    const v = sel[id];
    if (v == null) continue;

    const st = (typeof v === 'object') ? v.state : v;
    const text = (typeof v === 'object' ? v.text : (typeof v === 'string' ? v : '')) || '';
    const mods = (typeof v === 'object') ? v.mods : undefined;

    const itemRef = itemRefOf(id, def);
    const itemType = itemRef?.type || null; // e.g., 'check'
    const lbl = (itemRef?.label) || labelOf(id, def);
    if (!lbl) continue;

    // Header/check semantics: if section kind is 'checks' or item.type === 'check'
    const isCheck = (def.kind === 'checks') || (itemType === 'check');

    if (isCheck) {
      if (st === 'pos' || (st == null && text)) {
        checkLabels.push(lbl);
      }
      // ignore negs for checks
      continue;
    }

    if (st === 'pos' || (st == null && text)) {
      const extra = (text ? text : '') + (mods ? modsText(mods) : '');
      posPairs.push([lbl, extra.trim()]);
    } else if (st === 'neg') {
      negLabels.push(lbl);
    } else {
      // neutral: ignore
    }
  }

  const parts = [];
  const posStr = phrasePos(posPairs);
  if (posStr) parts.push(posStr);
  const negStr = phraseNeg(negLabels);
  if (negStr) parts.push(negStr);
  const chkStr = phraseChecks(checkLabels);
  if (chkStr) parts.push(chkStr);

  return parts.join(' ');
}