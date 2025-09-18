// app/main.js
// Entry: tiny bootstrap + initial route (hardened)

import { loadTemplates, State } from './core.js';
import { renderTier1, renderTier2, renderSection, renderOutputs, applyLayout, renderHeaderChecks, renderPatientControls, showFatal } from './ui.js';
import { bindEvents } from './events.js';

const DEBUG = true;
const dlog = (...a)=> DEBUG && console.debug('[BOOT]', ...a);

// ===== Cache config =====
const APP_VERSION = "2025-09-16-a";          // bump to invalidate everything
const CACHE_ENABLED = true;                   // master switch
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;     // 24h for templates
const STATE_AUTOSAVE_MS = 500;               // debounce for state saves

// Cache keys
const CK = {
  TEMPLATES: `ct.templates.${APP_VERSION}`,
  STATE:     `ct.state.${APP_VERSION}`,        // legacy (unused after multi-patient)
  PATLIST:   `ct.patients.${APP_VERSION}`,     // array of {id, createdAt}
  CURRENT:   `ct.patient.current.${APP_VERSION}`, // active patient id
};

const DEFAULT_MODE = "HPI";
const DEFAULT_COLUMNS = 3;

// Sticky layout heights (JS-only; no CSS edits)
const STK = {
  appbarMin: 38,  // px fallback if measurement fails
  tier1Min: 36,
  tier2Min: 36,
  z: { appbar: 6, tier1: 5, tier2: 4, checks: 3 }
};

// Tiny debounce helper
function debounce(fn, ms=100){
  let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); };
}

const REMEMBER_STATE = false;
// Debounce for the full-note builder
const COMPLETE_NOTE_MS = 150;

const CLASS_CRITICAL = "critical"; // applied when abnormal/present (right-click)
const CLASS_NORMAL   = "normal";   // applied when good/absent (left-click)

// Map each mode to its own template file
const MODE_FILES = {
  HPI: "template_HPI.json",
  ROS: "template_ROS.json",
  PE:  "template_pe.json",
  MSE: "template_MSE.json",

};
// Explicit order for tabs (so ROS appears first regardless of key enumeration)
const MODE_LIST = ["HPI", "ROS", "PE", "MSE"];
const MODE_LABELS = { HPI: "HPI",  ROS: "ROS", PE: "Physical Exam", MSE: "MSE" };

function templatesLookValid(tpl) {
  return !!(tpl && typeof tpl === "object" && tpl.sectionsByMode && tpl.sectionDefs);
}

function cacheSet(key, value, ttlMs = 0) {
  if (!CACHE_ENABLED) return;
  const now = Date.now();
  const rec = { v: value, t: now, ttl: ttlMs|0 };
  try { localStorage.setItem(key, JSON.stringify(rec)); } catch {}
}
function cacheGet(key) {
  if (!CACHE_ENABLED) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (rec && rec.ttl && Date.now() - rec.t > rec.ttl) {
      localStorage.removeItem(key);
      return null; // expired
    }
    return rec ? rec.v : null;
  } catch { return null; }
}
function cacheDel(key) { try { localStorage.removeItem(key); } catch {} }

function _readInlineFallback(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  try { return JSON.parse(el.textContent || ''); } catch { return null; }
}

async function _fetchTemplate(file) {
  const r = await fetch(file, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${file}`);
  return r.json();
}

// Preload all per-mode templates into a single cached bucket so core can read/benefit
async function preloadAllTemplates() {
  let bucket = cacheGet(CK.TEMPLATES) || {};

  for (const mode of Object.keys(MODE_FILES)) {
    const file = MODE_FILES[mode];

    // If valid cached template exists, skip fetch
    if (bucket[mode] && templatesLookValid(bucket[mode])) continue;

    try {
      const tpl = await _fetchTemplate(file);
      if (!templatesLookValid(tpl)) throw new Error(`invalid schema for ${mode}`);
      bucket[mode] = tpl;
    } catch (e) {
      // Try inline fallback if provided in index.html
      const mapId = { HPI: 'tpl-hpi', ROS: 'tpl-ros', PE: 'tpl-pe', MSE: 'tpl-mse' }[mode];
      const alt = _readInlineFallback(mapId);
      if (alt && templatesLookValid(alt)) {
        bucket[mode] = alt;
        console.warn(`[preload] Using inline fallback for ${mode}`);
      } else {
        console.warn(`[preload] No template available for ${mode}:`, e?.message || e);
      }
    }
  }

  // Persist bucket (even partial) so subsequent loads can reuse
  if (Object.keys(bucket).length) cacheSet(CK.TEMPLATES, bucket, CACHE_TTL_MS);
  // Expose to window for debugging/manual inspection (optional)
  try { window.__CT_PRELOADED__ = bucket; } catch {}
  dlog('preloadAllTemplates bucket keys=', Object.keys(bucket));

  // Final validation: ensure every mode has a valid template
  const missing = Object.keys(MODE_FILES).filter(m => !templatesLookValid(bucket[m]));
  if (missing.length) {
    console.warn('[preload] Missing or invalid templates for modes:', missing.join(', '));
  }
}



async function bootstrapLoadTemplates() {
  // 1) Preload into localStorage bucket (and window.__CT_PRELOADED__)
  await preloadAllTemplates();

  // 1b) Ensure preload produced a usable bucket so core can read it first
  const bucket = cacheGet(CK.TEMPLATES) || {};
  dlog('bucket present?', !!bucket, 'modes=', Object.keys(bucket));

  const required = Object.keys(MODE_FILES);
  const bad = required.filter(m => !templatesLookValid(bucket[m]));
  if (!bucket || !Object.keys(bucket).length || bad.length) {
    const msg = bad.length
      ? `Templates missing/invalid for: ${bad.join(', ')}. Check template_*.json files or inline fallbacks.`
      : 'No templates available (cache empty). Check template_*.json files or inline fallbacks.';
    console.warn('[bootstrap]', msg);
    showFatal(msg);
    throw new Error(msg);
  }

  // 2) Let core.js perform its normal load (primed by cache/fallbacks)
  try {
    // If all required modes are valid in the bucket, prefer using them as-is.
    // core.loadTemplates() will still read from window.__CT_PRELOADED__ (no refetch).
    dlog('calling core.loadTemplates()… (bucket primed)');
    await loadTemplates();
    dlog('core.loadTemplates() OK');
  } catch (e) {
    const em = e?.message || String(e);
    dlog('core.loadTemplates() FAILED', em);
    console.warn('[bootstrap] loadTemplates failed after preload:', em);
    showFatal(`Template load failed after preload: ${em}`);
    throw e; // stop boot so we don't render an empty grid
  }
}

(async function bootstrap() {
  try {
    await bootstrapLoadTemplates();  // load template_HPI/ROS/PE/MSE.json (with cache/TTL in core.js)
  } catch {
    return; // showFatal already displayed; stop boot
  }
  State.init();                    // restore last patient or create new

  // Patient controls first (dropdown reflects restored patient)
  renderPatientControls();

  // Let Tier2 decide the active section (restores last-used section if present)
  const mode = State.mode() || DEFAULT_MODE;
  dlog('State.mode() ->', State.mode(), 'DEFAULT_MODE=', DEFAULT_MODE);

  renderTier1(mode);
  renderTier2(mode, null); // null => Tier2 picks (last-used or first)

  // Resolve the active section from the rendered Tier2 bar
  const section =
    document.querySelector('#tier2 button.active')?.dataset.section ||
    document.querySelector('#tier2 button')?.dataset.section ||
    DEFAULT_SECTION;
  dlog('boot section resolved=', section);

  // Render header tray before grid for correct sticky heights
  renderHeaderChecks(mode);

  renderSection(mode, section);
  applyLayout(mode);
  renderOutputs(mode);

  bindEvents(); // clicks, right-clicks, '-', modifiers, matrix, header buttons, patients
})();