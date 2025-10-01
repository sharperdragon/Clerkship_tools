/* ================================================================
   uspstf_parser.js
   Paste parser (regex + heuristics) → normalized patient model
   Exports: parsePasted(raw: string) -> {
     age?: number,
     sex?: "male" | "female",
     pregnant?: "Y"|"N",
     tobacco?: "Y"|"N",
     sexuallyActive?: "Y"|"N",
     bmiCat?: "N"|"O"|"OB"
   }
   ---------------------------------------------------------------
   // $ Notes:
   // - Conservative extraction: we only set fields we’re reasonably confident about.
   // - BMI category computed from explicit BMI if found, else from height/weight if unit-detectable.
   // - Everything can be corrected in the Quick Form; this is just a head start.
================================================================ */

/* $ Public API */
export function parsePasted(raw) {
  const text = (raw || "").trim();
  const lower = text.toLowerCase();

  const result = {
    age: tryAge(lower),
    sex: trySex(lower),
    pregnant: tryPregnancy(lower),
    tobacco: tryTobacco(lower),
    sexuallyActive: trySexualActivity(lower),
    bmiCat: tryBmiCategory(lower, text) // pass both for numeric/unit parsing
  };

  // Remove undefined keys for cleanliness
  for (const k of Object.keys(result)) {
    if (result[k] === undefined || Number.isNaN(result[k])) delete result[k];
  }
  return result;
}

/* ================================================================
   ! AGE
================================================================ */
function tryAge(s) {
  // Examples: "5 yo", "5y/o", "Age: 5", "5 years old", "54-yo", "54-year-old"
  const patterns = [
    /\bage\s*[:\-]?\s*(\d{1,3})\b/,                         // Age: 54
    /\b(\d{1,3})\s*(?:yo|y\/o|yrs?|years?\s*old|y\b)\b/,    // 54 yo / 54 y/o / 54 yrs / 54 years old
    /\b(\d{1,3})\s*-\s*(?:yo|year\-?old)\b/,                // 54-yo / 54-year-old
    /\b(\d{1,3})\s*(?:year|yr)\s*old\b/                     // 54 year old
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 120) return n;
    }
  }
  return undefined;
}

/* ================================================================
   ! SEX
================================================================ */
function trySex(s) {
  // Prefer explicit “sex: female/male”, else infer from words
  const m1 = /\bsex\s*[:\-]?\s*(female|male)\b/.exec(s);
  if (m1) return m1[1];

  // Infer from common words
  const m2 = /\b(female|male|woman|man|girl|boy)\b/.exec(s);
  if (m2) {
    const w = m2[1];
    if (w.startsWith("f") || w === "woman" || w === "girl") return "female";
    if (w.startsWith("m") || w === "man" || w === "boy") return "male";
  }
  // Shorthand “F/M” (risk false positives; keep conservative)
  const m3 = /\bsex\s*[:\-]?\s*([fm])\b/.exec(s);
  if (m3) return m3[1] === "f" ? "female" : "male";

  return undefined;
}

/* ================================================================
   ! PREGNANCY
================================================================ */
function tryPregnancy(s) {
  // Positive cues
  if (/\bpregnan(t|cy)\b|\bgravida\b|\btrimester\b|\bgestation\b|\bga\s*\d+\w*\b/.test(s)) return "Y";
  // Negative cues
  if (/\bnot\s+pregnan(t|cy)\b|\bpost\s*menopausal\b|\bpost[-\s]*partum\b|\bpostpartum\b/.test(s)) return "N";
  return undefined;
}

/* ================================================================
   ! TOBACCO
================================================================ */
function tryTobacco(s) {
  // Positive cues (current/former use)
  if (/\b(current|daily|some\s*day)\s*smok(er|ing)\b|\buses?\s*tobacco\b|\bchew(ing)?\b|\bvapes?\b/.test(s)) return "Y";
  // Negative cues
  if (/\bdenies\s*tobacco\b|\bnever\s*smoker\b|\bnon[-\s]*smoker\b/.test(s)) return "N";
  return undefined;
}

/* ================================================================
   ! SEXUAL ACTIVITY
================================================================ */
function trySexualActivity(s) {
  if (/\bsexually\s*active\b|\bintercourse\b|\bpartners?\b/.test(s)) return "Y";
  if (/\bnot\s*sexually\s*active\b|\bdenies\s*sexual\s*activity\b/.test(s)) return "N";
  return undefined;
}

/* ================================================================
   ! BMI CATEGORY
   Source order:
     1) Explicit “BMI: 32.1” → categorize
     2) Height/Weight pairs → compute BMI (if we can confidently detect units)
================================================================ */
function tryBmiCategory(sLower, sRaw) {
  // 1) Explicit BMI
  const bmi = explicitBMI(sLower);
  if (bmi != null) return bmiToCat(bmi);

  // 2) Compute via Ht/Wt if units clear
  const ht = extractHeight(sRaw); // in meters if possible
  const wt = extractWeight(sRaw); // in kg if possible
  if (ht && wt) {
    const bmi2 = wt.kg / (ht.m * ht.m);
    if (Number.isFinite(bmi2) && bmi2 > 5 && bmi2 < 100) return bmiToCat(bmi2);
  }
  return undefined;
}

// ? BMI extraction from explicit notation
function explicitBMI(s) {
  // Examples: "BMI 32.1", "BMI: 27", "body mass index: 23.4"
  const m = /\b(bmi|body\s*mass\s*index)\s*[:\-]?\s*(\d{2}(?:\.\d{1,2})?)\b/.exec(s);
  if (m) {
    const n = parseFloat(m[2]);
    if (Number.isFinite(n) && n >= 8 && n <= 90) return n;
  }
  return null;
}

// ? Height parsing
//   - Feet/inches: 5'8" / 5 ft 8 in / 5 feet 8 inches / 5’8” (smart quotes)
//   - Inches only: 70 in / 70"
//   - Centimeters: 170 cm
//   - Meters: 1.70 m
function extractHeight(s) {
  const t = s.replace(/\u2019|\u2018/g, "'").replace(/\u201D|\u201C/g, '"'); // normalize quotes

  // ft'in"
  let m = /\b(\d{1,2})\s*['′]\s*(\d{1,2})\s*(?:["″]|in|inches?)?\b/i.exec(t);
  if (m) {
    const ft = Number(m[1]);
    const inch = Number(m[2]);
    if (isFinite(ft) && isFinite(inch)) return { m: ((ft * 12 + inch) * 2.54) / 100 };
  }
  // feet + inches text
  m = /\b(\d{1,2})\s*(?:feet|ft)\s*(\d{1,2})\s*(?:in|inches?)?\b/i.exec(t);
  if (m) {
    const ft = Number(m[1]);
    const inch = Number(m[2]);
    if (isFinite(ft) && isFinite(inch)) return { m: ((ft * 12 + inch) * 2.54) / 100 };
  }
  // inches only
  m = /\b(\d{2,3})\s*(?:in|inches|["″])\b/i.exec(t);
  if (m) {
    const inches = Number(m[1]);
    if (isFinite(inches)) return { m: (inches * 2.54) / 100 };
  }
  // centimeters
  m = /\b(\d{2,3}(?:\.\d{1,2})?)\s*cm\b/i.exec(t);
  if (m) {
    const cm = parseFloat(m[1]);
    if (isFinite(cm)) return { m: cm / 100 };
  }
  // meters
  m = /\b(\d(?:\.\d{1,2})?)\s*m\b/i.exec(t);
  if (m) {
    const meters = parseFloat(m[1]);
    if (isFinite(meters)) return { m: meters };
  }
  return null;
}

// ? Weight parsing
//   - Pounds: 154 lb / 154 lbs / 154#
/*   - Kilograms: 70 kg
     - Stones (rare in US notes): 11 st 0 lb (we’ll support but uncommon) */
function extractWeight(s) {
  // pounds
  let m = /\b(\d{2,3}(?:\.\d{1,2})?)\s*(?:lb|lbs|#)\b/i.exec(s);
  if (m) {
    const lb = parseFloat(m[1]);
    if (isFinite(lb)) return { kg: lb * 0.45359237 };
  }
  // kilograms
  m = /\b(\d{1,3}(?:\.\d{1,2})?)\s*kg\b/i.exec(s);
  if (m) {
    const kg = parseFloat(m[1]);
    if (isFinite(kg)) return { kg };
  }
  // stones + pounds (e.g., 11 st 0 lb)
  m = /\b(\d{1,2})\s*st(?:one)?s?\s*(\d{1,2})?\s*(?:lb|lbs)?\b/i.exec(s);
  if (m) {
    const st = Number(m[1]);
    const lb = Number(m[2] || 0);
    if (isFinite(st) && isFinite(lb)) return { kg: ((st * 14) + lb) * 0.45359237 };
  }
  return null;
}

// ? BMI → Category
function bmiToCat(b) {
  if (b >= 30) return "OB";
  if (b >= 25) return "O";
  return "N";
}