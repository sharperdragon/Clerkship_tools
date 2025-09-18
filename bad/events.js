// app/events.js
// All event wiring → update State → re-render outputs / sections

import { CONFIG, qs, qsa, rightClickState, scheduleRebuildAllOutputs, getTemplate } from './core.js';
import { State } from './core.js';
import { renderTier1, renderTier2, renderSection, renderOutputs, applyLayout, renderHeaderChecks, renderPatientControls } from './ui.js';

function _clearRosNegChecksIfNeeded(mode) {
  if (mode !== 'ROS') return;
  const section = State.section(mode);
  if (!section) return;
  const tpl = getTemplate(mode);
  const def = (tpl?.sectionDefs && (tpl.sectionDefs[`${mode}:${section}`] || tpl.sectionDefs[section]))
            || (tpl?.sections?.find(s => s.title === section) || null);
  if (!def) return;
  const sel = State.getSelections(mode);
  const negIds = [
    ...(def.headerChecks || []).map(h => h.id),
    ...(def.headerToggles || []).map(t => t.id)
  ].filter(id => /_neg$/i.test(id));
  negIds.forEach(id => { if (sel[id]) State.updateSelection(mode, id, () => null); });
}

export function bindEvents() {
  // Tier1 (mode) click
  qs(CONFIG.IDS.tier1).addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    const mode = btn.dataset.mode;

    renderTier1(mode);
    // Let renderTier2 choose active section (uses last-used fallback)
    renderTier2(mode, null);
    const section =
      qs(`${CONFIG.IDS.tier2} button.${CONFIG.CLASSES.active}`)?.dataset.section ||
      qs(`${CONFIG.IDS.tier2} button`)?.dataset.section ||
      null;

    renderHeaderChecks(mode);
    renderSection(mode, section);
    renderOutputs(mode);
    applyLayout(mode);
  });

  // Tier2 (section) click
  qs(CONFIG.IDS.tier2).addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-section]');
    if (!btn) return;
    const mode = State.mode() || 'HPI';
    const section = btn.dataset.section;

    renderTier2(mode, section);
    renderHeaderChecks(mode);
    renderSection(mode, section);
    renderOutputs(mode);
    applyLayout(mode);
  });

  // Grid interactions (chips, minus, matrix buttons)
  qs(CONFIG.IDS.grid).addEventListener('click', (e) => {
    const mode = State.mode() || 'HPI';

    // Header options toggle
    const optBtn = e.target.closest('[data-action="toggle-options"]');
    if (optBtn) {
      const el = document.getElementById('optionsBar');
      if (el) el.classList.toggle('hidden');
      return;
    }

    // Matrix set/clear
    const actBtn = e.target.closest('[data-action]');
    if (actBtn) {
      const action = actBtn.dataset.action;
      const grid = qs(CONFIG.IDS.grid);
      if (action === 'matrix-set-all') {
        // set each row to POS
        qsa('[data-matrix-col]', grid).forEach(cb => { cb.checked = true; });
        const rowIds = new Set(qsa('[data-matrix-col]', grid).map(el => el.dataset.id));
        rowIds.forEach(id => State.updateSelection(mode, id, ()=>'pos'));
        scheduleRebuildAllOutputs(() => renderOutputs(mode));
        return;
      }
      if (action === 'matrix-clear') {
        qsa('[data-matrix-col]', grid).forEach(cb => { cb.checked = false; });
        const rowIds = new Set(qsa('[data-matrix-col]', grid).map(el => el.dataset.id));
        rowIds.forEach(id => State.updateSelection(mode, id, ()=>null));
        scheduleRebuildAllOutputs(() => renderOutputs(mode));
        return;
      }
    }

    // Chip left-click cycles neutral <-> POS
    const chip = e.target.closest(`.${CONFIG.CLASSES.chip}[data-id]`);
    if (chip) {
      const id = chip.dataset.id;
      State.cyclePos(mode, id);
      const sel = State.getSelections(mode)[id];
      const isPos = (typeof sel === 'object') ? sel.state === 'pos' : sel === 'pos';
      chip.classList.toggle(CONFIG.CLASSES.selected, !!isPos);
      if (isPos) _clearRosNegChecksIfNeeded(mode);
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      return;
    }

    // Minus toggles NEG
    const minus = e.target.closest(`.${CONFIG.CLASSES.negative}[data-id]`);
    if (minus) {
      const id = minus.dataset.id;
      State.setNeg(mode, id);
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      return;
    }
  });

  // Matrix grade buttons (expects UI to render buttons with data attrs)
  qs(CONFIG.IDS.grid).addEventListener('click', (e) => {
    const mode = State.mode() || 'HPI';

    const g = e.target.closest('button[data-matrix="grade"][data-panel][data-row][data-col][data-grade]');
    if (g) {
      const panel = g.dataset.panel;
      const row   = parseInt(g.dataset.row, 10);
      const col   = parseInt(g.dataset.col, 10);
      const grade = g.dataset.grade === 'null' ? null : parseInt(g.dataset.grade, 10);
      if (typeof State.setMatrixGrade === 'function') {
        State.setMatrixGrade(panel, row, col, grade);
      }
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      return;
    }

    const all = e.target.closest('button[data-action="matrix-set-all-grade"][data-panel][data-grade]');
    if (all) {
      const panel = all.dataset.panel;
      const grade = parseInt(all.dataset.grade, 10);
      if (typeof State.setMatrixAll === 'function') {
        State.setMatrixAll(panel, grade);
      }
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      return;
    }

    const clr = e.target.closest('button[data-action="matrix-clear-all"][data-panel]');
    if (clr) {
      const panel = clr.dataset.panel;
      if (typeof State.clearMatrix === 'function') {
        State.clearMatrix(panel);
      }
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      return;
    }
  });

  // Chip right-click → set abnormal per mapping (rightClickState)
  qs(CONFIG.IDS.grid).addEventListener('contextmenu', (e) => {
    const chip = e.target.closest(`.${CONFIG.CLASSES.chip}[data-id]`);
    if (!chip) return;
    e.preventDefault();
    const mode = State.mode() || 'HPI';
    const id = chip.dataset.id;
    State.updateSelection(mode, id, () => rightClickState()); // 'pos' or 'neg'
    const sel = State.getSelections(mode)[id];
    const isPos = (typeof sel === 'object') ? sel.state === 'pos' : sel === 'pos';
    chip.classList.toggle(CONFIG.CLASSES.selected, !!isPos);
    if (isPos) _clearRosNegChecksIfNeeded(mode);
    scheduleRebuildAllOutputs(() => renderOutputs(mode));
  });

  // Header checks tray
  document.querySelector('#headerChecks')?.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-headercheck="1"][data-id]');
    if (!cb) return;
    const mode = State.mode() || 'HPI';
    State.updateSelection(mode, cb.dataset.id, cb.checked ? 'pos' : null);
    scheduleRebuildAllOutputs(() => renderOutputs(mode));
  });

  // Options panel interactions (chips & minus)
  document.querySelector('#optionsBar')?.addEventListener('click', (e) => {
    const mode = State.mode() || 'HPI';

    const chip = e.target.closest(`.${CONFIG.CLASSES.chip}[data-id]`);
    if (chip) {
      const id = chip.dataset.id;
      State.cyclePos(mode, id);
      const sel = State.getSelections(mode)[id];
      const isPos = (typeof sel === 'object') ? sel.state === 'pos' : sel === 'pos';
      if (isPos) _clearRosNegChecksIfNeeded(mode);
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      return;
    }

    const minus = e.target.closest(`.${CONFIG.CLASSES.negative}[data-id]`);
    if (minus) {
      const id = minus.dataset.id;
      State.setNeg(mode, id);
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      return;
    }
  });

  // Options panel changes (modifiers via select/toggle)
  document.querySelector('#optionsBar')?.addEventListener('change', (e) => {
    const mode = State.mode() || 'HPI';

    const modToggle = e.target.closest('input[type="checkbox"][data-id][data-mod]');
    if (modToggle) {
      State.setMod(mode, modToggle.dataset.id, modToggle.dataset.mod, modToggle.checked);
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      return;
    }

    const modSelect = e.target.closest('select[data-id][data-mod]');
    if (modSelect) {
      State.setMod(mode, modSelect.dataset.id, modSelect.dataset.mod, modSelect.value);
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      return;
    }
  });

  // Options panel text inputs
  document.querySelector('#optionsBar')?.addEventListener('input', (e) => {
    const txt = e.target.closest('input[type="text"][data-id]');
    if (!txt) return;
    const mode = State.mode() || 'HPI';
    State.setText(mode, txt.dataset.id, txt.value);
    scheduleRebuildAllOutputs(() => renderOutputs(mode));
  });

  // Checkboxes (plain lists and matrix) + Modifiers (select/toggle)
  qs(CONFIG.IDS.grid).addEventListener('change', (e) => {
    const mode = State.mode() || 'HPI';

    // Matrix checkbox?
    const mbox = e.target.closest('input[type="checkbox"][data-id][data-matrix-col]');
    if (mbox) {
      const rowId = mbox.dataset.id;
      // Any column checked → POS; none → null
      const rowPeers = qsa(`input[type="checkbox"][data-id="${rowId}"][data-matrix-col]`, qs(CONFIG.IDS.grid));
      const any = rowPeers.some(x => x.checked);
      State.updateSelection(mode, rowId, any ? 'pos' : null);
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      return;
    }

    // Plain checkbox item
    const cb = e.target.closest('input[type="checkbox"][data-id]:not([data-matrix-col])');
    if (cb) {
      State.updateSelection(mode, cb.dataset.id, cb.checked ? 'pos' : null);
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      return;
    }

    // Modifier toggle (checkbox)
    const modToggle = e.target.closest('input[type="checkbox"][data-id][data-mod]');
    if (modToggle) {
      State.setMod(mode, modToggle.dataset.id, modToggle.dataset.mod, modToggle.checked);
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      return;
    }

    // Modifier select
    const modSelect = e.target.closest('select[data-id][data-mod]');
    if (modSelect) {
      const val = modSelect.value;
      State.setMod(mode, modSelect.dataset.id, modSelect.dataset.mod, val);
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      return;
    }
  });

  // Custom text inputs
  qs(CONFIG.IDS.grid).addEventListener('input', (e) => {
    const txt = e.target.closest('input[type="text"][data-id]');
    if (!txt) return;
    const mode = State.mode() || 'HPI';
    State.setText(mode, txt.dataset.id, txt.value);
    scheduleRebuildAllOutputs(() => renderOutputs(mode));
  });

  // Per-tab Output edited manually (match app.js: trigger full-note rebuild)
  qs(CONFIG.IDS.out).addEventListener('input', (e) => {
    const mode = State.mode() || 'HPI';
    State.setOutput(mode, e.target.value);
    scheduleRebuildAllOutputs(() => renderOutputs(mode));
  });

  // Patient dropdown → switch current patient and refresh UI
  document.querySelector('#patientSelect')?.addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    State.setPatient(id);
    renderPatientControls();
    const mode = State.mode() || 'HPI';
    renderTier1(mode);
    renderTier2(mode, null);
    const section =
      qs(`${CONFIG.IDS.tier2} button.${CONFIG.CLASSES.active}`)?.dataset.section ||
      qs(`${CONFIG.IDS.tier2} button`)?.dataset.section ||
      'Chief Complaint';
    renderHeaderChecks(mode);
    renderSection(mode, section);
    renderOutputs(mode);
    applyLayout(mode);
  });

  // New Patient
  qs(CONFIG.IDS.btnNewPatient)?.addEventListener('click', () => {
    State.setPatient(State._makeId());
    renderPatientControls();
    _resetTo('HPI');
  });

  // Clear Patients
  qs(CONFIG.IDS.btnClearPatients)?.addEventListener('click', () => {
    State.clearPatients();
    renderPatientControls();
    _resetTo('HPI');
  });

  // Header action buttons (support legacy/new IDs)
  ;['#btnCopySection', '#btnCopy', '#copyBtn'].forEach(sel => {
    document.querySelector(sel)?.addEventListener('click', () => {
      const ta = document.querySelector(CONFIG.IDS.out);
      if (!ta) return;
      ta.select();
      document.execCommand?.('copy');
    });
  });

  ;['#btnClearSection', '#clearSectionBtn'].forEach(sel => {
    document.querySelector(sel)?.addEventListener('click', () => {
      const mode = State.mode() || 'HPI';
      const section = State.section(mode);
      if (!section) return;
      const tpl = getTemplate(mode);
      const def = (tpl?.sectionDefs && tpl.sectionDefs[section]) || (tpl?.sections?.find(s => s.title === section) || null);
      if (!def) return;

      // Collect all item ids from this section (items + groups + matrix + subsections)
      const ids = [];

      if (Array.isArray(def.items)) ids.push(...def.items.map(i => i.id));
      if (Array.isArray(def.groups)) ids.push(
        ...def.groups.flatMap(g => (g.items || []).map(i => i.id))
      );
      if (def.matrix?.rows) ids.push(...def.matrix.rows.map(r => r.id));

      if (def.kind === 'subsections' && Array.isArray(def.subsections)) {
        for (const sub of def.subsections) {
          if (Array.isArray(sub.items)) ids.push(...sub.items.map(i => i.id));
          if (Array.isArray(sub.groups)) ids.push(
            ...sub.groups.flatMap(g => (g.items || []).map(i => i.id))
          );
          if (sub.matrix?.rows) ids.push(...sub.matrix.rows.map(r => r.id));
        }
      }

      ids.forEach(id => State.updateSelection(mode, id, () => null));
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      renderHeaderChecks(mode);
    });
  });

  ;['#btnClearAll', '#clearAllBtn'].forEach(sel => {
    document.querySelector(sel)?.addEventListener('click', () => {
      const mode = State.mode() || 'HPI';
      const sel = State.getSelections(mode);
      Object.keys(sel).forEach(id => State.updateSelection(mode, id, () => null));
      scheduleRebuildAllOutputs(() => renderOutputs(mode));
      renderHeaderChecks(mode);
    });
  });
}

// ----- helpers -----
function _resetTo(mode) {
  renderTier1(mode);
  renderTier2(mode, null);
  const section =
    qs(`${CONFIG.IDS.tier2} button.${CONFIG.CLASSES.active}`)?.dataset.section ||
    qs(`${CONFIG.IDS.tier2} button`)?.dataset.section ||
    'Chief Complaint';
  renderHeaderChecks(mode);
  renderSection(mode, section);
  renderOutputs(mode);
  applyLayout(mode);
}
