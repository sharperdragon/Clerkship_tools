/* tabs_runtime.js
   - Swaps HTML partials per tab (with #headerItems and #grid support)
   - Injects/removes tab-specific CSS + JS
   - Binds inputs ([data-bind]) in BOTH header bar and grid to global App state
   - Case-insensitive tab keys with alias resolution
*/

/* ===========================
   $ Config (edit these)
   =========================== */
// ! Hosts in the base shell (Writer_Base.html)
const CONTENT_SELECTOR = '#content';        // where the tab's <main id="grid"> goes
const HEADER_BAR_SELECTOR = '#headerItems'; // fixed header strip host (children only)

// ! Tier-1 buttons (e.g., <button data-tab="PE">)
const TAB_BUTTONS_SELECTOR = '[data-tab]';

// ? Optional slots (just for organizing injected assets in DevTools)
const TAB_CSS_SLOT_ID = 'tab-css-slot';
const TAB_JS_SLOT_ID  = 'tab-js-slot';

// ? Start tab + routing/cache knobs
const DEFAULT_TAB = 'subjective';
const ENABLE_HTML_CACHE = true;
const ENABLE_HASH_ROUTING = true;


const TAB_DEFS = {
  subjective: { html: 'writer_tabs/subjective.html', css: [], js: [] },
  ROS:        { html: 'writer_tabs/ROS.html',        css: [], js: [] },
  PE:         { html: 'writer_tabs/PE.html',   css: [], js: [] },
  MSE:        { html: 'writer_tabs/MSE.html',        css: [], js: [] }
};


// Friendly labels (optional; used only for error messages)
const TAB_LABELS = {
  subjective: 'Subjective',
  ros: 'ROS',
  pe: 'Physical Exam',
  mse: 'MSE'
};

// Allow button labels/keys to map to canonical keys (lowercase)
const ALIASES = {
  subjective: ['SUBJECTIVE', 'Subjective'],
  ros:        ['ROS', 'Ros'],
  pe:         ['PE', 'Pe', 'Physical', 'Physical Exam', 'Physcial'],
  mse:        ['MSE', 'Mse']
};

/* ===========================
   ? Integration contract (global core)
   ===========================
   We expect a global `window.App` with:
     - App.currentPatientId, App.currentTab
     - App.state, App.getTabState(tab), App.setTabState(tab, partial)
     - App.loadTabState(tab), App.rebuildOutput()
   If absent, we provide a minimal shim so the UI still functions.
*/
(function ensureAppShim(){
  if (window.App) return;
  const App = {
    currentPatientId: 'default',
    currentTab: null,
    state: Object.create(null),
    getTabState(tab){ return this.state[tab] || {}; },
    setTabState(tab, partial){
      const next = { ...(this.state[tab] || {}), ...partial };
      this.state[tab] = next;
      this._saveTab(tab);
      try { this.rebuildOutput(); } catch(_) {}
    },
    loadTabState(tab){
      const k = `nw.v2.tabState.${this.currentPatientId}.${tab}`;
      try { this.state[tab] = JSON.parse(localStorage.getItem(k) || '{}'); }
      catch { this.state[tab] = {}; }
      return this.state[tab];
    },
    _saveTab(tab){
      const k = `nw.v2.tabState.${this.currentPatientId}.${tab}`;
      localStorage.setItem(k, JSON.stringify(this.state[tab] || {}));
    },
    rebuildOutput(){ /* override with your real builder */ }
  };
  window.App = App;
})();

/* ===========================
   # Internals
   =========================== */
let _currentAssets = { css: [], js: [] };
let _currentTabKey = null;
let _switchToken = 0;
const _htmlCache = new Map();

// Build a resolver map for aliases and case-insensitive keys
const TAB_KEYS = new Map(); // lower -> canonical key in TAB_DEFS
Object.keys(TAB_DEFS).forEach(k => TAB_KEYS.set(k.toLowerCase(), k));
for (const [canon, list] of Object.entries(ALIASES)) {
  const canonical = TAB_KEYS.get(canon.toLowerCase()) || canon.toLowerCase();
  (list || []).forEach(alias => TAB_KEYS.set(String(alias).toLowerCase(), canonical));
}
function resolveTabKey(raw){
  const key = String(raw || '').toLowerCase();
  return TAB_KEYS.get(key) || null;
}

function $(sel){ return document.querySelector(sel); }
function byId(id){ return document.getElementById(id); }

async function fetchText(url){
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}
async function loadHTMLWithFallback(htmlPath){
  const paths = Array.isArray(htmlPath) ? htmlPath : [htmlPath];
  const tried = [];
  for (const p of paths){
    try {
      if (ENABLE_HTML_CACHE && _htmlCache.has(p)) return { html: _htmlCache.get(p), used: p };
      const txt = await fetchText(p);
      if (ENABLE_HTML_CACHE) _htmlCache.set(p, txt);
      return { html: txt, used: p };
    } catch (e) {
      tried.push(`${p} (${e.message})`);
    }
  }
  throw new Error(`Tried:\n- ${tried.join('\n- ')}`);
}

function unloadTabAssets(prevKey){
  // Optional per-tab cleanup hook
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
    /* eslint no-await-in-loop: "off" */
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
  // Accept buttons with any case/alias
  document.querySelectorAll(TAB_BUTTONS_SELECTOR).forEach(btn => {
    const resolved = resolveTabKey(btn.dataset.tab);
    const on = resolved === tabKey;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-current', on ? 'page' : 'false');
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

/* ===================================
   # Data-binding (header + grid)
   =================================== */
// Compat: allow data-field-id or name to act as data-bind
function normalizeBindAttr(container) {
  if (!container) return;
  const els = container.querySelectorAll('input,select,textarea');
  els.forEach(el => {
    if (!el.dataset.bind) {
      if (el.dataset.fieldId) el.dataset.bind = el.dataset.fieldId;
      else if (el.name)       el.dataset.bind = el.name;
    }
  });
}

function bindInputsIn(container, tabKey){
  normalizeBindAttr(container);
  if (!container) return;
  const state = App.loadTabState(tabKey);

  const setValue = (el, val) => {
    if (el.type === 'checkbox'){
      const group = container.querySelectorAll(`[data-bind="${el.dataset.bind}"][type="checkbox"]`);
      if (group.length > 1) el.checked = Array.isArray(val) && val.includes(el.value);
      else el.checked = !!val;
    } else if (el.type === 'radio'){
      el.checked = (el.value == val);
    } else if (el.tagName === 'SELECT' && el.multiple){
      if (Array.isArray(val)) Array.from(el.options).forEach(o => o.selected = val.includes(o.value));
    } else {
      el.value = (val ?? '');
    }
  };
  const getValue = (el) => {
    if (el.type === 'checkbox'){
      const group = container.querySelectorAll(`[data-bind="${el.dataset.bind}"][type="checkbox"]`);
      if (group.length > 1) return Array.from(group).filter(x=>x.checked).map(x=> x.value || '1');
      return !!el.checked;
    }
    if (el.type === 'radio'){
      const group = container.querySelectorAll(`[data-bind="${el.dataset.bind}"][type="radio"]`);
      const checked = Array.from(group).find(x=>x.checked);
      return checked ? (checked.value || '1') : null;
    }
    if (el.tagName === 'SELECT' && el.multiple){
      return Array.from(el.selectedOptions).map(o => o.value);
    }
    return el.value;
  };

  const bindables = container.querySelectorAll('[data-bind]');
  bindables.forEach(el => {
    if (el.__nwBound) return;
    el.__nwBound = true;

    const key = el.dataset.bind;
    const val = state[key];
    if (val !== undefined) setValue(el, val);

    const evt = (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') ? 'change' : 'input';
    el.addEventListener(evt, () => {
      const updated = {};
      updated[key] = getValue(el);
      App.setTabState(tabKey, updated);
    });
  });
}

/* ===================================
   # Extract & mount headerItems + grid
   =================================== */
function extractFromHTML(html){
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const frag = tpl.content;

  // Support either data-mount markers or IDs
  const tabHeader = frag.querySelector('[data-mount="headerItems"]') || frag.querySelector('#headerItems') || null;
  const tabGrid   = frag.querySelector('[data-mount="grid"]')        || frag.querySelector('#grid')        || null;

  return { tabHeader, tabGrid };
}

function applyHeaderItems(tabHeaderEl){
  const host = $(HEADER_BAR_SELECTOR);
  if (!host) return;

  if (tabHeaderEl){
    host.innerHTML = '';
    host.append(...Array.from(tabHeaderEl.childNodes)); // move children only
    host.style.display = '';
  } else {
    host.innerHTML = '';
    host.style.display = 'none';
  }
}

function applyGrid(tabGridEl){
  const contentHost = $(CONTENT_SELECTOR);
  if (!contentHost){
    console.error(`Missing content container: ${CONTENT_SELECTOR}`);
    return;
  }
  contentHost.innerHTML = '';

  if (tabGridEl){
    contentHost.appendChild(tabGridEl); // mount the provided <main id="grid">
  } else {
    // Fallback to keep downstream code stable
    const grid = document.createElement('main');
    grid.id = 'grid';
    grid.className = 'section-grid';
    grid.setAttribute('aria-live','polite');
    contentHost.appendChild(grid);
  }
}

/* ===========================
   # Core: switch tab
   =========================== */
async function switchTab(rawKey){
  const tabKey = resolveTabKey(rawKey);
  if (!tabKey || !TAB_DEFS[tabKey]) {
    console.warn(`Unknown tab "${rawKey}"`);
    return;
  }
  if (tabKey === _currentTabKey) return;

  const token = ++_switchToken;
  const prevKey = _currentTabKey;
  _currentTabKey = tabKey;
  App.currentTab = tabKey;

  // Update active button state early for responsiveness
  markActiveButton(tabKey);

  // 1) Unload previous assets / run cleanup
  unloadTabAssets(prevKey);

  // 2) Inject CSS for new tab (reduce FOUC)
  try { injectTabCSS(tabKey, TAB_DEFS[tabKey].css); } catch(e){ console.warn(e); }

  // 3) Load HTML partial with fallbacks and parse it
  let html = '', usedPath = '';
  try {
    const res = await loadHTMLWithFallback(TAB_DEFS[tabKey].html);
    html = res.html; usedPath = res.used;
  } catch (e) {
    const lbl = TAB_LABELS[tabKey] || tabKey;
    const errPanel = `<section class="panel error"><h2>Couldn’t load ${lbl}</h2><p>${e.message}</p></section>`;
    $(CONTENT_SELECTOR).innerHTML = errPanel;
    console.warn(`[tabs_runtime] ${lbl} load failed: ${e.message}`);
    return;
  }
  if (token !== _switchToken) return; // stale

  const { tabHeader, tabGrid } = extractFromHTML(html);

  // 4) Mount header+grid into the base shell
  applyHeaderItems(tabHeader);
  applyGrid(tabGrid);

  // 5) Inject per-tab JS (sequential)
  try { await injectTabJS(tabKey, TAB_DEFS[tabKey].js); }
  catch(e){ console.warn(e); }

  // 6) Bind inputs in BOTH header bar and grid to App state
  bindInputsIn($(HEADER_BAR_SELECTOR), tabKey);
  bindInputsIn($('#grid') || $(CONTENT_SELECTOR), tabKey);

  // 7) Trigger output rebuild (global)
  try { App.rebuildOutput(); } catch(_) {}

  // 8) Update URL hash (optional)
  if (ENABLE_HASH_ROUTING){
    const nextHash = `#tab=${encodeURIComponent(tabKey)}`;
    if (location.hash !== nextHash) history.replaceState(null, '', nextHash);
  }

  // Log which file was used (handy diagnostics)
  // console.debug(`[tabs_runtime] Mounted "${tabKey}" from: ${usedPath}`);
}

/* ===========================
   # Bootstrapping
   =========================== */
function initTabsRuntime(){
  // Wire clicks on tab buttons
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest(TAB_BUTTONS_SELECTOR);
    if (!btn) return;
    const key = resolveTabKey(btn.dataset.tab);
    if (key) switchTab(key);
  });

  // Choose starting tab
  let start = resolveTabKey(DEFAULT_TAB);
  if (ENABLE_HASH_ROUTING && /^#tab=/.test(location.hash)){
    const keyFromHash = resolveTabKey(decodeURIComponent(location.hash.slice(5)));
    if (keyFromHash) start = keyFromHash;
  }
  if (!start) {
    const first = Object.keys(TAB_DEFS)[0] || null;
    start = resolveTabKey(first);
  }

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
   In a tab JS file (e.g., physical.js):

   (function(){
     // Set up listeners/observers unique to this tab
     const onClick = (e)=>{/* ... *-/};
     document.addEventListener('click', onClick);

     // Optional cleanup (called automatically on tab switch away)
     window.__tabCleanup = window.__tabCleanup || {};
     window.__tabCleanup.pe = () => {
       document.removeEventListener('click', onClick);
       // disconnect observers, clear intervals, etc.
     };
   })();
*/