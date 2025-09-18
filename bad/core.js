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

// Order for complete-note rebuilds (match app.js)
const MODE_ORDER = ['HPI','ROS','PE','MSE'];

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

// Inline <script type="application/json" id="..."> fallback reader (optional app.js parity)
function _readInlineFallback(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  try { return JSON.parse(el.textContent || ''); } catch { return null; }
}

export async function loadTemplates() {
  // NOTE: served over http(s); local file:// won’t allow fetch.
  TEMPLATES.HPI = await _loadWithCache('HPI', CONFIG.TEMPLATE_PATHS.HPI) || _readInlineFallback('tpl-hpi');
  TEMPLATES.ROS = await _loadWithCache('ROS', CONFIG.TEMPLATE_PATHS.ROS) || _readInlineFallback('tpl-ros');
  TEMPLATES.PE  = await _loadWithCache('PE',  CONFIG.TEMPLATE_PATHS.PE)  || _readInlineFallback('tpl-pe');
  TEMPLATES.MSE = await _loadWithCache('MSE', CONFIG.TEMPLATE_PATHS.MSE) || _readInlineFallback('tpl-mse');
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
export function getSectionDef(arg1, arg2, arg3) {
  // Overloads:
  //  (mode, sectionTitle, tpl)
  //  (sectionTitle, tpl)  // deprecated
  let mode, sectionTitle, tpl;

  if (arg3) {
    mode = String(arg1 || '').trim();
    sectionTitle = String(arg2 || '').trim();
    tpl = arg3;
  } else {
    // legacy: (sectionTitle, tpl)
    mode = State.mode?.() || 'HPI';
    sectionTitle = String(arg1 || '').trim();
    tpl = arg2;
  }

  if (!tpl || !tpl.sectionDefs) return null;

  // 1) canonical key: `${mode}:${sectionTitle}`
  const k = `${mode}:${sectionTitle}`;
  if (Object.prototype.hasOwnProperty.call(tpl.sectionDefs, k)) return tpl.sectionDefs[k];

  // 2) plain key: `sectionTitle`
  if (Object.prototype.hasOwnProperty.call(tpl.sectionDefs, sectionTitle)) return tpl.sectionDefs[sectionTitle];

  // 3) scan by def.title === sectionTitle
  const scanned = Object.values(tpl.sectionDefs).find(d => d && d.title === sectionTitle) || null;
  return scanned;
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

// Exported: collect all selectable ids for a logical section, including nested subsections
export function collectIdsForSection(mode, sectionTitle) {
  const def = getSectionDef(mode, sectionTitle);
  if (!def) return [];

  const ids = [];
  const add = (d) => {
    if (!d) return;
    if (Array.isArray(d.items)) ids.push(...d.items.map(i => i.id));
    if (Array.isArray(d.groups)) ids.push(...d.groups.flatMap(g => (g.items || []).map(i => i.id)));
    if (d.matrix?.rows) ids.push(...d.matrix.rows.map(r => r.id));
  };

  add(def);
  if (def.kind === 'subsections' && Array.isArray(def.subsections)) {
    for (const sub of def.subsections) add(sub);
  }
  return ids.filter(Boolean);
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
function phraseNeg(mode, negLabels) {
  if (!negLabels.length) return '';
  const lead = (mode === 'ROS') ? 'Denies' : 'No';
  return `${lead} ${joinList(negLabels)}.`;
}
// Normalize PE check labels (e.g., strip "+", expand "nl" to "Normal", capitalize)
function _formatPECheckLabel(raw){
  if (!raw) return '';
  let s = String(raw).trim().replace(/^\+\s*/, '');
  s = s.replace(/(^|\s)nl(\s|$)/i, (m,p1,p2)=>`${p1}Normal${p2}`);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function _formatPosWithMods(label, vObj, itemRef) {
  // Merge top-level shape ({state, side, grade, tags}) with our vObj.mods
  const parts = [];
  const baseLabel = String(label || '').replace(/^\+\s*/, '');

  const modsMerged = Object.assign(
    {},
    (vObj && vObj.mods) || {},
    (vObj && typeof vObj === 'object'
      ? {
          side:  vObj.side,
          grade: vObj.grade,
          ...(vObj.tags && typeof vObj.tags === 'object' ? vObj.tags : {})
        }
      : {})
  );

  // Side first
  if (modsMerged.side) parts.push(modsMerged.side);

  // Base label
  parts.push(baseLabel);

  // Grade label from template item if available; otherwise raw number
  if (typeof modsMerged.grade === 'number') {
    const labels = itemRef?.mods?.gradesLabels || itemRef?.mods?.grades || null;
    if (Array.isArray(labels)) {
      const gl = labels[modsMerged.grade];
      if (gl) parts.push(gl);
    } else {
      parts.push(String(modsMerged.grade));
    }
  }

  // Any truthy tag-like flags become trailing words
  const trailing = Object.entries(modsMerged)
    .filter(([k, v]) => !['side', 'grade'].includes(k) && !!v)
    .map(([k]) => k);
  if (trailing.length) parts.push(...trailing);

  return parts.join(' ');
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

// Debounced full rebuild of per-mode outputs, then complete note (match app.js)
let _rebuildTimer = null;
export function scheduleRebuildAllOutputs(cb) {
  if (_rebuildTimer) clearTimeout(_rebuildTimer);
  _rebuildTimer = setTimeout(() => {
    // Recompute every mode’s output from current selections
    for (const m of MODE_ORDER) {
      State.setOutput(m, State.assembleTab(m));
    }
    // Allow caller to refresh the UI after recompute
    if (typeof cb === 'function') cb();
  }, 150); // short debounce similar to app.js
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

        // --- restore/seed last-used mode + section like app.js ---
        let mode = storage.get(CONFIG.STORAGE.lastMode, null) || 'HPI';
        storage.set(CONFIG.STORAGE.lastMode, mode);

        const secKey = CONFIG.STORAGE.lastSection + mode;
        let section = storage.get(secKey, null);
        if (!section) {
          const first = (getSectionsForMode(mode) || [])[0] || null;
          if (first) storage.set(secKey, first);
        }
        return;
      }
    }

    // Fresh patient
    this.setPatient(this._makeId());

    // Seed last-used mode + section defaults (templates are already loaded by main.js)
    const mode = storage.get(CONFIG.STORAGE.lastMode, null) || 'HPI';
    storage.set(CONFIG.STORAGE.lastMode, mode);
    const first = (getSectionsForMode(mode) || [])[0] || null;
    if (first) storage.set(CONFIG.STORAGE.lastSection + mode, first);
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
// NEW: Build text from a single definition (items/groups/matrix), with checks support
function _buildTextFromDef(def, sel, mode) {
  if (!def) return '';

  const ids = collectItemIds(def);
  if (!ids.length) return '';

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

    const isCheck = (def.kind === 'checks') || (itemType === 'check');

    if (isCheck) {
      if (st === 'pos' || (st == null && text)) checkLabels.push(_formatPECheckLabel(lbl));
      continue; // ignore negs for checks
    }

    if (st === 'pos' || (st == null && text)) {
      const itemRef = itemRefOf(id, def);
      const fullLbl = (typeof v === 'object') ? _formatPosWithMods(lbl, v, itemRef) : lbl;
      const extra = (text ? text : ''); // modifiers already merged into fullLbl
      posPairs.push([fullLbl, extra.trim()]);
    } else if (st === 'neg') {
      negLabels.push(lbl);
    }
  }

  const parts = [];
  const posStr = phrasePos(posPairs);
  if (posStr) parts.push(posStr);
  const negStr = phraseNeg(mode, negLabels);
  if (negStr) parts.push(negStr);
  const chkStr = phraseChecks(checkLabels);
  if (chkStr) parts.push(chkStr);

  return parts.join(' ');
}

function buildSectionText(mode, sectionTitle) {
  const def = getSectionDef(mode, sectionTitle);
  if (!def) return '';

  const sel = State.getSelections(mode);

  // HPI-style free text fields: emit "Label: value." lines, honoring optional showIf gates
  if (Array.isArray(def.fields) && def.fields.length) {
    const lines = [];
    for (const f of def.fields) {
      // f: { id, label, showIf? }
      if (!f?.id) continue;
      // Optional gate: show only if another item is POS
      if (f.showIf) {
        const gate = sel[f.showIf];
        const gateState = (typeof gate === 'object') ? gate?.state : gate;
        if (gateState !== 'pos') continue;
      }
      const v = sel[f.id];
      // Accept either {state,text} or string as value carrier
      const text = (typeof v === 'object') ? (v.text || '') : (typeof v === 'string' ? v : '');
      const clean = (text || '').trim();
      if (clean) {
        const label = f.label || f.id;
        lines.push(`${label}: ${clean}.`);
      }
    }
    if (lines.length) return lines.join(' ');
    // fall through if nothing rendered so the rest of the builder can run
  }

  // Traverse nested subsections if present
  if (def.kind === 'subsections' && Array.isArray(def.subsections)) {
    const pieces = [];
    for (const sub of def.subsections) {
      const subText = _buildTextFromDef(sub, sel, mode);
      if (subText) pieces.push(subText);
    }
    return pieces.join(' ');
  }

  // Otherwise, build directly from the section definition
return _buildTextFromDef(def, sel, mode);
}

// ---- Debug dump (parity with app.js): show sectionsByMode + sectionDefs counts per mode
try {
  window.__CT_DUMP__ = () => {
    const modes = ['HPI','ROS','PE','MSE'];
    const out = {};
    for (const m of modes) {
      const tpl = getTemplate(m) || {};
      const byMode = (tpl.sectionsByMode && tpl.sectionsByMode[m]) ? tpl.sectionsByMode[m].slice() : [];
      const defsCount = tpl.sectionDefs ? Object.keys(tpl.sectionDefs).length : 0;
      out[m] = {
        hasTpl: !!tpl && !!(tpl.sectionsByMode || tpl.sectionDefs),
        sectionsByMode: byMode,
        sectionDefsCount: defsCount,
      };
    }
    console.log('[DUMP]', out);
    return out;
  };
} catch {}