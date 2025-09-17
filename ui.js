// app/ui.js
// Rendering (tabs, panels, outputs) + layout helpers

import { CONFIG, qs, qsa, el } from './core.js';
import { State, getTemplate } from './core.js';

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

  // Resolve section definition for both schemas
  const def = (tpl.sectionDefs && tpl.sectionDefs[sectionTitle])
    ? tpl.sectionDefs[sectionTitle]
    : (tpl.sections?.find(s => s.title === sectionTitle) || null);

  if (!def) return;

  // Dispatch by kind (fallback to chips if not specified)
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
let _layoutBound = false;

export function applyLayout(mode) {
  const grid = qs(CONFIG.IDS.grid);
  if (!grid) return;

  // Two-column HPI
  if (mode === 'HPI') grid.classList.add('two-col');
  else grid.classList.remove('two-col');

  // Sticky height variables
  const tier1 = qs(CONFIG.IDS.tier1);
  const tier2 = qs(CONFIG.IDS.tier2);
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--tier1-h', tier1 ? `${tier1.offsetHeight}px` : '0px');
  rootStyle.setProperty('--tier2-h', tier2 ? `${tier2.offsetHeight}px` : '0px');

  // Update on resize once
  if (!_layoutBound) {
    _layoutBound = true;
    window.addEventListener('resize', () => {
      const t1 = qs(CONFIG.IDS.tier1);
      const t2 = qs(CONFIG.IDS.tier2);
      const rs = document.documentElement.style;
      rs.setProperty('--tier1-h', t1 ? `${t1.offsetHeight}px` : '0px');
      rs.setProperty('--tier2-h', t2 ? `${t2.offsetHeight}px` : '0px');
    }, { passive: true });
  }
}