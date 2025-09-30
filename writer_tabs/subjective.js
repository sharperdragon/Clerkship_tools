// subjective acuity toggle (defaults to Acute=true when undefined)
function isAcute(){ return state?.globals?.subjAcute !== false; }
function setAcute(on){ state.globals.subjAcute = !!on; saveStateSoon(); }

// --- subjective split (HPI | splitter | General) ---
function getSubjSplit(){
  const f = Number(state?.globals?.subjSplit);
  if (Number.isFinite(f)) return Math.min(0.75, Math.max(0.25, f)); // clamp 25–75%
  return 0.50; // default
}
function setSubjSplit(f){
  const v = Math.min(0.75, Math.max(0.25, Number(f) || 0.50));
  state.globals.subjSplit = v;
  saveStateSoon();
}
function _subjGridTemplateFromSplit(split){
  const leftPct  = Math.round(split * 100);
  const rightPct = 100 - leftPct;
  // 6px splitter in the middle
  return `${leftPct}% 6px ${rightPct}%`;
}

// Fields treated as multiline within Subjective output
const MULTILINE_FIELDS = new Set([
  "pastMedical", "surgicalHx", "meds", "allergies",
  "social", "lmp", "familyHx"
]);
function isMultilineField(id, label){
  if (MULTILINE_FIELDS.has(id)) return true;
  const name = String(label || "").toLowerCase();
  return [
    "past medical","surgical hx","meds","allergies",
    "social","lmp","family hx","family history"
  ].some(k => name.startsWith(k));
}

// renderHeaderChecks() – Subjective-only toggle UI
if (state.mode === "SUBJECTIVE") {
  const acuteWrap = document.createElement("div");
  acuteWrap.className = "acute-toggle";
  acuteWrap.style.display = "inline-flex";
  acuteWrap.style.gap = "6px";
  acuteWrap.style.marginRight = "8px";

  const mk = (label, on) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.className = "btn-mini" + ((on && isAcute()) || (!on && !isAcute()) ? " active" : "");
    b.onclick = () => { setAcute(on); renderGrid(); renderOutput(); renderCompleteSoon(); renderHeaderChecks(); };
    return b;
  };

  acuteWrap.appendChild(mk("Acute", true));
  acuteWrap.appendChild(mk("Non-acute", false));
  host.appendChild(acuteWrap);
}


// renderHeaderChecks() – Subjective header fields stacked under labels
if (hasHeaderFields){
  const wrapFields = makeRow("header-fields");
  const headerSec = getSecFor('SUBJECTIVE', 'General');
  (headerPanel.fields || []).forEach(f => {
    const val = headerSec.fields?.[f.id];
    const onChange = (v) => {
      headerSec.fields[f.id] = v;
      saveStateSoon();
      renderOutput();
      renderCompleteSoon();
    };
    wrapFields.appendChild(
      fieldText(
        f.id,
        f.label || f.id,
        val,
        onChange,
        f.placeholder || f.label || f.id,
        /*stacked*/ true            // << Subjective stacking
      )
    );
  });
  host.appendChild(wrapFields);
}

// renderOutput() – Subjective panel emission
if (state.mode === "SUBJECTIVE" && pd.fields?.length){
  // Skip HPI emission when Non-acute
  if (!isAcute() && pd.title === "History of Present Illness") {
    return; // continue to next panel
  }
  const panelLines = [];
  const fieldsFlat = (pd.fields || []).flatMap(f => {
    const top = (f && f.type === "group") ? (f.fields || []) : [f];
    const out = [];
    top.forEach(it => {
      if (!it) return;
      out.push(it);
      if (Array.isArray(it.children)) out.push(...it.children);
    });
    return out;
  });

  fieldsFlat.forEach(f => {
    if (!shouldShowField(f)) return;
    if (f.type === "boolean") return;
    const raw = getSec().fields?.[f.id];
    const v0 = (typeof raw === "string" ? raw : "");
    const v = v0.trim();
    if (!v) return;

    if (isMultilineField(f.id, f.label) && /[\r\n]/.test(v)) {
      const parts = v.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (parts.length) {
        panelLines.push(`${f.label}: ${parts[0]}.`);
        for (let i = 1; i < parts.length; i++){
          panelLines.push(parts[i] + ".");
        }
      }
    } else {
      panelLines.push(`${f.label}: ${v}.`);
    }
  });
  if (panelLines.length){
    if (pd.title === "History of Present Illness") {
      lines.push("HPI:");
    }
    lines.push(...panelLines);
  }
  // Include any checked panel checkboxes (PMH, Allergies, etc.)
  const cbParts = (pd.checkboxes || []).filter(c => !!sec.checkboxes?.[c.id])
                    .map(c => formatPECheckLabel(c.label || c.id));
  if (cbParts.length) {
    lines.push(`${pd.title}: ${cbParts.join('. ')}.`);
  }
  // Field-level checkboxes (e.g., PMH, Allergies)
  pd.fields.forEach(f => {
    if (!Array.isArray(f.checkboxes) || !f.checkboxes.length) return;
    const picked = f.checkboxes
      .filter(c => !!sec.checkboxes?.[c.id])
      .map(c => formatPECheckLabel(c.label || c.id));
    if (picked.length) lines.push(`${f.label}: ${picked.join('. ')}.`);
  });
  return;
}

// renderOutput() – Subjective fallback sweep
if (state.mode === "SUBJECTIVE" && lines.length === 0) {
  const def2 = Templates.sectionDefs[`${state.mode}:${state.activeSection}`];
  (def2?.panels || []).forEach(pd => {
    (pd.fields || []).forEach(f => {
      if (!shouldShowField(f)) return;
      if (f.type === "boolean") return;
      const raw = getSec().fields?.[f.id];
      const v = (typeof raw === "string" ? raw : "").trim();
      if (v) lines.push(`${f.label}: ${v}.`);
    });
  });
}

// buildSectionLines() – Subjective branch
if (mode === "SUBJECTIVE" && pd.fields?.length){
  if (!isAcute() && pd.title === "History of Present Illness") return;
  // ... (same multiline + checkbox handling) ...
  return; // next panel
}

// buildSectionLines() – Subjective fallback
if (mode === "SUBJECTIVE" && lines.length === 0) {
  (def.panels || []).forEach(pd => {
    (pd.fields || []).forEach(f => {
      if (!shouldShowFieldFor(f, mode, secKey)) return;
      if (f.type === "boolean") return;
      const raw = (sec.fields && sec.fields[f.id]);
      const v = (typeof raw === "string" ? raw.trim() : "");
      if (v) lines.push(`${f.label}: ${v}.`);
    });
  });
}

// renderCompleteNote() – prepend Subjective:General headerItems once
try {
  const subjTpl = await loadTemplatesForMode("SUBJECTIVE");
  const genDef = subjTpl.sectionDefs["SUBJECTIVE:General"];
  if (genDef && Array.isArray(genDef.headerItems) && genDef.headerItems.length) {
    const sec = state.sections["SUBJECTIVE:General"] || { fields:{}, checkboxes:{} };
    const headerLines = [];
    genDef.headerItems.forEach(h => {
      if (!h || !h.id) return;
      if (h.type === 'text') {
        const raw = sec.fields && sec.fields[h.id];
        const v = (typeof raw === 'string' ? raw.trim() : '');
        if (v) headerLines.push(`${h.label || h.id}: ${v}.`);
      } else {
        if (sec.checkboxes?.[h.id]) headerLines.push(formatPECheckLabel(h.label || h.id));
      }
    });
    if (headerLines.length) {
      parts.push(headerLines.join("\n"));
      parts.push("<br>");
      state.globals._emittedSubjHeaderOnce = true;
    }
  }
} catch(e) { /* … */ }


// cb() – add class when in Subjective
w.className = "cb" + (state && state.mode === "SUBJECTIVE" ? " subjective" : "");

// fieldText() – stack label/input only for Subjective when stacked=true
if (stacked && state.mode === "SUBJECTIVE") {
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.alignItems = 'stretch';
  wrap.style.gap = '4px';
  span.style.display = 'block';
  span.style.marginBottom = '0';
  input.style.display = 'block';
  input.style.width = '100%';
}


// fieldRange() – Subjective stacked layout
if (stacked && state.mode === "SUBJECTIVE") {
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.alignItems = 'stretch';
  wrap.style.gap = '4px';
  span.style.display = 'block';
  span.style.marginBottom = '0';
  right.style.width = '100%';
}

