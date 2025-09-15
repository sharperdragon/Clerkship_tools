
const DEFAULT_MODE = "PE";
const DEFAULT_COLUMNS = 3;

const REMEMBER_STATE = false;

const CLASS_CRITICAL = "critical"; // applied when abnormal/present (right-click)
const CLASS_NORMAL   = "normal";   // applied when good/absent (left-click)

// Map each mode to its own template file
const MODE_FILES = {
  ROS: "templates_ROS.json",
  PE:  "templates_pe.json",
  MSE: "templates_MSE.json"
};
// Explicit order for tabs (so ROS appears first regardless of key enumeration)
const MODE_LIST = ["ROS", "PE", "MSE"];
const MODE_LABELS = { ROS: "ROS", PE: "Physical Exam", MSE: "MSE" };

async function loadTemplatesForMode(mode){
  const file = MODE_FILES[mode];
  if (!file) throw new Error(`No template file for mode ${mode}`);
  const r = await fetch(file, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
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

/***** STATE *****/
let Templates = null;
let state = {
  mode: DEFAULT_MODE,
  activeSection: null,
  columns: DEFAULT_COLUMNS,
  sections: {},
  globals: {}
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
  await switchMode(DEFAULT_MODE);
  wireHeader();
}

function showFatal(msg){
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  grid.appendChild(document.createTextNode("ERROR: " + msg));
  console.error("[NoteWriter]", msg);
}
function renderAll(){ renderTier1(); renderTier2(); renderHeaderChecks(); renderGrid(); renderOutput(); wireHeader(); }

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
}

function renderTier2(){
  const wrap = document.getElementById("tier2"); wrap.innerHTML="";
  (Templates.sectionsByMode[state.mode]||[]).forEach(sec=>{
    const btn = document.createElement("button");
    btn.className = "tab" + (sec===state.activeSection ? " active" : "");
    btn.textContent = sec;
    btn.onclick = ()=>{ state.activeSection = sec; ensureSectionState(); renderGrid(); renderOutput(); };
    wrap.appendChild(btn);
  });
}
// Helper to create a row div with the current mode as a class, plus any extra class
function makeRow(extraClass){
  const d = document.createElement("div");
  d.className = "row " + state.mode + (extraClass ? (" " + extraClass) : "");
  return d;
}

function renderHeaderChecks(){
  const host = document.getElementById("headerChecks");
  host.innerHTML = "";
  const def = Templates.sectionDefs[`${state.mode}:${state.activeSection}`];
  if (!def?.headerChecks?.length) {
    host.style.display = "none";
    return;
  }
  host.style.display = "";
  const wrap = makeRow("header-checks");
  def.headerChecks.forEach(t=>{
    wrap.appendChild(
      cb(
        t.id,
        t.label,
        !!getSec().checkboxes?.[t.id],
        v=>{ setCB(t.id, v); renderOutput(); }
      )
    );
  });
  host.appendChild(wrap);
}

function renderGrid(){
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  // Update grid class to include current mode
  grid.className = "section-grid " + state.mode;
  const def = Templates.sectionDefs[`${state.mode}:${state.activeSection}`];
  if(!def){ grid.textContent = "No schema yet."; return; }

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
      pd.subsections.forEach(ss=>{
        // sub-title
        const sh = document.createElement("div");
        sh.className = "subhead";
        sh.textContent = ss.title;
        p.appendChild(sh);
        // subsection checkboxes
        if (ss.checkboxes && ss.checkboxes.length){
          const rr = makeRow();
          ss.checkboxes.forEach(c=>{
            rr.appendChild(cb(c.id, c.label, !!getSec().checkboxes?.[c.id], v=>{ setCB(c.id, v); renderOutput(); }));
          });
          p.appendChild(rr);
        }
        // subsection chips
        if (ss.chips && ss.chips.length){
          const rr = makeRow();
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


// Helper to create a row div with the current mode as a class, plus any extra class
function makeRow(extraClass){
  const d = document.createElement("div");
  d.className = "row " + state.mode + (extraClass ? (" " + extraClass) : "");
  return d;
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
  if (def.headerChecks?.length) {
    const checks = def.headerChecks
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

      // Second sentence: negatives + panel checkboxes
      if (negParts.length || cbParts.length) {
        // Lowercase subsequent "No"/"Denies" at the start of each subsequent negative phrase
        const negAdj = negParts.map((t,i)=> i===0 ? t
          : t.replace(/^No\b/, 'no').replace(/^Denies\b/, 'denies'));

        const secondListPlain = [...negAdj, ...cbParts];
        const secondSentPlain = `${secondListPlain.join("; ")}.`;
        linePlain += secondSentPlain;
      }

      lines.push(linePlain);
    }
  });

  if (ta) ta.value = lines.join("\n");
}

function formatChipNegForOutput(secKey, id){
  const def = findDef(secKey, id);
  const label = (def.label || id).replace(/^\+\s*/,""); // strip any leading "+ "
  const isROS = secKey.startsWith("ROS:");
  // ROS uses "denies ___"; PE/MSE use "no ___"
  return isROS ? `denies ${label}` : `no ${label}`;
}
// helpers you also need:
function panel(title){ const s=document.createElement("section"); s.className="panel";
  const h=document.createElement("div"); h.className="panel-header"; h.textContent=title; s.appendChild(h); return s; }
function cb(id,label,checked,on){ const w=document.createElement("label"); w.className="cb";
  const i=document.createElement("input"); i.type="checkbox"; i.checked=checked; i.onchange=e=>on(e.target.checked);
  w.appendChild(i); w.appendChild(document.createTextNode(label)); return w; }
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

function setChipPos(id){ const s=getSec(); const cur=s.chips[id];
  s.chips[id] = isPos(cur) ? cur : { state:'pos' }; }

function setChipNeg(id){ getSec().chips[id] = 'neg'; }
function clearChip(id){  getSec().chips[id] = 0; }

function setChipGrade(id, grade){ setChipPos(id); getSec().chips[id].grade = grade; renderOutput(); renderGrid(); }
function setChipSide(id, side){  setChipPos(id); getSec().chips[id].side  = side;  renderOutput(); renderGrid(); }
function setChipTag(id, tag, on){ setChipPos(id); (getSec().chips[id].tags ??= {})[tag] = !!on; renderOutput(); }

function setChipState(id, next){  // next: 0 | 'neg' | 'pos'
  const s = getSec();
  s.chips[id] = next;
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
  renderGrid();
  renderOutput();
}

function ensureSectionState(){
  (Templates.sectionsByMode[state.mode]||[]).forEach(sec=>{
    const k=`${state.mode}:${sec}`; state.sections[k] ??= {checkboxes:{}, chips:{}};
  });
}
function getSec(){ const k=`${state.mode}:${state.activeSection}`; state.sections[k] ??= {checkboxes:{}, chips:{}}; return state.sections[k]; }
function setCB(id,val){ getSec().checkboxes[id]=val; }
function toggleChip(id){ const s=getSec(); s.chips[id]=!s.chips[id]; }

function findDef(secKey, id){
  const def = Templates.sectionDefs[secKey];
  return [
    ...(def?.headerChecks||[]), 
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
  renderOutput();
}
function setMatrixAll(panelId, gradeIndex, meta){
  const sec = getSec(); sec.matrix ??= {}; sec.matrix[panelId] ??= {};
  const rows = (meta.rows||[]).length, cols=(meta.cols||[]).length;
  for(let r=0;r<rows;r++){
    sec.matrix[panelId][r] ??= {};
    for(let c=0;c<cols;c++) sec.matrix[panelId][r][c] = gradeIndex;
  }
  renderGrid(); renderOutput();
}
function clearMatrix(panelId, meta){
  const sec = getSec(); sec.matrix ??= {}; sec.matrix[panelId] ??= {};
  const rows = (meta.rows||[]).length, cols=(meta.cols||[]).length;
  for(let r=0;r<rows;r++){
    sec.matrix[panelId][r] ??= {};
    for(let c=0;c<cols;c++) sec.matrix[panelId][r][c] = null;
  }
  renderGrid(); renderOutput();
}

function wireHeader(){
  document.getElementById("copyBtn").onclick = ()=>{
    navigator.clipboard.writeText(document.getElementById("out").value);
  };
  document.getElementById("clearSectionBtn").onclick = ()=>{
    state.sections[`${state.mode}:${state.activeSection}`] = {checkboxes:{}, chips:{}};
    renderGrid(); renderOutput();
  };
  document.getElementById("clearAllBtn").onclick = ()=>{
    Object.keys(state.sections).forEach(k=> state.sections[k]={checkboxes:{},chips:{}});
    renderGrid(); renderOutput();
  };
}

function capFirst(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

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