
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


async function switchMode(mode){
  state.mode = mode;
  try {
    Templates = await loadTemplatesForMode(mode);
  } catch (e) {
    // Fallback: read inline <script type="application/json" id="templates-fallback">
    const node = document.getElementById("templates-fallback");
    if (node && node.textContent.trim()) {
      try {
        Templates = JSON.parse(node.textContent);
        console.warn(`[NoteWriter] Using inline templates fallback for ${mode}.`);
      } catch (e2) {
        return showFatal("Inline templates fallback is invalid JSON.");
      }
    } else {
      return showFatal(`Could not load templates for mode ${mode}.`);
    }
  }

  if (!Templates?.sectionsByMode || !Templates?.sectionDefs) {
    return showFatal("templates schema missing required keys.");
  }
  const first = Templates.sectionsByMode[mode]?.[0];
  if (!first) return showFatal(`No sections for mode "${mode}".`);
  state.activeSection = first;
  ensureSectionState();
  renderAll();
}

/*** STATE ***/
let Templates = null;
let state = {
  mode: DEFAULT_MODE,
  activeSection: null,
  columns: DEFAULT_COLUMNS,
  sections: {},
  globals: {},
  patientId: null,
};
document.addEventListener("DOMContentLoaded", init);

const GRADE_LABELS = {
  pulses: ["0","1+","2+","3+"],
  s3s4:   ["1","2","3","4","5","6"],
  edema:  ["1+","2+","3+","4+"]
};
const SIDE_LABELS = { R:"R", L:"L", B:"bilateral" };
const isPos = (v)=> typeof v === "object" && v?.state === "pos";
const isNeg = (v)=> v === 'neg';
const asObj = (v)=> (typeof v === "object" ? v : null);


async function init(){
  const restored = maybeRestoreState();
  // Load templates and set activeSection for the (possibly restored) mode
  await switchMode(state.mode || DEFAULT_MODE);
  wireHeader();
  renderPatientControls();
  applySticky();
  renderCompleteSoon();
}

function showFatal(msg){
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  grid.appendChild(document.createTextNode("ERROR: " + msg));
  console.error("[NoteWriter]", msg);
}
function renderAll(){ renderTier1(); renderTier2(); renderHeaderChecks(); renderGrid(); renderOutput(); wireHeader(); applySticky(); }

function renderTier1(){
  const wrap = document.getElementById("tier1");
  wrap.innerHTML = "";
  MODE_LIST.forEach(m => {
    const btn = document.createElement("button");
    btn.className = "tab" + (m === state.mode ? " active" : "");
    btn.textContent = MODE_LABELS[m] || m;
    btn.onclick = async ()=>{ await switchMode(m); };
    wrap.appendChild(btn);
  });
  applySticky();
}

function renderTier2(){
  const wrap = document.getElementById("tier2"); wrap.innerHTML="";
  (Templates.sectionsByMode[state.mode]||[]).forEach(sec=>{
    const btn = document.createElement("button");
    btn.className = "tab" + (sec===state.activeSection ? " active" : "");
    btn.textContent = sec;
    btn.onclick = ()=>{ state.activeSection = sec; ensureSectionState(); renderGrid(); renderOutput(); renderCompleteSoon(); };
    wrap.appendChild(btn);
  });
  applySticky();
}

function px(n){ return `${Math.max(0, Math.round(n))}px`; }

function applySticky(){
  const appbar = document.querySelector('.appbar');
  const tier1  = document.getElementById('tier1');
  const tier2  = document.getElementById('tier2');
  const checks = document.getElementById('headerItems');

  if (!tier1 || !tier2 || !checks) return;

  // Measure current heights (fallbacks keep it robust)
  const appbarH = appbar?.getBoundingClientRect?.().height || STK.appbarMin;
  const tier1H  = tier1.getBoundingClientRect?.().height || STK.tier1Min;
  const tier2H  = tier2.getBoundingClientRect?.().height || STK.tier2Min;

  // Tier 1 sticky under appbar
  tier1.style.position = 'sticky';
  tier1.style.top      = px(appbarH);
  tier1.style.zIndex   = String(STK.z.tier1);
  if (!tier1.style.background) tier1.style.background = '#eef2f7';

  // Tier 2 sticky under Tier 1
  tier2.style.position = 'sticky';
  tier2.style.top      = px(appbarH + tier1H);
  tier2.style.zIndex   = String(STK.z.tier2);
  if (!tier2.style.background) tier2.style.background = '#f6f8fb';

  // Header checks sticky under Tier 2
  checks.style.position = 'sticky';
  checks.style.top      = px(appbarH + tier1H + tier2H);
  checks.style.zIndex   = String(STK.z.checks);
  if (!checks.style.background)   checks.style.background   = '#fff';
  if (!checks.style.borderBottom) checks.style.borderBottom = '1px solid var(--divider)';
}

// Re-apply sticky on window resize
window.addEventListener('resize', debounce(applySticky, 120));
// Helper to create a row div with the current mode as a class, plus any extra class
function makeRow(extraClass){
  const d = document.createElement("div");
  d.className = "row " + state.mode + (extraClass ? (" " + extraClass) : "");
  return d;
}

function renderHeaderChecks(){
  const host = document.getElementById("headerItems");
  host.innerHTML = "";
  const def = Templates.sectionDefs[`${state.mode}:${state.activeSection}`];
  if (!def?.headerItems?.length) {
    host.style.display = "none";
    return;
  }
  host.style.display = "";
  const wrap = makeRow("header-checks");
  def.headerItems.forEach(t=>{
    wrap.appendChild(
      cb(
        t.id,
        t.label,
        !!getSec().checkboxes?.[t.id],
        v=>{ setCB(t.id, v); renderOutput(); renderCompleteSoon(); }
      )
    );
  });
  host.appendChild(wrap);
  applySticky();
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
  if (def.headerItems?.length) {
    const checks = def.headerItems
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

// ====== Patient history (multi-patient cache) ======
function _getPatientList(){
  try { return JSON.parse(localStorage.getItem(CK.PATLIST) || "[]"); } catch { return []; }
}
function _setPatientList(list){
  try { localStorage.setItem(CK.PATLIST, JSON.stringify(list)); } catch {}
}
function _patientKey(id){ return `${CK.STATE}:${id}`; }
function _setCurrentPatient(id){ try { localStorage.setItem(CK.CURRENT, id); } catch {} }
function _getCurrentPatient(){ try { return localStorage.getItem(CK.CURRENT) || null; } catch { return null; } }
function _fmtTime(ts){ try { return new Date(ts).toLocaleString(); } catch { return String(ts); } }

function createNewPatient(){
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const createdAt = Date.now();

  const list = _getPatientList();
  list.push({ id, createdAt });
  _setPatientList(list);
  _setCurrentPatient(id);

  state = {
    mode: DEFAULT_MODE,
    activeSection: null,
    columns: DEFAULT_COLUMNS,
    sections: {},
    globals: {},
    patientId: id,
  };

  switchMode(DEFAULT_MODE);
}

async function loadPatientById(id){
  if (!id) return;
  _setCurrentPatient(id);
  try {
    const raw = localStorage.getItem(_patientKey(id));
    if (!raw){
      state = {
        mode: DEFAULT_MODE,
        activeSection: null,
        columns: DEFAULT_COLUMNS,
        sections: {},
        globals: {},
        patientId: id,
      };
      await switchMode(DEFAULT_MODE);
      renderAll();
      return;
    }
    const saved = JSON.parse(raw);
    state = {
      mode: saved.mode || DEFAULT_MODE,
      activeSection: saved.activeSection || null,
      columns: saved.columns || DEFAULT_COLUMNS,
      sections: saved.sections || {},
      globals: saved.globals || {},
      patientId: id,
    };
    await switchMode(state.mode || DEFAULT_MODE);
    renderAll();
  } catch (e) {
    console.error("[NoteWriter] Failed to load patient", id, e);
  }
}

function renderPatientControls(){
  const bar = document.querySelector(".tools");
  if (!bar) return;

  let host = bar.querySelector('[data-role="patient-controls"]');
  if (!host){
    host = document.createElement("div");
    host.dataset.role = "patient-controls";
    host.style.display = "inline-flex";
    host.style.gap = "8px";
    host.style.marginLeft = "8px";
    bar.appendChild(host);
  } else {
    host.innerHTML = "";
  }

  const btn = document.createElement("button");
  btn.textContent = "New Patient";
  btn.title = "Start a new patient session";
  btn.onclick = ()=>{ createNewPatient(); };
  host.appendChild(btn);

  const sel = document.createElement("select");
  const list = _getPatientList().slice().sort((a,b)=>b.createdAt - a.createdAt);
  const cur = _getCurrentPatient();

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Select previous…";
  sel.appendChild(opt0);

  list.forEach(p=>{
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = _fmtTime(p.createdAt);
    if (p.id === cur) o.selected = true;
    sel.appendChild(o);
  });

  sel.onchange = async (e)=>{
    const id = e.target.value || cur;
    if (id) await loadPatientById(id);
  };
  host.appendChild(sel);
}

// Completely clear patient history (does NOT touch template cache)
function clearAllPatients(){
  try {
    // delete all per-patient state blobs
    Object.keys(localStorage).forEach(k=>{
      if (k.startsWith(`${CK.STATE}:`)) localStorage.removeItem(k);
    });
    // remove patient list + current pointer
    localStorage.removeItem(CK.PATLIST);
    localStorage.removeItem(CK.CURRENT);
  } catch {}

  // Reset in-memory state & start fresh with a new patient
  state = {
    mode: DEFAULT_MODE,
    activeSection: null,
    columns: DEFAULT_COLUMNS,
    sections: {},
    globals: {},
    patientId: null,
  };
  createNewPatient();   // sets new id + switches mode + renders
}

// ====== State persistence (autosave + restore) ======
let _saveTimer = null;
function saveStateSoon(){
  if (!CACHE_ENABLED) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(()=>{
    try {
      const id = state.patientId || _getCurrentPatient();
      if (id) {
        localStorage.setItem(_patientKey(id), JSON.stringify({
          mode: state.mode,
          activeSection: state.activeSection,
          columns: state.columns,
          sections: state.sections,
          globals: state.globals,
        }));
        _setCurrentPatient(id);
      }
    } catch {}
  }, STATE_AUTOSAVE_MS);
}

function maybeRestoreState(){
  if (!CACHE_ENABLED) return false;
  const cur = _getCurrentPatient();
  if (cur){
    try {
      const raw = localStorage.getItem(_patientKey(cur));
      if (!raw) { state.patientId = cur; return true; }
      const saved = JSON.parse(raw);
      state = {
        mode: saved.mode || DEFAULT_MODE,
        activeSection: saved.activeSection || null,
        columns: saved.columns || DEFAULT_COLUMNS,
        sections: saved.sections || {},
        globals: saved.globals || {},
        patientId: cur,
      };
      return true;
    } catch {}
  }
  createNewPatient();
  return true;
}

// helpers you also need:
function panel(title){ const s=document.createElement("section"); s.className="panel";
  const h=document.createElement("div"); h.className="panel-header"; h.textContent=title; s.appendChild(h); return s; }
function applyCbSelectedClass(wrapperLabel, inputEl){
  if (inputEl.checked) wrapperLabel.classList.add("selected");
  else wrapperLabel.classList.remove("selected");
}

function cb(id,label,checked,on){
  const w=document.createElement("label"); 
  w.className="cb";
  const i=document.createElement("input"); 
  i.type="checkbox"; 
  i.checked=checked;

  // initial selected state class
  applyCbSelectedClass(w, i);

  i.onchange=e=>{
    on(e.target.checked);
    applyCbSelectedClass(w, i);
  };

  w.appendChild(i); 
  w.appendChild(document.createTextNode(label)); 
  return w;
}

function setField(id, val){
  getSec().fields[id] = val;
  saveStateSoon();
  renderCompleteSoon();
}
function setCB(id,val){
  getSec().checkboxes[id]=val;
  saveStateSoon();
  renderCompleteSoon();
}

function getField(id){
  const sec = getSec();
  return (sec.fields && Object.prototype.hasOwnProperty.call(sec.fields, id))
    ? sec.fields[id]
    : undefined;
}

// ===== Complete Note aggregation (cross-mode) =====
// Collect text for a specific mode without switching the visible UI mode
async function buildNoteForMode(mode){
  try {
    const tpl = await loadTemplatesForMode(mode);
    return collectTextFromTemplates(mode, tpl);
  } catch (e) {
    console.debug('[CompleteNote] template load failed for', mode, e?.message || e);
    return '';
  }
}

// Walk the templates for a mode and assemble text from state
function collectTextFromTemplates(mode, tpl){
  if (!tpl || typeof tpl !== 'object') return '';
  const out = [];
  const secDefs = tpl.sectionDefs || {};
  Object.keys(secDefs).forEach(groupKey => {
    const group = secDefs[groupKey];
    (group.panels || []).forEach(pd => {
      // Fields (skip booleans; honor showIf like renderGrid/renderOutput)
      if (Array.isArray(pd.fields)){
        pd.fields.forEach(f => {
          if (!shouldShowField(f)) return;
          if (f.type === 'boolean') return;
          const sec = getSecFor(mode, groupKey);
          const raw = (sec.fields && sec.fields[f.id]);
          const v = (typeof raw === 'string' ? raw.trim() : '');
          if (v) out.push(`${f.label}: ${v}.`);
        });
      }
      // If you want chips/grades/etc included, mirror their encoding here.
    });
  });
  return out.join(' ');
}

// Safe accessor for another mode's section bucket (no UI switch)
function getSecFor(mode, groupKey){
  const key = `${mode}:${groupKey}`;
  state.sections[key] ??= { checkboxes:{}, chips:{}, fields:{} };
  return state.sections[key];
}

let _completeTimer = null;
function renderCompleteSoon(){
  clearTimeout(_completeTimer);
  _completeTimer = setTimeout(() => { renderCompleteNote(); }, COMPLETE_NOTE_MS);
}

async function renderCompleteNote(){
  const box = document.getElementById('completeOut');
  if (!box) return;
  const modes = Object.keys(MODE_FILES || {});
  const parts = [];
  for (const m of modes){
    try {
      const txt = await buildNoteForMode(m);
      if (txt && txt.trim()) parts.push(`${m}:\n${txt.trim()}\n`);
    } catch (e) {
      console.debug('[CompleteNote] skip', m, e?.message || e);
    }
  }
  box.value = parts.join('\n').trim();
}

// Single-line input (text) with label
function fieldText(id, label, value, onChange, placeholder){
  const wrap = document.createElement("label");
  wrap.className = "field";
  const span = document.createElement("span");
  span.className = "field-label";
  span.textContent = label;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.placeholder = (placeholder ?? label);
  input.oninput = (e) => onChange(e.target.value);
  wrap.append(span, input);
  return wrap;
}

// Visibility helper for conditional fields
function shouldShowField(f) {
  if (!f || !f.showIf) return true;
  const depVal = getField(f.showIf.field);
  return depVal === f.showIf.equals;
}

// Boolean field (Yes/No) with optional UI labels
function fieldBoolean(id, label, value, onChange, ui = {}) {
  const yesLabel = ui.trueLabel ?? "Yes";
  const noLabel  = ui.falseLabel  ?? "No";

  const wrap = document.createElement("fieldset");
  wrap.className = "field field-boolean";
  const legend = document.createElement("legend");
  legend.className = "field-label";
  legend.textContent = label;
  wrap.appendChild(legend);

  // radio group name must be unique per field id
  const name = `bool_${id}`;

  const mkOpt = (lab, val) => {
    const optWrap = document.createElement("label");
    optWrap.className = "bool-opt";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.checked = value === val;
    input.onchange = () => onChange(val);
    const span = document.createElement("span");
    span.textContent = lab;
    optWrap.append(input, span);
    return optWrap;
  };

  wrap.appendChild(mkOpt(yesLabel, true));
  wrap.appendChild(mkOpt(noLabel, false));
  return wrap;
}

// Helper to apply chip visual state classes and a debug data attribute
function applyChipVisualState(el, pos, neg){
  const classes = ["chip"];
  if (pos)      classes.push(CLASS_CRITICAL);
  else if (neg) classes.push(CLASS_NORMAL);
  el.className = classes.join(" ");
  // Debug-friendly attribute so you can see state in DevTools
  el.setAttribute("data-state", pos ? "critical" : (neg ? "normal" : "neutral"));
}

function chip(def, value, onMouse){
  // value: 0 | 'neg' | {state:'pos', side?, grade?, tags?}
  const d = document.createElement("div");
  const pos = isPos(value), neg = isNeg(value);
  applyChipVisualState(d, pos, neg);
  d.title = `state: ${pos ? "critical" : (neg ? "normal" : "neutral")}`;
  d.oncontextmenu = (e)=>e.preventDefault();
  d.onpointerdown = onMouse;   // use pointer events for reliable L/R detection
  // Fallback for environments that don't deliver button codes on pointer events
  if (!("onpointerdown" in window)) {
    d.onmousedown = onMouse;
  }

  const affPlus = document.createElement("button");
  affPlus.type = "button";
  affPlus.className = "aff plus";
  affPlus.textContent = "+";
  affPlus.onclick = (e) => {
    e.stopPropagation();
    setChipPos(def.id);
    renderGrid(); renderOutput();
  };

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = def.label;

  const affMinus = document.createElement("button");
  affMinus.type = "button";
  affMinus.className = "aff minus";
  affMinus.textContent = "–";
  affMinus.onclick = (e) => {
    e.stopPropagation();
    setChipPos(def.id); // minus now sets ABNORMAL (critical), same as right-click
    renderGrid();
    renderOutput();
  };

  d.append(affPlus, label, affMinus);

  if (pos && def.mods){
    const mods = document.createElement("div");
    mods.className = "chip-mods";
    // grades
    if (def.mods.grades){
      const labels = GRADE_LABELS[def.mods.grades] || [];
      labels.forEach((lab, idx)=>{
        const b = miniBtn(lab, asObj(value)?.grade === idx, ()=> setChipGrade(def.id, idx));
        mods.appendChild(b);
      });
    }
    // sides
    if ((def.type||"").includes("sided")){
      [["R","R"],["L","L"],["B","bilat"]].forEach(([code,lab])=>{
        const b = miniBtn(lab, asObj(value)?.side===code, ()=> setChipSide(def.id, code));
        mods.appendChild(b);
      });
    }
    // tags
    if (def.mods.tags){
      def.mods.tags.forEach(tag=>{
        const on = !!asObj(value)?.tags?.[tag];
        mods.appendChild(miniBtn(tag, on, ()=> setChipTag(def.id, tag, !on)));
      });
    }
    d.appendChild(mods);
  }
  return d;
}

function miniBtn(label, active, on){
  const b = document.createElement("button");
  b.type="button";
  b.className = "btn-mini" + (active ? " active" : "");
  b.textContent = label;
  b.onclick = (e)=>{ e.stopPropagation(); on(); };  // prevent chip's handler from firing on mini button clicks
  return b;
}

function setChipPos(id){
  const s=getSec(); const cur=s.chips[id];
  s.chips[id] = isPos(cur) ? cur : { state:'pos' };
  saveStateSoon();
}

function setChipNeg(id){ getSec().chips[id] = 'neg'; saveStateSoon(); }
function clearChip(id){  getSec().chips[id] = 0; saveStateSoon(); }

function setChipGrade(id, grade){ setChipPos(id); getSec().chips[id].grade = grade; saveStateSoon(); renderOutput(); renderGrid(); renderCompleteSoon(); }
function setChipSide(id, side){  setChipPos(id); getSec().chips[id].side  = side;  saveStateSoon(); renderOutput(); renderGrid(); renderCompleteSoon(); }
function setChipTag(id, tag, on){ setChipPos(id); (getSec().chips[id].tags ??= {})[tag] = !!on; saveStateSoon(); renderOutput(); renderCompleteSoon(); }

function setChipState(id, next){  // next: 0 | 'neg' | 'pos'
  const s = getSec();
  s.chips[id] = next;
  saveStateSoon();
}

function handleChipMouse(e, id){
  console.debug("chip mousedown", { id, button: e.button, mode: state.mode });
  // 0 = left, 2 = right
  if (e.button === 2) {           // right click -> present/abnormal
    e.preventDefault();
    setChipPos(id);               // guarantees object {state:'pos',...}
    // If we're in ROS, adding a positive should unset the section's 'neg' checkbox
    if (state.mode === "ROS"){
      const sec = getSec();
      Object.keys(sec.checkboxes || {}).forEach(k => { if (/_neg$/.test(k)) sec.checkboxes[k] = false; });
    }
  } else if (e.button === 0) {    // left click -> normal/absent (toggle to clear)
    const cur = getSec().chips?.[id] || 0;
    getSec().chips[id] = isNeg(cur) ? 0 : 'neg';
  }
  console.debug("chip state", { id, value: getSec().chips[id] });
  // Repaint UI every time so classes/inline controls update immediately
  saveStateSoon();
  renderGrid();
  renderOutput();
  renderCompleteSoon();
}

function ensureSectionState(){
  (Templates.sectionsByMode[state.mode]||[]).forEach(sec=>{
    const k = `${state.mode}:${sec}`;
    state.sections[k] ??= { checkboxes:{}, chips:{}, fields:{} };
  });
}
function getSec(){
  const k = `${state.mode}:${state.activeSection}`;
  state.sections[k] ??= { checkboxes:{}, chips:{}, fields:{} };
  return state.sections[k];
}
function toggleChip(id){ const s=getSec(); s.chips[id]=!s.chips[id]; }

function findDef(secKey, id){
  const def = Templates.sectionDefs[secKey];
  return [
    ...(def?.headerItems||[]), 
    ...(def?.headerToggles||[]),
    ...((def?.panels||[]).flatMap(p=>[
      ...(p.checkboxes||[]),
      ...(p.chips||[]),
      ...((p.subsections||[]).flatMap(ss=>[
        ...(ss.checkboxes||[]),
        ...(ss.chips||[])
      ]))
    ]))
  ].find(x=>x.id===id) || {label:id};
}

function formatChipForOutput(secKey, id, v){
  const def = findDef(secKey, id);
  const obj = asObj(v) || {};

  // Prefer explicit abnormal text from template; fall back to the label
  const base = (def.abnText || def.label || id).replace(/^\+\s*/, "");
  const parts = [base];

  // Attach modifiers (side -> leading, grade/tags -> trailing)
  if (obj.side) parts.unshift(SIDE_LABELS[obj.side] || obj.side);
  if (typeof obj.grade === "number" && def.mods?.grades){
    const glab = (GRADE_LABELS[def.mods.grades] || [])[obj.grade];
    if (glab) parts.push(glab);
  }
  if (obj.tags){
    Object.entries(obj.tags).forEach(([tag, on]) => { if (on) parts.push(tag); });
  }

  // Visual criticality handled via chip classes; no bold here
  return parts.join(" ");
}

function escapeHTML(s){
  return String(s).replace(/[&<>\"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  })[c]);
}

function labelFor(secKey, id){
  // Reuse the same lookup as output rendering, including subsections
  const d = findDef(secKey, id);
  return d?.label || id;
}

function renderMatrixPanel(pd){
  const p = panel(pd.title);
  const m = pd.matrix || {};
  const sec = getSec();
  sec.matrix ??= {}; sec.matrix[pd.id] ??= {};
  // actions row
  if (m.actions?.length){
    const row = makeRow();
    if (m.actions.includes("setAll2plus")) row.appendChild(miniBtn("Set all 2+", false, ()=> setMatrixAll(pd.id, 2, m)));
    if (m.actions.includes("setAll1plus")) row.appendChild(miniBtn("Set all 1+", false, ()=> setMatrixAll(pd.id, 1, m)));
    if (m.actions.includes("clearAll"))    row.appendChild(miniBtn("Clear all",  false, ()=> clearMatrix(pd.id, m)));
    p.appendChild(row);
  }
  // simple inline grid using buttons (works without extra CSS)
  const grid = document.createElement("div"); grid.style.display="grid";
  grid.style.gridTemplateColumns = `160px repeat(${(m.cols||[]).length||2}, 1fr)`;
  grid.style.gap = "4px";
  const hdr = (t)=>{ const h=document.createElement("div"); h.style.fontWeight="600"; h.style.color="var(--muted)"; h.textContent=t; return h; };
  grid.appendChild(hdr(" ")); (m.cols||["Right","Left"]).forEach(c=> grid.appendChild(hdr(c)));
  (m.rows||[]).forEach((rName, rIdx)=>{
    grid.appendChild(hdr(rName));
    (m.cols||["Right","Left"]).forEach((_, cIdx)=>{
      const cell = document.createElement("div"); cell.style.display="flex"; cell.style.gap="4px"; cell.style.flexWrap="wrap";
      const current = sec.matrix[pd.id]?.[rIdx]?.[cIdx] ?? null;
      const labels = GRADE_LABELS[m.grades] || ["0","1+","2+","3+"];
      labels.forEach((lab, gIdx)=>{
        const b = miniBtn(lab, current===gIdx, ()=> setMatrixGrade(pd.id, rIdx, cIdx, current===gIdx ? null : gIdx));
        cell.appendChild(b);
      });
      grid.appendChild(cell);
    });
  });
  p.appendChild(grid);
  return p;
}

function setMatrixGrade(panelId, rowIdx, colIdx, gradeOrNull){
  const sec = getSec(); sec.matrix ??= {}; sec.matrix[panelId] ??= {};
  sec.matrix[panelId][rowIdx] ??= {};
  sec.matrix[panelId][rowIdx][colIdx] = gradeOrNull;
  saveStateSoon();
  renderOutput();
  renderCompleteSoon();
}
function setMatrixAll(panelId, gradeIndex, meta){
  const sec = getSec(); sec.matrix ??= {}; sec.matrix[panelId] ??= {};
  const rows = (meta.rows||[]).length, cols=(meta.cols||[]).length;
  for(let r=0;r<rows;r++){
    sec.matrix[panelId][r] ??= {};
    for(let c=0;c<cols;c++) sec.matrix[panelId][r][c] = gradeIndex;
  }
  saveStateSoon();
  renderGrid(); renderOutput();
  renderCompleteSoon();
}
function clearMatrix(panelId, meta){
  const sec = getSec(); sec.matrix ??= {}; sec.matrix[panelId] ??= {};
  const rows = (meta.rows||[]).length, cols=(meta.cols||[]).length;
  for(let r=0;r<rows;r++){
    sec.matrix[panelId][r] ??= {};
    for(let c=0;c<cols;c++) sec.matrix[panelId][r][c] = null;
  }
  saveStateSoon();
  renderGrid(); renderOutput();
  renderCompleteSoon();
}

function wireHeader(){
  document.getElementById("copyBtn").onclick = ()=>{
    navigator.clipboard.writeText(document.getElementById("out").value);
  };
  document.getElementById("clearSectionBtn").onclick = ()=>{
    state.sections[`${state.mode}:${state.activeSection}`] = {checkboxes:{}, chips:{}, fields:{}};
    saveStateSoon();
    renderGrid(); renderOutput();
  };
  document.getElementById("clearAllBtn").onclick = ()=>{
    Object.keys(state.sections).forEach(k=> state.sections[k]={checkboxes:{},chips:{},fields:{}});
    saveStateSoon();
    renderGrid(); renderOutput();
  };
  // Add a Clear patients button
  const toolsBar = document.querySelector(".tools");
  if (toolsBar && !toolsBar.querySelector('[data-role="clear-patients"]')) {
    const btn = document.createElement("button");
    btn.dataset.role = "clear-patients";
    btn.textContent = "Clear patients";
    btn.title = "Delete all saved patients and start fresh";
    btn.onclick = () => {
      if (confirm("Delete all saved patients? This cannot be undone.")) {
        clearAllPatients();
        // Rebuild toolbar controls after reset
        renderPatientControls();
        renderGrid();
        renderOutput();
      }
    };
    toolsBar.appendChild(btn);
  }
  renderPatientControls();
}

function capFirst(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function lcFirst(s){ return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
function joinWithOxford(list, conj="or"){
  if (!list || list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} ${conj} ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, ${conj} ${list[list.length - 1]}`;
}

// Make PE checkbox labels read naturally.
// Example: "nl appearance" -> "Normal appearance"
function formatPECheckLabel(raw){
  if (!raw) return "";
  let s = raw.trim().replace(/^\+\s*/,""); // drop leading "+ " if present
  // expand 'nl' to 'Normal' when it starts the phrase or stands alone
  s = s.replace(/(^|\s)nl(\s|$)/i, (m, p1, p2) => `${p1}Normal${p2}`);
  // Capitalize first letter
  return capFirst(s);
}

// Update your existing negative output to use capitalized "No"/"Denies"
//
// If you already have formatChipNegForOutput, replace its return line with:
//   return isROS ? `Denies ${label}` : `No ${label}`;
//
// Otherwise, add this full function:
function formatChipNegForOutput(secKey, id){
  const def = findDef(secKey, id);

  // If template provides explicit normal text, use it
  if (def.negText) return def.negText;

  // Otherwise, generate from label with mode-specific lead-in
  let label = (def.label || id).replace(/^\+\s*/, "").trim();
  if (label) label = label.charAt(0).toLowerCase() + label.slice(1);

  const isROS = secKey.startsWith("ROS:");
  return isROS ? `Denies ${label}` : `No ${label}`;
}
