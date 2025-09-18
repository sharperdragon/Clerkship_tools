// app/ui.js
// Rendering (tabs, panels, outputs) + layout helpers

import { CONFIG, qs, qsa, el, getSectionDef, scheduleRebuildAllOutputs } from './core.js';
import { State, getTemplate } from './core.js';

// Fatal error helper: wipe grid and show an error line
export function showFatal(msg) {
  const grid   = qs(CONFIG.IDS.grid) || document.getElementById('grid');
  const tier1  = qs(CONFIG.IDS.tier1) || document.getElementById('tier1');
  const tier2  = qs(CONFIG.IDS.tier2) || document.getElementById('tier2');
  const checks = document.querySelector('#headerChecks');
  const opts   = document.querySelector('#optionsBar');
  const out    = qs(CONFIG.IDS.out) || document.getElementById('out');
  const comp   = qs(CONFIG.IDS.completeOut) || document.getElementById('completeOut');

  // Clear structural hosts
  if (tier1) tier1.innerHTML = '';
  if (tier2) tier2.innerHTML = '';
  if (checks) { checks.innerHTML = ''; checks.style.display = 'none'; }
  if (opts)   { opts.innerHTML   = ''; opts.style.display   = 'none'; }

  if (grid) {
    grid.innerHTML = '';
    const line = document.createElement('div');
    line.textContent = `ERROR: ${msg}`;
    grid.append(line);
  }

  if (out)  out.value  = '';
  if (comp) comp.value = '';
}
// Render text/boolean fields with optional showIf logic
function renderFields(def, mode) {
  const wrap = el('div', { class: 'panel-fields' });
  const fields = def.fields || [];

  for (const f of fields) {
    // Conditional visibility
    if (f.showIf) {
      const dep = f.showIf.field;
      const equals = f.showIf.equals;
      const val = State.getField(mode, dep);
      if (val !== equals) continue;
    }

    const row = el('div', { class: 'field-row' });
    const label = el('label', { class: 'field-label' }, f.label || f.id);

    if (f.type === 'boolean') {
      // two radio buttons: Yes/No
      const yesId = `${f.id}_yes`;
      const noId  = `${f.id}_no`;
      const cur = !!State.getField(mode, f.id);

      const yes = el('input', { type: 'radio', name: `bool_${f.id}`, id: yesId });
      const no  = el('input', { type: 'radio', name: `bool_${f.id}`, id: noId });
      if (cur === true) yes.checked = true; else if (cur === false) no.checked = true;

      yes.addEventListener('change', () => {
        State.setField(mode, f.id, true);
        scheduleRebuildAllOutputs(() => renderOutputs(mode));
      });
      no.addEventListener('change', () => {
        State.setField(mode, f.id, false);
        scheduleRebuildAllOutputs(() => renderOutputs(mode));
      });

      const yesLbl = el('label', { for: yesId }, (f.ui?.trueLabel ?? 'Yes'));
      const noLbl  = el('label', { for: noId  }, (f.ui?.falseLabel ?? 'No'));

      row.append(label, yes, yesLbl, no, noLbl);
    } else {
      // default to text
      const input = el('input', { type: 'text', placeholder: f.placeholder || f.label || f.id, 'data-id': f.id });
      const cur = State.getField(mode, f.id) || '';
      if (cur) input.value = cur;
      input.addEventListener('input', (e) => {
        State.setField(mode, f.id, e.target.value);
        scheduleRebuildAllOutputs(() => renderOutputs(mode));
      });
      row.append(label, input);
    }

    wrap.append(row);
  }
  return wrap;
}

/* ===========================
   Selection helpers (visual)
   =========================== */
function selStateFor(mode, id) {
  const v = State.getSelections(mode)[id];
  return (typeof v === 'object') ? v.state : v; // 'pos'|'neg'|null
}
function selTextFor(mode, id) {
  const v = State.getSelections(mode)[id];
  return (typeof v === 'object') ? (v.text || '') : (typeof v === 'string' ? v : '');
}
function isSelectedPos(mode, id) {
  return selStateFor(mode, id) === 'pos';
}
function isSelectedNeg(mode, id) {
  return selStateFor(mode, id) === 'neg';
}

/* ===========
   Tier 1 tabs
   =========== */
export function renderTier1(activeMode) {
  const host = qs(CONFIG.IDS.tier1);
  host.innerHTML = '';
  // Now includes MSE
  ['HPI', 'ROS', 'PE', 'MSE'].forEach(mode => {
    const btn = el('button', { class: mode === activeMode ? CONFIG.CLASSES.active : '', 'data-mode': mode }, mode);
    host.append(btn);
  });
}

/* ===========
   Tier 2 tabs
   =========== */
export function renderTier2(mode, activeSection) {
  const host = qs(CONFIG.IDS.tier2);
  host.innerHTML = '';
  const tpl = getTemplate(mode);
  if (!tpl) return;

  // Prefer rich schema; fall back to simple
  const sections = (tpl.sectionsByMode && tpl.sectionDefs)
    ? (tpl.sectionsByMode[mode] || [])
    : (tpl.sections?.map(s => s.title) || []);

  // Determine active if not provided
  const current = activeSection || State.section(mode) || sections[0] || null;
  if (!current) return;

  sections.forEach(sec => {
    const btn = el('button', {
      class: sec === current ? CONFIG.CLASSES.active : '',
      'data-section': sec
    }, sec);
    host.append(btn);
  });

  // Persist last section
  State.section(mode, current);
}

// Header checks tray (render into #headerChecks)
export function renderHeaderChecks(mode) {
  const host = document.querySelector('#headerChecks');
  if (!host) return;
  host.innerHTML = '';

  const tpl = getTemplate(mode);
  if (!tpl) { host.style.display = 'none'; applyLayout(mode); return; }

  const section = State.section(mode) || '';
  const def = getSectionDef(tpl, mode, section);

  if (!def || !Array.isArray(def.headerChecks) || def.headerChecks.length === 0) {
    host.style.display = 'none';
    applyLayout(mode); // sticky heights change when tray hides
    return;
  }

  const row = el('div', { class: 'headerChecks-row' });
  for (const item of def.headerChecks) {
    const cell = el('div', { class: 'header-cell' });
    const id = item.id;
    const cb = el('input', { type: 'checkbox', id, 'data-id': id, 'data-headercheck': '1' });
    if (State.getSelections(mode)[id]?.state === 'pos') cb.checked = true;
    const lbl = el('label', { for: id }, item.label);
    cell.append(cb, lbl);
    row.append(cell);
  }
  host.append(row);
  host.style.display = ''; // show
  applyLayout(mode);       // sticky heights change when tray shows
}

// Options panel under header (if section defines headerToggles)
export function renderOptionsPanel(def, mode) {
  const host = document.querySelector('#optionsBar');
  if (!host) return;
  host.innerHTML = '';

  if (!Array.isArray(def.headerToggles) || !def.headerToggles.length) {
    host.style.display = 'none';
    applyLayout(mode);
    return;
  }

  const row = el('div', { class: 'options-row' });
  for (const t of def.headerToggles) {
    const slot = el('div', { class: 'option-cell' });
    const classes = [CONFIG.CLASSES.chip];
    if (State.getSelections(mode)[t.id]?.state === 'pos') classes.push(CONFIG.CLASSES.selected);
    const chip = el('div', { class: classes.join(' '), 'data-id': t.id }, t.label);
    const minus = el('button', { class: CONFIG.CLASSES.negative, 'data-id': t.id }, '–');
    slot.append(chip, minus);
    row.append(slot);
  }
  host.append(row);
  host.style.display = '';
  applyLayout(mode);
}

// Patient controls (dropdown + actions)
export function renderPatientControls() {
  const dd = document.querySelector('#patientSelect');
  const btnNew = document.querySelector(CONFIG.IDS.btnNewPatient);
  const btnClear = document.querySelector(CONFIG.IDS.btnClearPatients);
  if (!dd) return;

  const ids = State.listPatients();
  dd.innerHTML = '';
  for (const id of ids) {
    const opt = el('option', { value: id }, id);
    if (id === State.patientId()) opt.selected = true;
    dd.append(opt);
  }
  // Buttons exist; events.js binds their clicks.
}

/* ==================
   Section dispatcher
   ================== */
export function renderSection(mode, sectionTitle) {
  const host = qs(CONFIG.IDS.grid);
  host.innerHTML = '';

  State.mode(mode);
  State.section(mode, sectionTitle);

  const tpl = getTemplate(mode);
  if (!tpl) return;

  // Resolve section definition using canonical key (e.g., "ROS:General") with fallbacks
  const def = getSectionDef(tpl, mode, sectionTitle);

  if (!def) return;

  // If this section defines fields, render them first (HPI-style panels)
  if (Array.isArray(def.fields) && def.fields.length) {
    const node = renderFields(def, mode);
    if (node) host.append(node);
  }

  // Determine two-column condition for HPI parity
  let twoCol = false;
  if (mode === 'HPI') {
    if (Array.isArray(def.panels) && def.panels.length > 1) twoCol = true;
    else if (def.kind === 'subsections' && Array.isArray(def.subsections) && def.subsections.length > 1) twoCol = true;
    else if (Array.isArray(def.groups) && def.groups.length > 1) twoCol = true;
  }

  // 1) Header checks tray (always attempt; no-op if none)
  renderHeaderChecks(mode);

  // 2) Options panel (if present on this section)
  renderOptionsPanel(def, mode);

  // 3) Main body (dispatch to existing renderers)
  const kind = def.kind || 'chips';
  let node;
  if (kind === 'header')             node = renderHeader(def, mode);
  else if (kind === 'subsections')   node = renderSubsections(def, mode);
  else if (kind === 'chips')         node = renderChips(def, mode);
  else if (kind === 'checkboxes')    node = renderCheckboxes(def, mode);
  else if (kind === 'group')         node = renderGrouped(def, mode);
  else if (kind === 'matrix')        node = renderMatrix(def, mode);
  else                               node = renderChips(def, mode);

  if (node) host.append(node);

  // 4) Toggle two-column for HPI when multiple sub-blocks, then layout & outputs
  const grid = qs(CONFIG.IDS.grid);
  if (grid) {
    if (twoCol) grid.classList.add('two-col'); else grid.classList.remove('two-col');
  }
  applyLayout(mode);
  renderOutputs(mode);
}

/* ==================
   Renderers (kinds)
   ================== */
function renderHeader(def, mode) {
  const wrap = el('div', { class: 'panel-header' });

  // Optional Options toggle button (always present for convenience)
  const optsBtn = el('button', { 'data-action': 'toggle-options' }, 'Options');
  wrap.append(optsBtn);

  const row = el('div', { class: 'header-row' });
  const items = def.items || [];
  for (const item of items) {
    const cell = el('div', { class: 'header-cell' });

    if (item.type === 'check' || item.kind === 'check') {
      const id = item.id;
      const cb = el('input', { type: 'checkbox', id, 'data-id': id });
      if (isSelectedPos(mode, id)) cb.checked = true;
      const lbl = el('label', { for: id }, item.label);
      cell.append(cb, lbl);
    } else {
      // Chip-like header control
      const classes = [CONFIG.CLASSES.chip];
      if (item.critical) classes.push(CONFIG.CLASSES.critical);
      if (isSelectedPos(mode, item.id)) classes.push(CONFIG.CLASSES.selected);
      const chip = el('div', { class: classes.join(' '), 'data-id': item.id }, item.label);
      cell.append(chip);

      // Minus for NEG where applicable
      const minus = el('button', { class: CONFIG.CLASSES.negative, 'data-id': item.id }, '–');
      if (isSelectedNeg(mode, item.id)) minus.classList.add(CONFIG.CLASSES.selected);
      cell.append(minus);

      // Optional text input
      if (item.allowText) {
        const txt = el('input', { type: 'text', 'data-id': item.id, placeholder: 'detail…' });
        const val = selTextFor(mode, item.id);
        if (val) txt.value = val;
        cell.append(txt);
      }

      // Optional modifiers
      if (Array.isArray(item.modifiers)) {
        for (const m of item.modifiers) {
          if (m.type === 'select') {
            const sel = el('select', { 'data-id': item.id, 'data-mod': m.id });
            const opt0 = el('option', { value: '' }, m.label || '(select)');
            sel.append(opt0);
            for (const o of (m.options || [])) sel.append(el('option', { value: o }, o));
            cell.append(sel);
          } else if (m.type === 'toggle') {
            const cb = el('input', { type: 'checkbox', 'data-id': item.id, 'data-mod': m.id });
            const lbl = el('label', {}, m.label || m.id);
            cell.append(cb, lbl);
          }
        }
      }
    }

    row.append(cell);
  }

  wrap.append(row);

  // Optional collapsible area (CSS controls visibility via .hidden)
  const optionsBar = qs('#optionsBar');
  if (!optionsBar) {
    const opt = el('div', { id: 'optionsBar', class: 'options hidden' });
    wrap.append(opt);
  }

  return wrap;
}

function renderChips(def, mode) {
  const wrap = el('div', { class: 'panel-grid' });
  const items = def.items || [];

  for (const item of items) {
    const cell = el('div', { class: 'panel-cell' });

    // Main chip
    const classes = [CONFIG.CLASSES.chip];
    if (item.critical) classes.push(CONFIG.CLASSES.critical);
    if (isSelectedPos(mode, item.id)) classes.push(CONFIG.CLASSES.selected);
    const chip = el('div', { class: classes.join(' '), 'data-id': item.id }, item.label);
    cell.append(chip);

    // Minus button for NEG toggle
    const minus = el('button', { class: CONFIG.CLASSES.negative, 'data-id': item.id, title: 'Mark as negative' }, '–');
    if (isSelectedNeg(mode, item.id)) minus.classList.add(CONFIG.CLASSES.selected); // purely visual if desired
    cell.append(minus);

    // Optional text input
    if (item.allowText) {
      const txt = el('input', { type: 'text', 'data-id': item.id, placeholder: 'detail…' });
      const val = selTextFor(mode, item.id);
      if (val) txt.value = val;
      cell.append(txt);
    }

    // Optional modifiers
    if (Array.isArray(item.modifiers)) {
      for (const m of item.modifiers) {
        if (m.type === 'select') {
          const sel = el('select', { 'data-id': item.id, 'data-mod': m.id });
          const opt0 = el('option', { value: '' }, m.label || '(select)');
          sel.append(opt0);
          for (const o of (m.options || [])) {
            sel.append(el('option', { value: o }, o));
          }
          cell.append(sel);
        } else if (m.type === 'toggle') {
          const cb = el('input', { type: 'checkbox', 'data-id': item.id, 'data-mod': m.id });
          const lbl = el('label', {}, m.label || m.id);
          cell.append(cb, lbl);
        }
      }
    }

    wrap.append(cell);
  }
  return wrap;
}

function renderCheckboxes(def, mode) {
  const wrap = el('div', { class: 'panel-grid' });
  const items = def.items || [];
  for (const item of items) {
    const cell = el('div', { class: 'panel-cell' });
    const id = item.id;
    const cb = el('input', { type: 'checkbox', id, 'data-id': id });
    if (isSelectedPos(mode, id)) cb.checked = true;
    const lbl = el('label', { for: id }, item.label);
    cell.append(cb, lbl);
    wrap.append(cell);
  }
  return wrap;
}

function renderGrouped(def, mode) {
  const wrap = el('div', { class: 'panel-grid grouped' });
  for (const group of (def.groups || [])) {
    const block = el('div', { class: 'panel-group' });
    if (group.title) block.append(el('div', { class: 'group-title' }, group.title));

    for (const item of (group.items || [])) {
      const cell = el('div', { class: 'panel-cell' });
      if (item.type === 'checkbox') {
        const cb = el('input', { type: 'checkbox', id: item.id, 'data-id': item.id });
        if (isSelectedPos(mode, item.id)) cb.checked = true;
        const lbl = el('label', { for: item.id }, item.label);
        cell.append(cb, lbl);
      } else { // default to chips
        const classes = [CONFIG.CLASSES.chip];
        if (item.critical) classes.push(CONFIG.CLASSES.critical);
        if (isSelectedPos(mode, item.id)) classes.push(CONFIG.CLASSES.selected);
        const chip = el('div', { class: classes.join(' '), 'data-id': item.id }, item.label);
        cell.append(chip);

        const minus = el('button', { class: CONFIG.CLASSES.negative, 'data-id': item.id }, '–');
        if (isSelectedNeg(mode, item.id)) minus.classList.add(CONFIG.CLASSES.selected);
        cell.append(minus);

        if (item.allowText) {
          const txt = el('input', { type: 'text', 'data-id': item.id, placeholder: 'detail…' });
          const val = selTextFor(mode, item.id);
          if (val) txt.value = val;
          cell.append(txt);
        }
      }

      // Modifiers if any
      if (Array.isArray(item.modifiers)) {
        for (const m of item.modifiers) {
          if (m.type === 'select') {
            const sel = el('select', { 'data-id': item.id, 'data-mod': m.id });
            const opt0 = el('option', { value: '' }, m.label || '(select)');
            sel.append(opt0);
            for (const o of (m.options || [])) {
              sel.append(el('option', { value: o }, o));
            }
            cell.append(sel);
          } else if (m.type === 'toggle') {
            const cb = el('input', { type: 'checkbox', 'data-id': item.id, 'data-mod': m.id });
            const lbl = el('label', {}, m.label || m.id);
            cell.append(cb, lbl);
          }
        }
      }

      block.append(cell);
    }
    wrap.append(block);
  }
  return wrap;
}

function renderMatrix(def, mode) {
  const wrap = el('div', { class: 'panel-matrix' });

  // Controls
  const controls = el('div', { class: 'matrix-controls' });
  controls.append(
    el('button', { 'data-action': 'matrix-set-all' }, 'Set all normal'),
    el('button', { 'data-action': 'matrix-clear' }, 'Clear all')
  );
  wrap.append(controls);

  const table = el('div', { class: 'matrix-grid' });
  const rows = def.matrix?.rows || [];
  const cols = def.matrix?.cols || [];

  // Header row
  const header = el('div', { class: 'matrix-row header' });
  header.append(el('div', { class: 'matrix-cell head' }, '')); // corner
  for (const c of cols) header.append(el('div', { class: 'matrix-cell head' }, c.label));
  table.append(header);

  for (const r of rows) {
    const rowEl = el('div', { class: 'matrix-row' });
    rowEl.append(el('div', { class: 'matrix-cell row-label' }, r.label));

    // For simplicity, treat matrix as checkbox selection per row (normal vs not)
    // Events can map column clicks to modifiers if needed.
    for (const c of cols) {
      const id = r.id; // one state per row; columns may map to modifiers
      const cell = el('div', { class: 'matrix-cell' });
      const cb = el('input', { type: 'checkbox', 'data-id': id, 'data-matrix-col': c.id });
      if (isSelectedPos(mode, id)) cb.checked = true;
      cell.append(cb);
      rowEl.append(cell);
    }
    table.append(rowEl);
  }

  wrap.append(table);
  return wrap;
}

function renderSubsections(def, mode) {
  const wrap = el('div', { class: 'panel-subsections' });
  const subs = def.subsections || [];
  for (const sub of subs) {
    const block = el('div', { class: 'subsection' });
    if (sub.title) block.append(el('div', { class: 'sub-title' }, sub.title));
    if (Array.isArray(sub.fields) && sub.fields.length) {
      block.append(renderFields(sub, mode));
    }
    let body;
    const k = sub.kind || 'chips';
    if (k === 'chips')          body = renderChips(sub, mode);
    else if (k === 'checkboxes') body = renderCheckboxes(sub, mode);
    else if (k === 'group')      body = renderGrouped(sub, mode);
    else if (k === 'matrix')     body = renderMatrix(sub, mode);
    else                         body = renderChips(sub, mode);

    block.append(body);
    wrap.append(block);
  }
  return wrap;
}

/* ===================
   Outputs (textareas)
   =================== */
export function renderOutputs(mode) {
  const out = qs(CONFIG.IDS.out);
  const complete = qs(CONFIG.IDS.completeOut);

  // Always regenerate current tab text from state to avoid staleness
  State.setOutput(mode, State.assembleTab(mode));

  out.value = State.getOutput(mode);
  complete.value = State.assembleComplete();
}

/* =================
   Layout / stickies
   ================= */
export function applyLayout(mode) {
  const appbar = document.querySelector('.appbar');
  const tier1  = qs(CONFIG.IDS.tier1);
  const tier2  = qs(CONFIG.IDS.tier2);
  const checks = document.querySelector('#headerChecks');
  const grid   = qs(CONFIG.IDS.grid);

  if (!tier1 || !tier2 || !checks || !grid) return;

  const px = (n) => `${Math.max(0, Math.round(n))}px`;

  // STK parity with app.js (fallback mins + z order)
  const STK = {
    appbarMin: 38,
    tier1Min:  36,
    tier2Min:  36,
    z: { appbar: 6, tier1: 5, tier2: 4, checks: 3 }
  };

  const appbarH = appbar?.getBoundingClientRect?.().height || STK.appbarMin;
  const t1H     = tier1.getBoundingClientRect?.().height   || STK.tier1Min;
  const t2H     = tier2.getBoundingClientRect?.().height   || STK.tier2Min;

  // Tier 1 sticky under appbar
  tier1.style.position = 'sticky';
  tier1.style.top      = px(appbarH);
  tier1.style.zIndex   = String(STK.z.tier1);
  if (!tier1.style.background) tier1.style.background = '#eef2f7';

  // Tier 2 sticky under Tier 1
  tier2.style.position = 'sticky';
  tier2.style.top      = px(appbarH + t1H);
  tier2.style.zIndex   = String(STK.z.tier2);
  if (!tier2.style.background) tier2.style.background = '#f6f8fb';

  // Header checks sticky under Tier 2
  const checksTop = appbarH + t1H + t2H;
  checks.style.position = 'sticky';
  checks.style.top      = px(checksTop);
  checks.style.zIndex   = String(STK.z.checks);
  if (!checks.style.background)   checks.style.background   = '#fff';
  if (!checks.style.borderBottom) checks.style.borderBottom = '1px solid var(--divider)';

  // Improve initial scroll anchoring when jumping within grid
  const checksH = checks.getBoundingClientRect?.().height || 0;
  const stickyStack = checksTop + checksH; // total vertical stack above grid content
  grid.style.scrollMarginTop = px(stickyStack);

  // Re-apply on resize (debounced)
  if (!applyLayout._bound) {
    applyLayout._bound = true;
    const deb = (fn, ms=120)=>{ let t; return ()=>{ clearTimeout(t); t=setTimeout(fn, ms); }; };
    window.addEventListener('resize', deb(() => applyLayout(mode)), { passive: true });
  }
}

// ----- BEGIN panels-compatible renderer (parity with app.js) -----
grid.innerHTML = '';
if (!def) return;

const px = (n) => `${Math.max(0, Math.round(n))}px`;

// 1) Fields-first (HPI-style panel fields appear at the top)
const renderField = (f) => {
  // Respect conditional visibility
  if (f.showIf) {
    const depVal = getField(f.showIf.field); // use your core helper
    if (depVal !== f.showIf.equals) return null;
  }
  const wrap = document.createElement('label');
  wrap.className = 'field';

  const span = document.createElement('span');
  span.className = 'field-label';
  span.textContent = f.label;

  if (f.type === 'boolean') {
    // Yes/No radio pair (parity with app.js)
    const fs = document.createElement('fieldset');
    fs.className = 'field field-boolean';
    const legend = document.createElement('legend');
    legend.className = 'field-label';
    legend.textContent = f.label;
    fs.appendChild(legend);

    const mkOpt = (lab, val) => {
      const optWrap = document.createElement('label');
      optWrap.className = 'bool-opt';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `bool_${f.id}`;
      input.checked = getField(f.id) === val;
      input.onchange = () => { setField(f.id, val); renderSection(mode, sectionTitle); renderOutputs(mode); };
      const span = document.createElement('span');
      span.textContent = lab;
      optWrap.append(input, span);
      return optWrap;
    };

    fs.appendChild(mkOpt((f.ui && f.ui.trueLabel) || 'Yes', true));
    fs.appendChild(mkOpt((f.ui && f.ui.falseLabel) || 'No',  false));
    return fs;
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = (getField(f.id) || '');
    input.placeholder = f.placeholder || f.label;
    input.oninput = (e) => { setField(f.id, e.target.value); renderOutputs(mode); };
    wrap.append(span, input);
    return wrap;
  }
};

// If any panel contains fields, render those fields first (HPI)
const panelsWithFields = (def.panels || []).filter(p => Array.isArray(p.fields) && p.fields.length);
if (panelsWithFields.length) {
  const fieldsRow = document.createElement('div');
  fieldsRow.className = 'row fields';
  // flatten all fields (multiple HPI panels)
  panelsWithFields.forEach(p => p.fields.forEach(f => {
    const node = renderField(f);
    if (node) fieldsRow.appendChild(node);
  }));
  grid.appendChild(fieldsRow);
}

// 2) Panels proper (checkboxes/chips/etc.)
(def.panels || []).forEach(pd => {
  const panel = document.createElement('section');
  panel.className = 'panel';

  const h = document.createElement('div');
  h.className = 'panel-header';
  h.textContent = pd.title || '';
  panel.appendChild(h);

  // Checkboxes
  if (Array.isArray(pd.checkboxes) && pd.checkboxes.length) {
    const row = document.createElement('div');
    row.className = 'row';
    pd.checkboxes.forEach(c => {
      const w = document.createElement('label'); w.className = 'cb';
      const i = document.createElement('input'); i.type = 'checkbox';
      i.checked = !!getSec().checkboxes?.[c.id];
      // keep 'selected' CSS in sync
      const syncSel = () => { if (i.checked) w.classList.add('selected'); else w.classList.remove('selected'); };
      syncSel();
      i.onchange = (e) => { setCB(c.id, e.target.checked); syncSel(); renderOutputs(mode); };
      w.append(i, document.createTextNode(c.label));
      row.appendChild(w);
    });
    panel.appendChild(row);
  }

  // Chips (optional; future-proof)
  if (Array.isArray(pd.chips) && pd.chips.length) {
    const row = document.createElement('div');
    row.className = 'row';
    pd.chips.forEach(ch => {
      const d = document.createElement('div');
      d.className = 'chip';
      d.textContent = ch.label;
      d.oncontextmenu = (e) => e.preventDefault();
      d.onmousedown = (e) => {
        e.preventDefault();
        if (e.button === 2) { setChipPos(ch.id); }    // right → abnormal/present
        else if (e.button === 0) {                    // left → normal/absent toggle
          const cur = getSec().chips?.[ch.id] || 0;
          getSec().chips[ch.id] = (cur === 'neg') ? 0 : 'neg';
          saveStateSoon?.();
        }
        renderSection(mode, sectionTitle);
        renderOutputs(mode);
        renderCompleteSoon?.();
      };
      row.appendChild(d);
    });
    panel.appendChild(row);
  }

  grid.appendChild(panel);
});

// Nothing? leave a hint for debugging
if (!grid.childElementCount) {
  const msg = document.createElement('div');
  msg.className = 'row';
  msg.textContent = '(No renderable content in section definition)';
  grid.appendChild(msg);
}


function renderGrid(){
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  // Update grid class to include current mode
  grid.className = "section-grid " + state.mode;
  const def = Templates.sectionDefs[`${state.mode}:${state.activeSection}`];
  if(!def){ grid.textContent = "No schema yet."; return; }
  
  // Dynamic two-column layout for HPI when multiple panels exist
  if (state.mode === "HPI") {
    const panels = (def.panels || []);
    if (panels.length > 1) {
      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "1fr 1fr";
      grid.style.gap = "8px";
    } else {
      grid.style.display = "";
      grid.style.gridTemplateColumns = "";
      grid.style.gap = "";
    }
  } else {
    grid.style.display = "";
    grid.style.gridTemplateColumns = "";
    grid.style.gap = "";
  }

  if (def.headerToggles?.length){
    const p = panel("Options");
    p.classList.add("options"); // style Options panel like Epic header tray
    const row = makeRow();
    def.headerToggles.forEach(t=>{
      row.appendChild(cb(t.id, t.label, !!getSec().checkboxes?.[t.id], v=>{ setCB(t.id,v); renderOutput(); }));
    });
    p.appendChild(row); grid.appendChild(p);
  }
  // panels
  (def.panels||[]).forEach(pd=>{
    const p = panel(pd.title);
    if (pd.groupLabel){
      const h = document.createElement("div");
      h.className = "subhead";
      h.textContent = pd.groupLabel;
      p.appendChild(h);
    }
    // matrix panel support
    if (pd.type === "matrix") { 
      grid.appendChild(renderMatrixPanel(pd)); 
      return; 
    }
    // subsections support (e.g., HENT with Head / Ears / Nose / Mouth/Throat)
    if (pd.subsections && pd.subsections.length){
      // 1) Grouped rendering (e.g., HENT Ears: Right | Left)
      if (pd.layout?.groups?.length){
        const rendered = new Set();

        pd.layout.groups.forEach(g => {
          if (g.label){
            const gh = document.createElement("div");
            gh.className = "subhead group-head";
            gh.textContent = g.label;
            p.appendChild(gh);
          }
          const sg = document.createElement("div");
          sg.className = `subgrid cols-${g.cols || 2}`;

          for (let i = g.from; i <= g.to && i < pd.subsections.length; i++){
            rendered.add(i);
            const ss = pd.subsections[i];

            const box = document.createElement("div");
            box.className = "subpanel";

            const sh = document.createElement("div");
            sh.className = "subhead";
            sh.textContent = ss.title;
            box.appendChild(sh);

            if (ss.checkboxes?.length){
              const rr = makeRow();
              ss.checkboxes.forEach(c=>{
                rr.appendChild(cb(c.id, c.label, !!getSec().checkboxes?.[c.id], v=>{ setCB(c.id, v); renderOutput(); }));
              });
              box.appendChild(rr);
            }
            if (ss.chips?.length){
              const rr = makeRow();
              if (ss.layout?.chipCols) rr.classList.add(`cols-${ss.layout.chipCols}`);
              ss.chips.forEach(ch=>{
                const value = getSec().chips?.[ch.id] || 0;
                rr.appendChild(chip(ch, value, (evt)=>handleChipMouse(evt, ch.id)));
              });
              box.appendChild(rr);
            }

            sg.appendChild(box);
          }
          p.appendChild(sg);
        });

        // Render remaining subsections (not in any group)
        pd.subsections.forEach((ss, idx)=>{
          if (rendered.has(idx)) return;
          const sh = document.createElement("div");
          sh.className = "subhead";
          sh.textContent = ss.title;
          p.appendChild(sh);

          if (ss.checkboxes?.length){
            const rr = makeRow();
            ss.checkboxes.forEach(c=>{
              rr.appendChild(cb(c.id, c.label, !!getSec().checkboxes?.[c.id], v=>{ setCB(c.id, v); renderOutput(); }));
            });
            p.appendChild(rr);
          }
          if (ss.chips?.length){
            const rr = makeRow();
            if (ss.layout?.chipCols) rr.classList.add(`cols-${ss.layout.chipCols}`);
            ss.chips.forEach(ch=>{
              const value = getSec().chips?.[ch.id] || 0;
              rr.appendChild(chip(ch, value, (evt)=>handleChipMouse(evt, ch.id)));
            });
            p.appendChild(rr);
          }
        });

        grid.appendChild(p);
        return; // handled this panel via groups
      }

      // 2) Legacy subgrid hint (Cardio: Rate | Rhythm)
      const useGrid = pd.layout && pd.layout.gridCols;
      const cut = typeof pd.layout?.gridUntilIndex === "number" ? pd.layout.gridUntilIndex : -1;

      if (useGrid && cut >= 0) {
        const subgrid = document.createElement("div");
        subgrid.className = `subgrid cols-${pd.layout.gridCols}`;

        for (let i = 0; i <= cut && i < pd.subsections.length; i++){
          const ss = pd.subsections[i];
          const box = document.createElement("div");
          box.className = "subpanel";

          const sh = document.createElement("div");
          sh.className = "subhead";
          sh.textContent = ss.title;
          box.appendChild(sh);

          if (ss.checkboxes?.length){
            const rr = makeRow();
            ss.checkboxes.forEach(c=>{
              rr.appendChild(cb(c.id, c.label, !!getSec().checkboxes?.[c.id], v=>{ setCB(c.id, v); renderOutput(); }));
            });
            box.appendChild(rr);
          }
          if (ss.chips?.length){
            const rr = makeRow();
            ss.chips.forEach(ch=>{
              const value = getSec().chips?.[ch.id] || 0;
              rr.appendChild(chip(ch, value, (evt)=>handleChipMouse(evt, ch.id)));
            });
            box.appendChild(rr);
          }
          subgrid.appendChild(box);
        }
        p.appendChild(subgrid);

        for (let i = cut + 1; i < pd.subsections.length; i++){
          const ss = pd.subsections[i];
          const sh = document.createElement("div");
          sh.className = "subhead";
          sh.textContent = ss.title;
          p.appendChild(sh);

          if (ss.checkboxes?.length){
            const rr = makeRow();
            ss.checkboxes.forEach(c=>{
              rr.appendChild(cb(c.id, c.label, !!getSec().checkboxes?.[c.id], v=>{ setCB(c.id, v); renderOutput(); }));
            });
            p.appendChild(rr);
          }
          if (ss.chips?.length){
            const rr = makeRow();
            ss.chips.forEach(ch=>{
              const value = getSec().chips?.[ch.id] || 0;
              rr.appendChild(chip(ch, value, (evt)=>handleChipMouse(evt, ch.id)));
            });
            p.appendChild(rr);
          }
        }
        grid.appendChild(p);
        return; // done with this panel
      }

      // 3) Fallback: stacked subsections
      pd.subsections.forEach(ss=>{
        const sh = document.createElement("div");
        sh.className = "subhead";
        sh.textContent = ss.title;
        p.appendChild(sh);
        if (ss.checkboxes?.length){
          const rr = makeRow();
          ss.checkboxes.forEach(c=>{
            rr.appendChild(cb(c.id, c.label, !!getSec().checkboxes?.[c.id], v=>{ setCB(c.id, v); renderOutput(); }));
          });
          p.appendChild(rr);
        }
        if (ss.chips?.length){
          const rr = makeRow();
          if (ss.layout?.chipCols) rr.classList.add(`cols-${ss.layout.chipCols}`);
          ss.chips.forEach(ch=>{
            const value = getSec().chips?.[ch.id] || 0;
            rr.appendChild(chip(ch, value, (evt)=>handleChipMouse(evt, ch.id)));
          });
          p.appendChild(rr);
        }
      });
      grid.appendChild(p);
      return; // skip the normal checkboxes/chips path for this panel
    }
    if (pd.fields?.length){
      pd.fields.forEach(f => {
        // respect conditional visibility
        if (!shouldShowField(f)) return;

        const r = makeRow();
        const val = getField(f.id);

        if (f.type === "boolean") {
          r.appendChild(
            fieldBoolean(
              f.id,
              f.label,
              typeof val === "boolean" ? val : false, // default false
              (v) => { setField(f.id, v); renderGrid(); renderOutput(); renderCompleteSoon(); }, // re-render to show/hide dependents
              f.ui || {}
            )
          );
        } else {
          r.appendChild(
            fieldText(
              f.id,
              f.label,
              val,
              (v) => { setField(f.id, v); renderOutput(); renderCompleteSoon(); },
              f.placeholder
            )
);
        }

        p.appendChild(r);
      });
    }
    if (pd.checkboxes?.length){
      const r = makeRow();
      pd.checkboxes.forEach(c=> r.appendChild(cb(c.id,c.label,!!getSec().checkboxes?.[c.id], v=>{ setCB(c.id,v); renderOutput(); })));
      p.appendChild(r);
    }
    if (pd.chips?.length){
      const r = makeRow();
      pd.chips.forEach(ch=>{
        const value = getSec().chips?.[ch.id] || 0; // 0 | 'neg' | {state:'pos', ...}
        r.appendChild(
          chip(ch, value, (evt)=>handleChipMouse(evt, ch.id))
        );
      });
      p.appendChild(r);
    }
    grid.appendChild(p);
  });
}




function renderOutput(){
  // Build preview for the CURRENT section only,
  // separating section-level header checks from panel items.
  const ta = document.getElementById("out");
  const secKey = `${state.mode}:${state.activeSection}`;
  const def = Templates.sectionDefs[secKey];
  const sec = state.sections[secKey] || { checkboxes:{}, chips:{} };

  if (!def) { if (ta) ta.value = ""; return; }

  const lines = [];

  // Header checks line (admin-style statements)
  if (def.headerChecks?.length) {
    const checks = def.headerChecks
      .filter(h => !!sec.checkboxes?.[h.id])
      .map(h => formatPECheckLabel(h.label));
    if (checks.length) {
      lines.push(`${state.activeSection}: ${checks.join(". ")}.`);
    }
  }

  (def.panels || []).forEach(pd => {
    // collect items from panel + any subsections
    const _cbs   = [...(pd.checkboxes || [])];
    const _chips = [...(pd.chips || [])];
    (pd.subsections || []).forEach(ss=>{
      _cbs.push(...(ss.checkboxes || []));
      _chips.push(...(ss.chips || []));
    });

    const cbIds  = _cbs.map(c => c.id);
    const chipDs = _chips;

    // HPI panels: only emit visible text fields with content.
    // Skip boolean flag fields entirely (they just gate visibility).
    if (state.mode === "HPI" && pd.fields?.length){
      pd.fields.forEach(f => {
        if (!shouldShowField(f)) return;
        if (f.type === "boolean") return; // don't output Yes/No line

        const raw = getSec().fields?.[f.id];
        const v = (typeof raw === "string" ? raw : "").trim();
        if (v) lines.push(`${f.label}: ${v}.`);
      });
      return; // continue to next panel
    }

    const cbParts = cbIds
      .filter(id => !!sec.checkboxes?.[id])
      .map(id => formatPECheckLabel(labelFor(secKey, id)));

    const negParts = chipDs
      .filter(d => isNeg(sec.chips?.[d.id]))
      .map(d => formatChipNegForOutput(secKey, d.id));

    const posParts = chipDs
      .filter(d => isPos(sec.chips?.[d.id]))
      .map(d => formatChipForOutput(secKey, d.id, sec.chips[d.id]));

    // When there are positives, emit two sentences:
    //   1) Positives first (capitalize the first positive), ending with a period.
    //   2) Negatives/checkboxes next as a second sentence; keep first "No"/"Denies" capitalized
    //      and lowercase subsequent occurrences ("no"/"denies") within the same sentence.
    if (posParts.length || negParts.length || cbParts.length) {
      let linePlain = `${pd.title}: `;

      if (posParts.length) {
        const posPlainList = posParts.map((t,i)=> i===0 ? capFirst(t) : t);
        const posPlainSent = `${posPlainList.join("; ")}.`;
        linePlain += posPlainSent + (negParts.length || cbParts.length ? " " : "");
      }

      // Group negatives by lead-in and collapse into list(s)
      if (negParts.length || cbParts.length) {
        const deniesItems = [];
        const noItems = [];
        negParts.forEach(raw => {
          const t = String(raw).trim();
          if (/^denies\b/i.test(t)) {
            deniesItems.push(lcFirst(t.replace(/^denies\s+/i, "")));
          } else if (/^no\b/i.test(t)) {
            noItems.push(lcFirst(t.replace(/^no\s+/i, "")));
          } else {
            // fallback: remove any stray lead-in then treat as a "No"-style term
            noItems.push(lcFirst(t.replace(/^(denies|no)\s+/i, "")));
          }
        });

        const negSentences = [];
        if (deniesItems.length) negSentences.push(`Denies ${joinWithOxford(deniesItems, "and")}.`);
        if (noItems.length)     negSentences.push(`No ${joinWithOxford(noItems, "or")}.`);
        if (cbParts.length)     negSentences.push(`${cbParts.join("; ")}.`);

        linePlain += negSentences.join(" ");
      }

      lines.push(linePlain);
    }
  });

  if (ta) ta.value = lines.join("\n");
}
