/* tabs_runtime.js
   - Swaps HTML partials per tab
   - Injects/removes tab-specific CSS + JS
   - Binds inputs with [data-bind] to global App state (per-tab, per-patient)
   - Preserves cached data and output generation via App.*
*/

/* ===========================
   $ Config (edit these)
   =========================== */
const CONTENT_SELECTOR = '#content';            // Where tab HTML is injected
const TAB_BUTTONS_SELECTOR = '[data-tab]';      // Buttons: <button data-tab="ROS">ROS</button>
const TAB_CSS_SLOT_ID = 'tab-css-slot';         // Optional debug slot for <link> (fallback: <head>)
const TAB_JS_SLOT_ID  = 'tab-js-slot';          // Optional debug slot for <script> (fallback: <body>)
const DEFAULT_TAB = 'subjective';
const ENABLE_HTML_CACHE = true;
const ENABLE_HASH_ROUTING = true;

// Define your tabs here (or load them from a manifest if you prefer)
const TAB_DEFS = {
  subjective: {
    html: 'writer_tabs/subjective.html',
    css:  ['writer_tabs/subjective.css'],
    js:   ['writer_tabs/subjective.js']
  },
  ROS: {
    html: 'writer_tabs/ROS.html',
    css:  ['writer_tabs/ROS.css'],
    js:   ['writer_tabs/ROS.js']
  },
  PE: {
    html: 'writer_tabs/PE.html',
    css:  ['writer_tabs/PE.css'],
    js:   ['writer_tabs/PE.js']
  },
  MSE: {
    html: 'writer_tabs/MSE.html',
    css:  ['writer_tabs/MSE.css'],
    js:   ['writer_tabs/MSE.js']
  }
};

/* ===========================
   ? Integration contract
   ===========================

   We expect a global `window.App` with:
     - App.currentPatientId (string)   // required for per-patient cache keys
     - App.currentTab (string)         // managed by this file, but visible globally
     - App.state : { [tabKey]: {...} } // in-memory state
     - App.getTabState(tabKey)
     - App.setTabState(tabKey, partialObj)  -> persists + calls App.rebuildOutput()
     - App.loadTabState(tabKey)             -> loads from localStorage to App.state[tabKey]
     - App.rebuildOutput()                  -> updates Output + Complete Note

   If not present, we create a minimal shim so the UI works; override with your real core.
*/
(function ensureAppShim(){
  if (window.App) return;
  // ! Minimal shim (replace with your existing core.js)
  const App = {
    currentPatientId: 'default',
    currentTab: null,
    state: Object.create(null),

    getTabState(tab){ return this.state[tab] || {}; },
    setTabState(tab, partial){
      const next = { ...(this.state[tab] || {}), ...partial };
      this.state[tab] = next;
      this._saveTab(tab);
      try { this.rebuildOutput(); } catch(e){ /* no-op in shim */ }
    },
    loadTabState(tab){
      const key = `nw.v2.tabState.${this.currentPatientId}.${tab}`;
      try { this.state[tab] = JSON.parse(localStorage.getItem(key) || '{}'); }
      catch { this.state[tab] = {}; }
      return this.state[tab];
    },
    _saveTab(tab){
      const key = `nw.v2.tabState.${this.currentPatientId}.${tab}`;
      localStorage.setItem(key, JSON.stringify(this.state[tab] || {}));
    },
    rebuildOutput(){
      // ! Implement in your real core: read App.state and update #out / #completeOutView
      // console.warn('[tabs_runtime] App.rebuildOutput() shim – override in your core.');
    }
  };
  window.App = App;
})();

/* ===========================
   # Internals (no edits needed)
   =========================== */
let _currentAssets = { css: [], js: [] };
let _currentTabKey = null;
let _switchToken = 0;
const _htmlCache = new Map();

function $(sel){ return document.querySelector(sel); }
function byId(id){ return document.getElementById(id); }

async function fetchText(url){
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function loadHTML(url){
  if (ENABLE_HTML_CACHE && _htmlCache.has(url)) return _htmlCache.get(url);
  const html = await fetchText(url);
  if (ENABLE_HTML_CACHE) _htmlCache.set(url, html);
  return html;
}

function unloadTabAssets(prevKey){
  // Call optional per-tab cleanup
  try {
    if (prevKey && window.__tabCleanup && typeof window.__tabCleanup[prevKey] === 'function') {
      window.__tabCleanup[prevKey]();
    }
  } catch (e) { console.warn('Tab cleanup error:', e); }

  for (const el of _currentAssets.css) el.remove();
  for (const el of _currentAssets.js) el.remove();
  _currentAssets = { css: [], js: [] };
}

function injectTabCSS(tabKey, urls){
  if (!Array.isArray(urls) || !urls.length) return;
  const slot = byId(TAB_CSS_SLOT_ID) || document.head;
  urls.forEach(href => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.tabAsset = tabKey;
    slot.appendChild(link);
    _currentAssets.css.push(link);
  });
}

async function injectTabJS(tabKey, urls){
  if (!Array.isArray(urls) || !urls.length) return;
  const slot = byId(TAB_JS_SLOT_ID) || document.body;
  for (const src of urls){
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.dataset.tabAsset = tabKey;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      slot.appendChild(s);
      _currentAssets.js.push(s);
    });
  }
}

function markActiveButton(tabKey){
  document.querySelectorAll(TAB_BUTTONS_SELECTOR).forEach(btn => {
    const on = btn.dataset.tab === tabKey;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-current', on ? 'page' : 'false');
  });
}

/* ===================================
   # Data-binding for tab HTML partials
   ===================================

   Conventions in your tab partials:
     - Use [data-bind="fieldId"] on <input>, <select>, <textarea>, etc.
     - For checkboxes in a group, use the same data-bind and distinct values.
     - For radios, use type="radio" with same name and data-bind=fieldId.

   Behavior:
     - On load, we read App.loadTabState(tabKey) and prefill elements.
     - On user edits, we call App.setTabState(tabKey, { fieldId: value|array|boolean }).
*/
function bindInputsForTab(tabKey, container){
  const state = App.loadTabState(tabKey);

  // Prefill helpers
  const setValue = (el, val) => {
    if (el.type === 'checkbox'){
      if (Array.isArray(val)) el.checked = val.includes(el.value);
      else el.checked = !!val;
    } else if (el.type === 'radio'){
      el.checked = (el.value == val);
    } else if (el.tagName === 'SELECT' && el.multiple && Array.isArray(val)){
      Array.from(el.options).forEach(opt => { opt.selected = val.includes(opt.value); });
    } else {
      el.value = (val ?? '');
    }
  };

  const getValue = (el) => {
    if (el.type === 'checkbox'){
      // If other checkboxes share this data-bind, collect as array
      const group = container.querySelectorAll(`[data-bind="${el.dataset.bind}"][type="checkbox"]`);
      if (group.length > 1){
        return Array.from(group).filter(x => x.checked).map(x => x.value);
      }
      return !!el.checked;
    }
    if (el.type === 'radio'){
      const group = container.querySelectorAll(`[data-bind="${el.dataset.bind}"][type="radio"]`);
      const checked = Array.from(group).find(x => x.checked);
      return checked ? checked.value : null;
    }
    if (el.tagName === 'SELECT' && el.multiple){
      return Array.from(el.selectedOptions).map(o => o.value);
    }
    return el.value;
  };

  // Prefill from state
  const bindables = container.querySelectorAll('[data-bind]');
  bindables.forEach(el => {
    // Tag the element (avoid repeated listeners)
    if (el.__nwBound) return;
    el.__nwBound = true;

    // Prefill
    const key = el.dataset.bind;
    const val = state[key];
    if (val !== undefined) setValue(el, val);

    // Listen for changes
    const onEvt = (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') ? 'change' : 'input';
    el.addEventListener(onEvt, () => {
      const updated = {};
      updated[key] = getValue(el);
      App.setTabState(tabKey, updated);
    });
  });

  // Initial rebuild so output reflects loaded state
  try { App.rebuildOutput(); } catch(e){}
}

/* ===========================
   # Core: switch tab
   =========================== */
async function switchTab(tabKey){
  if (!TAB_DEFS[tabKey]) {
    console.warn(`Unknown tab "${tabKey}"`);
    return;
  }
  if (tabKey === _currentTabKey) return;

  const token = ++_switchToken;
  const prevKey = _currentTabKey;
  _currentTabKey = tabKey;
  App.currentTab = tabKey;

  // Visual state quickly
  markActiveButton(tabKey);

  // 1) Unload previous assets
  unloadTabAssets(prevKey);

  // 2) Inject CSS for new tab
  try { injectTabCSS(tabKey, TAB_DEFS[tabKey].css); } catch(e){ console.warn(e); }

  // 3) Load HTML partial
  let html = '';
  try { html = await loadHTML(TAB_DEFS[tabKey].html); }
  catch(e){ html = `<section class="panel error"><h2>Load Error</h2><p>${e.message}</p></section>`; }

  if (token !== _switchToken) return; // stale

  const container = $(CONTENT_SELECTOR);
  if (!container){ console.error(`Missing content container: ${CONTENT_SELECTOR}`); return; }

  container.innerHTML = html;

  // 4) Bind inputs in the new content to App state
  bindInputsForTab(tabKey, container);

  // 5) Inject JS for new tab (sequential)
  try { await injectTabJS(tabKey, TAB_DEFS[tabKey].js); }
  catch(e){ console.warn(e); }

  // 6) Update URL hash (optional)
  if (ENABLE_HASH_ROUTING){
    const nextHash = `#tab=${encodeURIComponent(tabKey)}`;
    if (location.hash !== nextHash) history.replaceState(null, '', nextHash);
  }
}

/* ===========================
   # Bootstrapping
   =========================== */
function initTabsRuntime(){
  // Wire clicks on tab buttons
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest(TAB_BUTTONS_SELECTOR);
    if (!btn) return;
    const key = btn.dataset.tab;
    if (key) switchTab(key);
  });

  // Decide starting tab
  let start = DEFAULT_TAB;
  if (ENABLE_HASH_ROUTING && /^#tab=/.test(location.hash)){
    const key = decodeURIComponent(location.hash.slice(5));
    if (TAB_DEFS[key]) start = key;
  }
  if (!TAB_DEFS[start]) start = Object.keys(TAB_DEFS)[0] || null;

  if (start) switchTab(start);
  else console.error('No tabs defined in TAB_DEFS.');
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initTabsRuntime);
} else {
  initTabsRuntime();
}

/* ===========================
   $ Per-tab optional hooks
   ===========================
   In a tab JS file (e.g., tabs/ROS.js):

   (function(){
     // Set up listeners/observers unique to this tab
     const onClick = (e)=>{/* ... *-/};
     document.addEventListener('click', onClick);

     // Optional cleanup (called automatically on tab switch away)
     window.__tabCleanup = window.__tabCleanup || {};
     window.__tabCleanup.ROS = () => {
       document.removeEventListener('click', onClick);
       // disconnect observers, clear intervals, etc.
     };
   })();
*/