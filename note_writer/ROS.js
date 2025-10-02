// Apply default-negative ROS chips declared in the template (ROS:General.defaults.negChips)
function applyRosDefaultsIfAny() {
  try {
    if (state.mode !== "ROS") return;
    const def = Templates && Templates.sectionDefs && Templates.sectionDefs["ROS:General"];
    const negList = (def && def.defaults && Array.isArray(def.defaults.negChips)) ? def.defaults.negChips : [];
    if (!negList.length) return;

    const sec = getSecFor("ROS", "General");
    sec.chips = sec.chips || {};

    // Only set defaults for chips that are still unset
    negList.forEach(id => {
      if (sec.chips[id] === undefined) sec.chips[id] = 'neg';
    });

    saveStateSoon();
  } catch (e) {
    console.debug("[ROS defaults] skipped:", e?.message || e);
  }
}


// handleChipMouse() – ROS-only cleanup when adding a positive
if (e.button === 2) {           // right click -> present/abnormal
  e.preventDefault();
  setChipPos(id);
  if (state.mode === "ROS"){
    const sec = getSec();
    Object.keys(sec.checkboxes || {}).forEach(k => { if (/_neg$/.test(k)) sec.checkboxes[k] = false; });
  }
} else if (e.button === 0) {
  const cur = getSec().chips?.[id] || 0;
  getSec().chips[id] = isNeg(cur) ? 0 : 'neg';
}


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

