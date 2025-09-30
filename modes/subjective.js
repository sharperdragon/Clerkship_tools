// modes/subjective.js
import { saveStateSoon } from "../shared.js";

export function isAcute(){ return state?.globals?.subjAcute !== false; }
export function setAcute(on){ state.globals.subjAcute = !!on; saveStateSoon(); }

export function getSubjSplit(){ const f=Number(state?.globals?.subjSplit); return Number.isFinite(f)?Math.min(0.75,Math.max(0.25,f)):0.5; }
export function setSubjSplit(f){ state.globals.subjSplit=Math.min(0.75,Math.max(0.25,Number(f)||0.5)); saveStateSoon(); }
export function _subjGridTemplateFromSplit(split){ const l=Math.round(split*100), r=100-l; return `${l}% 6px ${r}%`; }

const MULTILINE_FIELDS=new Set(["pastMedical","surgicalHx","meds","allergies","social","lmp","familyHx"]);
export function isMultilineField(id,label){ if(MULTILINE_FIELDS.has(id))return true; const name=(label||"").toLowerCase(); return ["past medical","surgical hx","meds","allergies","social","lmp","family hx","family history"].some(k=>name.startsWith(k)); }

export const SubjectiveHooks = {
  onRenderHeader(host, shared){ /* build Acute/Non-acute toggle + stacked fields */ },
  onRenderGrid(shared){ /* 3-column grid with splitter */ },
  buildPanelLines(ctx){ /* handle HPI skip + multiline */ },
  buildFallbackLines(ctx){ /* sweep remaining fields */ },
  onCompleteAssemble(parts){ /* prepend Visit/CC */ },
};