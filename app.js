
const DEFAULT_MODE = "PE";
const DEFAULT_COLUMNS = 3;
const REMEMBER_STATE = false;
const CRITICAL_IDS = new Set(["pulm_stridor","ros_resp_stridor"]);

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
  try {
    // Try external file first (works when served over http://)
    const r = await fetch("templates.json", { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    Templates = await r.json();
  } catch (e) {
    // Fallback: read inline <script type="application/json" id="templates-fallback">
    const node = document.getElementById("templates-fallback");
    if (node && node.textContent.trim()) {
      try {
        Templates = JSON.parse(node.textContent);
        console.warn("[NoteWriter] Using inline templates fallback (file:// mode).");
      } catch (e2) {
        return showFatal("Inline templates fallback is invalid JSON.");
      }
    } else {
      return showFatal("Could not load templates.json. Use VS Code Live Preview or add the inline fallback.");
    }
  }

  if (!Templates?.modes || !Templates?.sectionsByMode || !Templates?.sectionDefs) {
    return showFatal("templates schema missing required keys.");
  }

  state.mode = DEFAULT_MODE;
  const first = Templates.sectionsByMode[state.mode]?.[0];
  if (!first) return showFatal(`No sections for mode "${state.mode}".`);
  state.activeSection = first;
  ensureSectionState();
  renderAll();
  wireHeader();
}

function showFatal(msg){
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  grid.appendChild(document.createTextNode("ERROR: " + msg));
  console.error("[NoteWriter]", msg);
}
function renderAll(){ renderTier1(); renderTier2(); renderGrid(); renderOutput(); wireHeader(); }

function renderTier1(){
  const wrap = document.getElementById("tier1"); wrap.innerHTML="";
  Templates.modes.forEach(m=>{
    const btn = document.createElement("button");
    btn.className = "tab" + (m===state.mode ? " active" : "");
    btn.textContent = m;
    btn.onclick = ()=>{ state.mode = m; state.activeSection = Templates.sectionsByMode[m][0]; ensureSectionState(); renderAll(); };
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

function renderGrid(){
  const grid = document.getElementById("grid"); grid.innerHTML="";
  const def = Templates.sectionDefs[`${state.mode}:${state.activeSection}`];
  if(!def){ grid.textContent = "No schema yet."; return; }
  // header checks (tray above panels)
  if (def.headerChecks?.length){
    const tray = document.createElement("div");
    tray.className = "row header-checks";
    def.headerChecks.forEach(t=>{
      tray.appendChild(
        cb(
          t.id,
          t.label,
          !!getSec().checkboxes?.[t.id],
          v=>{ setCB(t.id, v); renderOutput(); }
        )
      );
    });
    grid.appendChild(tray);
  }

  if (def.headerToggles?.length){
    const p = panel("Options");
    p.classList.add("options"); // style Options panel like Epic header tray
    const row = document.createElement("div"); row.className="row";
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
    if (pd.checkboxes?.length){
      const r = document.createElement("div"); r.className="row";
      pd.checkboxes.forEach(c=> r.appendChild(cb(c.id,c.label,!!getSec().checkboxes?.[c.id], v=>{ setCB(c.id,v); renderOutput(); })));
      p.appendChild(r);
    }
    if (pd.chips?.length){
      const r = document.createElement("div"); r.className="row";
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

  if (!def) { ta.value = ""; return; }

  const lines = [];

  if (def.headerChecks?.length) {
    const checks = def.headerChecks
      .filter(h => !!sec.checkboxes?.[h.id])
      .map(h => formatPECheckLabel(h.label)); // "Vital signs reviewed" etc.
    if (checks.length) {
      // join by period and space for these admin-style checks
      lines.push(`${state.activeSection}: ${checks.join(". ")}.`);
    }
  }

  (def.panels || []).forEach(pd => {
    // which ids belong to THIS panel
    const cbIds  = (pd.checkboxes || []).map(c => c.id);
    const chipDs = (pd.chips      || []);

    const cbParts = cbIds
      .filter(id => !!sec.checkboxes?.[id])
      .map(id => formatPECheckLabel(labelFor(secKey, id))); // normalize "nl appearance" -> "Normal appearance"

    const negParts = chipDs
      .filter(d => isNeg(sec.chips?.[d.id]))
      .map(d => formatChipNegForOutput(secKey, d.id));       // "No acute distress" / "Denies wheezing"

    const posParts = chipDs
      .filter(d => isPos(sec.chips?.[d.id]))
      .map(d => formatChipForOutput(secKey, d.id, sec.chips[d.id]));

    const parts = [...cbParts, ...negParts, ...posParts];
    if (parts.length) {
      // For clinical findings, keep semicolons between items inside a panel
      lines.push(`${pd.title}: ${parts.join("; ")}.`);
    }
  });

  ta.value = lines.join("\n");
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
  function chip(def, value, onMouse){
  // value: 0 | 'neg' | {state:'pos', side?, grade?, tags?}
  const d = document.createElement("div");
  const pos = isPos(value), neg = isNeg(value);
  d.className = "chip"
             + (pos ? " selected" : "")
             + (neg ? " neg" : "")
             + (def.critical ? " critical" : "");
  d.oncontextmenu = (e)=>e.preventDefault();
  d.onpointerdown = onMouse;   // use pointer events for reliable L/R detection

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
    const cur = getSec().chips?.[def.id] || 0;
    getSec().chips[def.id] = isNeg(cur) ? 0 : 'neg';
    renderGrid(); renderOutput();
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
    ...((def?.panels||[]).flatMap(p=>[...(p.checkboxes||[]), ...(p.chips||[])]))
  ].find(x=>x.id===id) || {label:id};
}

function formatChipForOutput(secKey, id, v){
  const def = findDef(secKey, id);
  const obj = asObj(v) || {};
  const parts = [def.label.replace(/^\+\s*/,"")];
  if (obj.side) parts.unshift(SIDE_LABELS[obj.side] || obj.side);
  if (typeof obj.grade === "number" && def.mods?.grades){
    const label = (GRADE_LABELS[def.mods.grades]||[])[obj.grade];
    if (label) parts.push(label);
  }
  if (obj.tags){
    Object.entries(obj.tags).forEach(([tag,on])=>{ if(on) parts.push(tag); });
  }
  const text = parts.join(" ");
  return def.critical ? `**${text}**` : text;
}

function labelFor(secKey,id){
  const def = Templates.sectionDefs[secKey];
  const all = [
    ...(def.headerChecks||[]), 
    ...(def.headerToggles||[]),
    ...((def.panels||[]).flatMap(p=>[...(p.checkboxes||[]), ...(p.chips||[])]))
  ];
  return (all.find(x=>x.id===id)?.label) || id;
}

function renderMatrixPanel(pd){
  const p = panel(pd.title);
  const m = pd.matrix || {};
  const sec = getSec();
  sec.matrix ??= {}; sec.matrix[pd.id] ??= {};
  // actions row
  if (m.actions?.length){
    const row = document.createElement("div"); row.className="row";
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
  // remove any leading "+ " from labels
  let label = (def.label || id).replace(/^\+\s*/,"").trim();
  // lower-case the medical phrase; we'll capitalize the "No"/"Denies"
  label = label.charAt(0).toLowerCase() + label.slice(1);
  const isROS = secKey.startsWith("ROS:");
  return isROS ? `Denies ${label}` : `No ${label}`;
}