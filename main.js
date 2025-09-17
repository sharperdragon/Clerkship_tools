// app/main.js
// Entry: tiny bootstrap + initial route

import { loadTemplates, State } from './core.js';
import { renderTier1, renderTier2, renderSection, renderOutputs, applyLayout } from './ui.js';
import { bindEvents } from './events.js';

// ---- Defaults (easy to tweak) ----
const DEFAULT_MODE = 'HPI';
const DEFAULT_SECTION = 'Chief Complaint';

(async function bootstrap() {
  await loadTemplates();   // load template_HPI/ROS/PE.json (with cache/TTL in core.js)
  State.init();            // restore last patient or create new

  // Let Tier2 decide the active section (restores last-used section if present)
  const mode = State.mode() || DEFAULT_MODE;

  renderTier1(mode);
  renderTier2(mode, null); // null => Tier2 picks (last-used or first)

  // Resolve the active section from the rendered Tier2 bar
  const section =
    document.querySelector('#tier2 button.active')?.dataset.section ||
    document.querySelector('#tier2 button')?.dataset.section ||
    DEFAULT_SECTION;

  renderSection(mode, section);
  renderOutputs(mode);
  applyLayout(mode);

  bindEvents(); // clicks, right-clicks, '-', modifiers, matrix, new/clear patients
})();