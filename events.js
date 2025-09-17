// app/events.js
// All event wiring → update State → re-render outputs / sections

import { CONFIG, qs, qsa, rightClickState } from './core.js';
import { State } from './core.js';
import { renderTier1, renderTier2, renderSection, renderOutputs, applyLayout } from './ui.js';

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
        _refreshOutputs(mode);
        return;
      }
      if (action === 'matrix-clear') {
        qsa('[data-matrix-col]', grid).forEach(cb => { cb.checked = false; });
        const rowIds = new Set(qsa('[data-matrix-col]', grid).map(el => el.dataset.id));
        rowIds.forEach(id => State.updateSelection(mode, id, ()=>null));
        _refreshOutputs(mode);
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
      _refreshOutputs(mode);
      return;
    }

    // Minus toggles NEG
    const minus = e.target.closest(`.${CONFIG.CLASSES.negative}[data-id]`);
    if (minus) {
      const id = minus.dataset.id;
      State.setNeg(mode, id);
      _refreshOutputs(mode);
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
    _refreshOutputs(mode);
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
      _refreshOutputs(mode);
      return;
    }

    // Plain checkbox item
    const cb = e.target.closest('input[type="checkbox"][data-id]:not([data-matrix-col])');
    if (cb) {
      State.updateSelection(mode, cb.dataset.id, cb.checked ? 'pos' : null);
      _refreshOutputs(mode);
      return;
    }

    // Modifier toggle (checkbox)
    const modToggle = e.target.closest('input[type="checkbox"][data-id][data-mod]');
    if (modToggle) {
      State.setMod(mode, modToggle.dataset.id, modToggle.dataset.mod, modToggle.checked);
      _refreshOutputs(mode);
      return;
    }

    // Modifier select
    const modSelect = e.target.closest('select[data-id][data-mod]');
    if (modSelect) {
      const val = modSelect.value;
      State.setMod(mode, modSelect.dataset.id, modSelect.dataset.mod, val);
      _refreshOutputs(mode);
      return;
    }
  });

  // Custom text inputs
  qs(CONFIG.IDS.grid).addEventListener('input', (e) => {
    const txt = e.target.closest('input[type="text"][data-id]');
    if (!txt) return;
    const mode = State.mode() || 'HPI';
    State.setText(mode, txt.dataset.id, txt.value);
    _refreshOutputs(mode);
  });

  // Per-tab Output edited manually (optional)
  qs(CONFIG.IDS.out).addEventListener('input', (e) => {
    const mode = State.mode() || 'HPI';
    State.setOutput(mode, e.target.value);
    _refreshCompleteOnly();
  });

  // New Patient
  qs(CONFIG.IDS.btnNewPatient)?.addEventListener('click', () => {
    State.setPatient(State._makeId());
    _resetTo('HPI');
  });

  // Clear Patients
  qs(CONFIG.IDS.btnClearPatients)?.addEventListener('click', () => {
    State.clearPatients();
    _resetTo('HPI');
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
  renderSection(mode, section);
  renderOutputs(mode);
  applyLayout(mode);
}

function _refreshOutputs(mode) {
  // re-assemble the current tab text, then update both outputs
  State.setOutput(mode, State.assembleTab(mode));
  renderOutputs(mode);
}
function _refreshCompleteOnly() {
  // only recompute the cumulative note (if you prefer exact concatenation)
  renderOutputs(State.mode() || 'HPI');
}