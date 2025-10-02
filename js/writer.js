
// ===== Cache config =====
const APP_VERSION = "2025-09-24-r";          // bump to invalidate everything
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



function templatesLookValid(tpl) {
  return !!(tpl && typeof tpl === "object" && tpl.sectionsByMode && tpl.sectionDefs);
}


// ===== Tiny cache helper (localStorage + TTL) =====
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
function cacheDel(key) {
  try { localStorage.removeItem(key); } catch {}
}
function cacheClearAllForVersion() {
  // Clears only this APP_VERSION namespace
  Object.keys(localStorage).forEach(k => {
    if (k.includes(`ct.`) && k.includes(APP_VERSION)) localStorage.removeItem(k);
  });
}


async function loadTemplatesForMode(mode){
  const file = MODE_FILES[mode];
  if (!file) throw new Error(`No template file for mode ${mode}`);

  // 1) Try cached bucket
  let bucket = cacheGet(CK.TEMPLATES) || {};
  if (bucket && bucket[mode] && templatesLookValid(bucket[mode])) {
    console.debug("[NoteWriter] Using cached templates for", mode);
    return bucket[mode];
  }

  // 2) Fetch fresh
  const r = await fetch(file, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${file}`);
  const tpl = await r.json();

  // 3) Validate fetched; if bad, clear and throw
  if (!templatesLookValid(tpl)) {
    cacheDel(CK.TEMPLATES);
    throw new Error(`Template schema invalid for ${mode}`);
  }

  // 4) Save back to bucket
  bucket[mode] = tpl;
  cacheSet(CK.TEMPLATES, bucket, CACHE_TTL_MS);
  return tpl;
}

