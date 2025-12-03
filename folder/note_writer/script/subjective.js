// subjective acuity toggle (defaults to Acute=true when undefined)
// ! Subjective acuity flag helpers – stored in patient globals
function isAcute(){
  const ps = getPatientSpace();
  return ps.globals?.subjAcute !== false;
}
function setAcute(on){
  const ps = getPatientSpace();
  ps.globals ||= {};
  ps.globals.subjAcute = !!on;
  saveStateSoon();
}

function getSubjSplit(){
  const f = Number(STATE?.data?.[STATE.patientId]?.globals?.subjSplit);
  if (Number.isFinite(f)) return Math.min(0.75, Math.max(0.25, f));
  return 0.50;
}
function setSubjSplit(f){
  const ps = getPatientSpace();
  ps.globals ||= {};
  ps.globals.subjSplit = Math.min(0.75, Math.max(0.25, Number(f) || 0.50));
  saveStateSoon();
}

function applySubjSplitIfPresent(){
  const grid = document.querySelector('[data-subjective-grid]');
  if (!grid) return;
  const leftPct  = Math.round(getSubjSplit() * 100);
  const rightPct = 100 - leftPct;
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = `${leftPct}% 6px ${rightPct}%`;
}

function wireSubjectiveSplitter(){
  const grid = document.querySelector('[data-subjective-grid]');
  const splitter = grid?.querySelector('[data-subj-splitter]');
  if (!grid || !splitter || splitter._wired) return;

  let dragging = false, gridRect = null;
  const onDown = (e)=>{ dragging = true; gridRect = grid.getBoundingClientRect(); document.body.style.cursor = 'col-resize'; e.preventDefault(); };
  const onMove = (e)=>{
    if (!dragging || !gridRect) return;
    const rel = (e.clientX - gridRect.left) / gridRect.width; // 0..1
    setSubjSplit(rel);
    applySubjSplitIfPresent();
  };
  const onUp = ()=>{ if (!dragging) return; dragging = false; gridRect = null; document.body.style.cursor = ''; };

  splitter.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  splitter._wired = true;

  applySubjSplitIfPresent(); // set initial width
}

// * Wire the Acute / Non-acute toggle in the header
function wireAcuityToggle(){
  const root = document.querySelector('.acute-toggle');
  if (!root || root._wired) return;
  root._wired = true;

  const buttons = root.querySelectorAll('[data-acute]');
  const apply = () => {
    const acuteOn = isAcute();
    buttons.forEach(btn => {
      const val = btn.dataset.acute === 'true';
      btn.classList.toggle('active', val === acuteOn);
    });
  };

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-acute]');
    if (!btn) return;
    setAcute(btn.dataset.acute === 'true');
    apply();
    // ? Optional: ensure the writer re-renders if debug helper exists
    if (window.NoteWriter?.forceRender) window.NoteWriter.forceRender();
  });

  apply();
}

// ! Boot: wire Subjective-specific behavior when this tab is loaded
try {
  if (typeof wireSubjectiveSplitter === 'function') {
    wireSubjectiveSplitter();
  }
  if (typeof applySubjSplitIfPresent === 'function') {
    applySubjSplitIfPresent();
  }
  if (typeof wireAcuityToggle === 'function') {
    wireAcuityToggle();
  }
} catch (e) {
  console.warn('[subjective] wiring failed:', e);
}