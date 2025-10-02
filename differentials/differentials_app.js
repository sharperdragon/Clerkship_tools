
/*! Config (edit here) */
const CONFIG = {
  searchDebounceMs: 220,
  defaultView: "grid",
  defaultShowFreq: false,
  stateKey: "diff-ui-state-v4",
};

const PATHS = {
  PRESENTATION_LIST: "./Presentation_list.json",
  BASE_DIR: "./data/presentations",
  // Optional index maps (provide only those you have)
  INDEX_MAPS: {
    clinical: "./clinical_presentation_index.json",
    // biochemical: "./biochemical_presentation_index.json",
    // hematological: "./hematological_presentation_index.json",
  },
};

const SECTION_FOLDERS = {
  "Clinical Presentations": "clinical",
  "Biochemical Presentations": "biochemical",
  "Hematological Presentations": "hematological",
};

/*! UI State */
const UI = {
  q: "",
  section: "",
  systems: new Set(),
  view: CONFIG.defaultView,
  showFreq: CONFIG.defaultShowFreq,
  compact: false,
};

/* ---------------------------------- Utils --------------------------------- */
const $ = (s) => document.querySelector(s);
const hostEl = () => $("#results") || $("#grid");
const statsEl = () => $("#stats");
const errEl = () => $("#error");

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const uniqSorted = (arr) => Array.from(new Set(arr)).sort((a,b)=>a.localeCompare(b));
const val = (o, ...ks) => ks.reduce((a,k)=> (a && a[k]!=null ? a[k] : undefined), o);
function escapeHTML(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function slugify(s){
  return String(s)
    .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")   // strip diacritics
    .replace(/&/g,"and")
    .replace(/['’]/g,"")
    .replace(/[^a-zA-Z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .toLowerCase();
}
function underscorify(s){
  return String(s)
    .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/&/g,"and")
    .replace(/['’]/g,"")
    .replace(/[^a-zA-Z0-9]+/g,"_")
    .replace(/^_+|_+$/g,"")
    .toLowerCase();
}

async function fetchJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} @ ${url}`);
  return res.json();
}

/* ------------------------------- Normalization ---------------------------- */
function mapItem(it){
  const name = String(it?.name ?? it?.etiology ?? it?.title ?? it?.label ?? "—");
  const system = String(it?.system ?? it?.category ?? it?.group ?? "");
  const freq = it?.freq ?? it?.frequency ?? it?.rank ?? undefined;
  return { name, system, freq };
}

function normalizeEntry(title, section, data){
  const itemsRaw = val(data, "items") || val(data, "differentials") || val(data, "etiologies") || val(data, "causes") || [];
  return {
    title: String(title || data?.title || data?.presentation || "Untitled"),
    section: String(section || data?.section || ""),
    items: (itemsRaw || []).map(mapItem),
  };
}

/* ------------------------------ Index Map Load ---------------------------- */
async function loadIndexMap(folder){
  const url = PATHS.INDEX_MAPS[folder];
  if (!url) return null;
  try { return await fetchJSON(url); } catch { return null; }
}

/* ------------------------------ Data Loading ------------------------------ */
async function loadViaPresentationList(){
  const list = await fetchJSON(PATHS.PRESENTATION_LIST); // object: section -> [{name}, ...]
  const out = [];

  // Preload optional maps per folder
  const mapCache = {};
  for (const folder of Object.values(SECTION_FOLDERS)) {
    mapCache[folder] = await loadIndexMap(folder); // can be null
  }

  for (const [section, arr] of Object.entries(list)) {
    const folder = SECTION_FOLDERS[section];
    if (!folder) continue;
    for (const obj of arr) {
      const name = typeof obj === "string" ? obj : obj?.name;
      if (!name) continue;

      // Resolve filename via index map first (if present)
      const mapped = mapCache[folder]?.[name]; // e.g., "pyrexia-of-unknown-origin"
      const base = `${PATHS.BASE_DIR}/${folder}`;

      const candidates = [];
      const nameSlug = slugify(name);
      const nameUnder = underscorify(name);

      // If index mapping exists, try that first
      if (mapped) {
        const mSlug = slugify(mapped);
        candidates.push(`${base}/${mSlug}.json`, `${base}/other/${mSlug}.json`, `${base}/${mapped}.json`);
      }

      // Common filename variants
      candidates.push(
        `${base}/${nameSlug}.json`,
        `${base}/other/${nameSlug}.json`,
        `${base}/${nameUnder}.json`,
        `${base}/${name}.json`,                       // as-is (rare)
        `${base}/${nameSlug}.JSON`                    // case variant
      );

      // Try to fetch first one that exists
      let data = null;
      for (const url of candidates) {
        try { data = await fetchJSON(url); break; } catch {}
      }

      out.push(normalizeEntry(name, section, data || {}));
    }
  }
  return out;
}

async function loadFallback(){
  try {
    const raw = await fetchJSON("./differentials.json");
    if (Array.isArray(raw) && raw[0]?.items && raw[0]?.title) return raw.map(e=>normalizeEntry(e.title, e.section, e));
    return (Array.isArray(raw) ? raw : []).map(e => normalizeEntry(e.title || e.presentation || e.name, e.section, e));
  } catch { return []; }
}

async function loadData(){
  try {
    const entries = await loadViaPresentationList();
    if (entries.some(e => e.items?.length)) return entries;
  } catch { /* fall through */ }
  return await loadFallback();
}

/* -------------------------------- Rendering ------------------------------- */
function setStats(t){ const el = statsEl(); if (el) el.textContent = t; }
function setError(m){ const el = errEl(); if (el){ el.hidden = false; el.textContent = m; } }
function clearError(){ const el = errEl(); if (el){ el.hidden = true; el.textContent = ""; } }

function renderSystemsChips(allSystems){
  const box = $("#systemChips"); if (!box) return;
  box.innerHTML = "";
  allSystems.forEach(sys=>{
    const b = document.createElement("button");
    b.type="button";
    b.className = "chip" + (UI.systems.has(sys) ? " chip--on" : "");
    b.textContent = sys || "—";
    b.addEventListener("click", ()=>{
      UI.systems.has(sys) ? UI.systems.delete(sys) : UI.systems.add(sys);
      saveState(); renderSystemsChips(allSystems);
    });
    box.appendChild(b);
  });
}

function applyFilters(entries){
  const q = UI.q.trim().toLowerCase();
  const hasSys = UI.systems.size>0;

  return entries
    .filter(e => !UI.section || e.section === UI.section)
    .map(e=>{
      const items = (e.items||[]).filter(it=>{
        const okSys = !hasSys || UI.systems.has(it.system || "");
        if (!okSys) return false;
        if (!q) return true;
        const hay = [e.title,e.section,it.name,it.system].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
      const titleHit = q && e.title.toLowerCase().includes(q);
      const itemsFinal = titleHit ? (e.items||[]).filter(it=>!hasSys || UI.systems.has(it.system||"")) : items;
      return { ...e, items: itemsFinal };
    })
    .filter(e => (e.items||[]).length > 0 || (q && e.title.toLowerCase().includes(q)));
}

function packGrid(){ /* hook for masonry if needed */ }

function renderGrid(entries){
  const host = hostEl();
  host.className = "grid";
  host.innerHTML = "";

  if (!entries.length) {
    return host.appendChild(emptyNode());
  }

  // ! Collapse any expanded cards
  const collapseAll = () => {
    host.querySelectorAll(".card--expanded").forEach((c) => {
      c.classList.remove("card--expanded");
      c.style.gridColumn = ""; // reset inline span
      const body = c.querySelector(".card__body");
      const btn = c.querySelector(".card__collapse");
      if (body) body.hidden = true;
      if (btn) btn.hidden = true;
    });
  };

  // ? Helper: ignore clicks on interactive elements inside the card
  const isInteractive = (el) =>
    !!el.closest?.("button, a, summary, input, select, textarea, .chip");

  entries.forEach((e) => {
    // Build card
    const card = document.createElement("article");
    card.className = "card";
    card.tabIndex = 0;

    const header = document.createElement("header");
    header.className = "card__hd";

    const title = document.createElement("h3");
    title.className = "card__title";
    title.textContent = e.title;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = e.section || "—";

    // $ Collapse button (only visible when expanded)
    const collapseBtn = document.createElement("button");
    collapseBtn.className = "card__collapse btn small ghost";
    collapseBtn.setAttribute("aria-label", "Collapse");
    collapseBtn.textContent = "Collapse";
    collapseBtn.hidden = true;

    header.append(title, badge, collapseBtn);

    const meta = document.createElement("div");
    meta.className = "card__meta";
    meta.textContent = `${e.items.length} etiologies`;

    // const details = document.createElement("details");
    // details.className = "card__details";
    const body = document.createElement("div");
    body.className = "card__body";
    body.hidden = true; // start hidden; revealed on expand

    // Build etiologies table
    const table = document.createElement("table");
    table.className = "soft-table";
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Etiology", "System", "Frequency"].forEach(label => {
      const th = document.createElement("th");
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const it of e.items) {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td"); td1.textContent = it.name;
      const td2 = document.createElement("td"); td2.textContent = it.system || "—";
      tr.append(td1, td2);
      if (UI.showFreq) {
        const td3 = document.createElement("td"); td3.textContent = it.freq ?? "—";
        tr.appendChild(td3);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    body.appendChild(table);

    // details.append(body);
    card.append(header, meta, body);
    host.appendChild(card);

    // ! Expand on card click (except when clicking interactive controls)
    card.addEventListener("click", (ev) => {
      if (isInteractive(ev.target)) return;

      // Triple-click on expanded card collapses it back
      if (card.classList.contains("card--expanded") && ev.detail === 3) {
        card.classList.remove("card--expanded");
        card.style.gridColumn = "";
        body.hidden = true;
        collapseBtn.hidden = true;
        packGrid();
        return;
      }

      // If already expanded, do nothing (use explicit Collapse action instead)
      if (card.classList.contains("card--expanded")) return;

      collapseAll();
      card.classList.add("card--expanded");
      card.style.gridColumn = "1 / -1";         // span full width without relying on CSS
      body.hidden = false;
      collapseBtn.hidden = false;
      packGrid();
    });

    // ? Collapse button behavior
    collapseBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      card.classList.remove("card--expanded");
      card.style.gridColumn = "";
      body.hidden = true;
      collapseBtn.hidden = true;
      packGrid();
    });
  });

  // Click-away + Escape collapse handlers (one active set per render)
  const onClickAway = (e) => {
    const insideCard = e.target && e.target.closest && e.target.closest(".card");
    if (!insideCard) {
      collapseAll();
    }
  };
  const onEsc = (e) => {
    if (e.key === "Escape") collapseAll();
  };

  // Avoid duplicating listeners across re-renders
  document.removeEventListener("click", host._cardAwayHandler);
  document.removeEventListener("keydown", host._cardEscHandler);
  host._cardAwayHandler = onClickAway;
  host._cardEscHandler = onEsc;
  document.addEventListener("click", onClickAway);
  document.addEventListener("keydown", onEsc);

  packGrid();
}

function renderList(entries){
  const host = hostEl(); host.className = "list-wrap"; host.innerHTML = "";
  if (!entries.length) return host.appendChild(emptyNode());

  const table = document.createElement("table");
  table.className = "list";
  table.innerHTML = `
    <thead><tr>
      <th>Presentation</th><th>Etiology</th><th>System</th><th class="th-freq">Freq</th>
    </tr></thead><tbody></tbody>`;
  table.querySelector(".th-freq").style.display = UI.showFreq ? "" : "none";
  const tbody = table.querySelector("tbody");

  for (const e of entries){
    e.items.forEach((it, idx)=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="${idx===0?"td-pres":"td-pres td-pres--repeat"}">${idx===0?escapeHTML(e.title):""}</td>
        <td>${escapeHTML(it.name)}</td>
        <td>${escapeHTML(it.system || "—")}</td>
        <td style="display:${UI.showFreq?"":"none"}">${escapeHTML(it.freq ?? "—")}</td>`;
      tbody.appendChild(tr);
    });
  }
  host.appendChild(table);
}

function emptyNode(){
  const d = document.createElement("div");
  d.className = "empty";
  d.innerHTML = `<div class="empty__title">No matches</div><div class="empty__body">Try broader terms or clear filters.</div>`;
  return d;
}

function render(entries, all){
  clearError();
  const filtered = applyFilters(entries);
  const totalItems = all.reduce((n,e)=>n+(e.items?.length||0),0);
  const filteredItems = filtered.reduce((n,e)=>n+(e.items?.length||0),0);
  setStats(`${filtered.length} results · ${filteredItems} etiologies · ${totalItems} total loaded`);
  document.body.classList.toggle("compact", UI.compact);
  (UI.view==="list" ? renderList : renderGrid)(filtered);
  writeHash(); saveState();
}

/* ------------------------------- Wire controls ---------------------------- */
function wireUI(data){
  const q=$("#q"), section=$("#section"), sectionDrawer=$("#sectionDrawer");
  const btnGrid=$("#btnGrid"), btnList=$("#btnList");
  const toggleFreq=$("#toggleFreq"), toggleCompact=$("#toggleCompact");

  // Systems inventory
  const systemsAll = uniqSorted(data.flatMap(e=> (e.items||[]).map(it=>it.system||"")).filter(Boolean));
  renderSystemsChips(systemsAll);

  // Sync initial
  if (q) q.value = UI.q;
  if (section) section.value = UI.section;
  if (sectionDrawer) sectionDrawer.value = UI.section;
  if (toggleFreq) toggleFreq.checked = UI.showFreq;
  if (toggleCompact) toggleCompact.checked = UI.compact;
  updateViewButtons();

  if (q) q.addEventListener("input", debounce(()=>{ UI.q = q.value; render(data,data); }, CONFIG.searchDebounceMs));
  if (section) section.addEventListener("change", ()=>{ UI.section = section.value; if (sectionDrawer) sectionDrawer.value = UI.section; render(data,data); });

  if (btnGrid) btnGrid.addEventListener("click", ()=>{ UI.view="grid"; updateViewButtons(); render(data,data); });
  if (btnList) btnList.addEventListener("click", ()=>{ UI.view="list"; updateViewButtons(); render(data,data); });

  const btnOpen=$("#btnOpenFilters"), btnClose=$("#btnCloseFilters"), scrim=$("#drawerScrim");
  if (btnOpen) btnOpen.addEventListener("click", openDrawer);
  if (btnClose) btnClose.addEventListener("click", closeDrawer);
  if (scrim) scrim.addEventListener("click", closeDrawer);

  document.addEventListener("keydown",(e)=>{
    if (e.key==="Escape"){ if(!isDrawerHidden()) closeDrawer(); else if (q===document.activeElement) q.blur(); }
    if (e.key==="/"){ if(!e.metaKey && !e.ctrlKey && !e.altKey && q){ e.preventDefault(); q.focus(); } }
  });

  if (sectionDrawer) sectionDrawer.addEventListener("change", ()=>{ UI.section = sectionDrawer.value; if (section) section.value = UI.section; });
  if (toggleFreq) toggleFreq.addEventListener("change", ()=> UI.showFreq = toggleFreq.checked);
  if (toggleCompact) toggleCompact.addEventListener("change", ()=> UI.compact = toggleCompact.checked);

  const btnClear=$("#btnClearFilters"), btnApply=$("#btnApplyFilters");
  if (btnClear) btnClear.addEventListener("click", ()=>{
    UI.section=""; UI.systems.clear(); UI.showFreq=CONFIG.defaultShowFreq; UI.compact=false;
    if (section) section.value=""; if (sectionDrawer) sectionDrawer.value="";
    if (toggleFreq) toggleFreq.checked=UI.showFreq; if (toggleCompact) toggleCompact.checked=UI.compact;
    renderSystemsChips(systemsAll);
  });
  if (btnApply) btnApply.addEventListener("click", ()=>{ closeDrawer(); render(data,data); });

  render(data,data);

  function updateViewButtons(){
    const isGrid = UI.view==="grid";
    if (btnGrid){ btnGrid.classList.toggle("ghost", !isGrid); btnGrid.setAttribute("aria-pressed", String(isGrid)); }
    if (btnList){ btnList.classList.toggle("ghost", isGrid); btnList.setAttribute("aria-pressed", String(!isGrid)); }
  }
}

/* ------------------------------- Drawer helpers --------------------------- */
function isDrawerHidden(){ const dr=$("#drawer"); return !dr || dr.getAttribute("aria-hidden")==="true"; }
function openDrawer(){ const dr=$("#drawer"); if (!dr) return; dr.setAttribute("aria-hidden","false"); document.body.classList.add("scrim-on"); }
function closeDrawer(){ const dr=$("#drawer"); if (!dr) return; dr.setAttribute("aria-hidden","true"); document.body.classList.remove("scrim-on"); }

/* ------------------------------ State & Hash ------------------------------ */
function loadState(){
  try{ const raw=localStorage.getItem(CONFIG.stateKey); if(!raw) return;
    const s=JSON.parse(raw);
    UI.q=s.q??UI.q; UI.section=s.section??UI.section; UI.systems=new Set(s.systems||[]);
    UI.view=s.view||UI.view; UI.showFreq=!!s.showFreq; UI.compact=!!s.compact;
  }catch{}
}
function saveState(){ const s={ q:UI.q, section:UI.section, systems:[...UI.systems], view:UI.view, showFreq:UI.showFreq, compact:UI.compact }; localStorage.setItem(CONFIG.stateKey, JSON.stringify(s)); }
function readHash(){ try{ if(!location.hash) return; const s=JSON.parse(decodeURIComponent(location.hash.slice(1)));
  if(typeof s.q==="string") UI.q=s.q; if(typeof s.section==="string") UI.section=s.section;
  if(Array.isArray(s.systems)) UI.systems=new Set(s.systems);
  if(s.view==="grid"||s.view==="list") UI.view=s.view;
  if(typeof s.showFreq==="boolean") UI.showFreq=s.showFreq;
  if(typeof s.compact==="boolean") UI.compact=s.compact;
} catch{} }
function writeHash(){ const s={ q:UI.q, section:UI.section, systems:[...UI.systems], view:UI.view, showFreq:UI.showFreq, compact:UI.compact }; location.hash = encodeURIComponent(JSON.stringify(s)); }

/* ----------------------------------- Boot --------------------------------- */
(async function boot(){
  loadState(); readHash();
  try{
    setStats("Loading…");
    const data = await loadData();
    // Optional: inject section options if header select exists and is empty
    // (we leave your hard-coded options intact)
    wireUI(data);
  }catch(err){ setError(err.message || "Unexpected error"); }
})();