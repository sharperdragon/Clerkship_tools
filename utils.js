// utils.js (no DOM/state, reusable helpers)

// --- String helpers ---
export const capFirst = s => s ? s[0].toUpperCase() + s.slice(1) : s;
export const lcFirst  = s => s ? s[0].toLowerCase() + s.slice(1) : s;

export function joinWithOxford(list, conj = "or"){
  if (!list || list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} ${conj} ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, ${conj} ${list[list.length - 1]}`;
}

export function escapeHTML(s){
  return String(s).replace(/[&<>\"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[c]);
}

// --- Per-tab asset loader ---
let currentModeModule = null;

/**
 * Load/unload CSS+JS for the active Tier-1 tab.
 * @param {string} mode - Active mode (HPI, ROS, PE, MSE)
 * @param {object} assets - Map of mode → {css, js}
 * @param {object} ctx - Context passed to setup() of per-mode JS
 */
export async function loadModeAssets(mode, assets, ctx){
  // CSS
  const href = assets[mode]?.css || null;
  let link = document.getElementById("mode-css");
  if (href){
    if (!link){
      link = document.createElement("link");
      link.id = "mode-css";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = href;
  } else if (link){
    link.remove();
  }

  // JS
  if (currentModeModule?.teardown){
    try { currentModeModule.teardown(); } catch {}
  }
  currentModeModule = null;

  const js = assets[mode]?.js;
  if (js){
    const mod = await import(`./${js}`);
    if (mod?.setup) mod.setup(ctx);
    currentModeModule = mod;
  }
}
