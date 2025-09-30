// --- Vital signs parser/scrubber ---
function scrubVitalSigns(raw) {
  if (!raw) return null;
  const s = String(raw);

  // BP with optional "(!)"
  let bpBang = "";
  let bpSys = "", bpDia = "";
  { const m = s.match(/BP\s*(\(!\))?\s*([0-9]{2,3})\s*\/\s*([0-9]{2,3})/i);
    if (m) { bpBang = m[1] ? "(!) " : ""; bpSys = m[2]; bpDia = m[3]; } }

  // Pulse
  let pulse = "";
  { const m = s.match(/Pulse\s*([0-9]{1,3})/i); if (m) pulse = m[1]; }

  // Temp + site
  let temp = "", site = "";
  { const m = s.match(/Temp\s*([\d.]+)\s*°?\s*F(?:\s*\(([^)]+)\))?/i);
    if (m) { temp = m[1]; site = m[2] || ""; } }

  // Resp
  let resp = "";
  { const m = s.match(/Resp\s*([0-9]{1,3})/i); if (m) resp = m[1]; }

  // SpO2
  let spo2 = "";
  { let m = s.match(/(?:SpO2|O2\s*Sat|Oxygen\s*Sat)\s*([0-9]{1,3})\s*%/i);
    if (!m) m = s.match(/\bO2\b\s*([0-9]{1,3})\s*%/i);
    if (m) spo2 = m[1]; }

  // BMI
  let bmi = "";
  { let m = s.match(/BMI\s*([\d.]+)\s*kg\/m(?:2|²)/i);
    if (!m) m = s.match(/BMI\s*([\d.]+)/i);
    if (m) bmi = m[1]; }

  const parts = [];
  if (temp) parts.push(`Temp ${temp} °F${site ? ` (${site})` : ""}`);
  if (bpSys && bpDia) parts.push(`BP ${bpBang}${bpSys}/${bpDia}`);
  if (pulse) parts.push(`HR ${pulse}`);
  if (resp) parts.push(`RR ${resp}`);
  if (spo2) parts.push(`SpO2 ${spo2}%`);

  let line1 = parts.join(", ");
  line1 = line1.replace(", HR", ",  HR");

  if (/\bOxygen sat \(O2\)\b/i.test(line1)) {
    if (spo2) {
      line1 = line1.replace(/\bOxygen sat \(O2\)\b/gi, `SpO2 ${spo2}%`);
    } else {
      line1 = line1.replace(/\s*,?\s*\bOxygen sat \(O2\)\b/gi, "").replace(/,\s*,/g, ", ").replace(/,\s*$/, "");
    }
  }

  const line2 = bmi ? `BMI: ${bmi}` : "";
  if (!line1 && !line2) return null;
  return { line1, line2 };
}



// Make PE checkbox labels read naturally (e.g., "nl appearance" -> "Normal appearance")
function formatPECheckLabel(raw){
  if (!raw) return "";
  let s = raw.trim().replace(/^\+\s*/,"");
  s = s.replace(/(^|\s)nl(\s|$)/i, (m, p1, p2) => `${p1}Normal${p2}`);
  return capFirst(s);
}


function renderMatrixPanel(pd){
  const p = panel(pd.title);
  const m = pd.matrix || {};
  const sec = getSec();
  sec.matrix ??= {}; sec.matrix[pd.id] ??= {};

  if (m.actions?.length){
    const row = makeRow();
    if (m.actions.includes("setAll2plus")) row.appendChild(miniBtn("Set all 2+", false, ()=> setMatrixAll(pd.id, 2, m)));
    if (m.actions.includes("setAll1plus")) row.appendChild(miniBtn("Set all 1+", false, ()=> setMatrixAll(pd.id, 1, m)));
    if (m.actions.includes("clearAll"))    row.appendChild(miniBtn("Clear all",  false, ()=> clearMatrix(pd.id, m)));
    p.appendChild(row);
  }

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

// renderOutput() – header items loop
if (h.id === 'vital_signs_text' && v) {
  const fmt = scrubVitalSigns(v);
  if (fmt) {
    if (fmt.line1) { lines.push(fmt.line1); _emittedVitals = true; }
    if (fmt.line2) { lines.push(fmt.line2); }
  }
  return; // do not add a default "Label: value." line
}

// buildSectionLines() – same vitals handling in the cross-mode builder
if (h.id === 'vital_signs_text' && v) {
  const fmt = scrubVitalSigns(v);
  if (fmt) {
    if (fmt.line1) { lines.push(fmt.line1); _emittedVitals = true; }
    if (fmt.line2) { lines.push(fmt.line2); }
  }
  return; // skip default label:value
}

// renderCompleteNote() – when emitting PE block
if (m === "PE") {
  // Insert Objective heading before the Physical Exam section
  parts.push(`Objective:\n`);
}