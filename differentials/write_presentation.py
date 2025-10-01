import os
import json
import re
from typing import Dict, Any, Iterable, Tuple, Optional, List
from pathlib import Path

# ! -----------------------------
# ! Config: paths & behavior (explicit paths; no dry run)
# ! -----------------------------
BASE_DIR = "/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations"
PRESENTATION_LIST_PATH = "/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/Presentation_list.json"
CLINICAL_INDEX_PATH = "/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/clinical_presentation_index.json"
NONCLINICAL_INDEX_PATH = "/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/non-clinical_presentation_index.json"
SCHEMA_PATH = "/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/presentations_schema.json"

INCLUDE_FREQ = True                  # Include frequency in each etiology item
LOW_PRIORITY_MODE = "subfolder"        # Route low-priority to clinical/other/
REBUILD_EXISTING = True              # Rebuild items array from sources on existing files
SUMMARY_PATH = "/Users/claytongoddard/Desktop/presentation_build_summary.md"
DRY_RUN = False                      # <= per user request

# ! -----------------------------
# ! Section → folder mapping
# ! -----------------------------
SECTION_FOLDERS: Dict[str, str] = {
    "Clinical Presentations": "clinical",
    "Biochemical Presentations": "biochemical",
    "Hematological Presentations": "hematological",
}

# ! -----------------------------
# ! Already written & low-priority slugs (derived from user-provided paths)
# ! -----------------------------
_WRITTEN_PATHS = [
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/abdominal.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/anorectal-pain.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/arm-pain.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/arm-swellings.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/ascites.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/axillary-swellings.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/backache.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/breast-lumps.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/breast-pain.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/chest-pain.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/clubbing.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/coma.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/confusion.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/constipation.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/convulsions.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/cough.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/cyanosis.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/deafness.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/diarrhea.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/dizziness.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/dysphagia.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/dyspnea.json',
]

_LOW_PRIORITY_PATHS = [
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/erectile-dysfunction.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/facial-swellings.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/facial-ulcers.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/finger-lesions.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/finger-pain.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/foot-and-ankle-deformities.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/groin-swellings.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/hand-deformities.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/hemiparesis.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/hiccups.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/jaw-pain-and-swellings.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/leg-ulcers.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/mouth-ulcers.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/nasal-discharge.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/penile-lesions.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/popliteal-swellings.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/pruritus-ani.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/scalp-lesions.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/scrotal-pain.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/scrotal-swellings.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/stridor.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/sweating-abnormalities.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/thirst.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/tiredness.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/toe-lesions.json',
    '/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations/clinical/other/tongue-disorders.json',
]
WRITTEN_SLUGS = {os.path.splitext(os.path.basename(p))[0] for p in _WRITTEN_PATHS}
LOW_PRIORITY_SLUGS = {os.path.splitext(os.path.basename(p))[0] for p in _LOW_PRIORITY_PATHS}

# ! -----------------------------
# ! Utilities
# ! -----------------------------
_def_slug_cleanup = re.compile(r"[^a-z0-9\s-]")
_bullet_pat = re.compile(r"^[\u2022\u2023\u25E6\u2043\u2219\-•\s]+")
_fig_pat = re.compile(r"\((?:fig|figure|see)[:\s][^\)]*\)", re.IGNORECASE)
_eg_tail_pat = re.compile(r"\be\.g\.[^;,.]*", re.IGNORECASE)
_trailing_punct = re.compile(r"[\s,:;\-]+$")

SYSTEM_FIX = {
    "‘medical’ causes": "Medical",
    "medical causes": "Medical",
    "urinary tract": "Urinary tract",
    "abdominal wall": "Abdominal wall",
    "gastrointestinal": "Gastrointestinal",
    "referred pain": "Referred",
}

ALIAS_MAP = {
    ("Clinical Presentations", "Abdominal"): ["Abdominal pain", "Abdominal swellings"],
}

SECTION_INDEX_TYPE = {
    "Clinical Presentations": "clinical",
    "Biochemical Presentations": "non-clinical",
    "Hematological Presentations": "non-clinical",
}


def slugify(name: str) -> str:
    s = name.lower()
    s = _def_slug_cleanup.sub("", s)
    s = s.strip().replace(" ", "-")
    s = re.sub(r"-+", "-", s)
    return s


def normalize_label(s: str) -> str:
    s = s.strip()
    s = _bullet_pat.sub("", s)
    s = _fig_pat.sub("", s)
    s = _eg_tail_pat.sub("", s)
    s = _trailing_punct.sub("", s)
    return s.strip()


def title_case_system(cat: str) -> str:
    if not cat:
        return ""
    c = normalize_label(cat)
    low = c.lower()
    if low in SYSTEM_FIX:
        return SYSTEM_FIX[low]
    return c[:1].upper() + c[1:]


def load_json(path: str) -> Any:
    with open(path, "r") as f:
        return json.load(f)


def get_required_symptom_keys(schema_obj: Dict[str, Any]) -> List[str]:
    # Prefer explicit list if present
    if isinstance(schema_obj.get("symptoms"), dict):
        sym = schema_obj["symptoms"]
        # Try required list
        if isinstance(sym.get("required"), list) and sym.get("required"):
            return list(sym["required"])  # keep order
        # Else use properties keys
        if isinstance(sym.get("properties"), dict):
            return list(sym["properties"].keys())
    # Fallback to canonical list
    return [
        "onset","progression","palliate","provoke","quality","timing",
        "region","radiation","severity","clinical tests","other symptoms"
    ]


def blank_symptoms(required_keys: Iterable[str]) -> Dict[str, list]:
    return {k: [] for k in required_keys}


def iter_etiologies(index_block: Any, parent_category: str = "") -> Iterable[Tuple[str, str, Optional[str]]]:
    """Yield (category, etiology, freq) recursively from index blocks."""
    if isinstance(index_block, dict):
        for k, v in index_block.items():
            cat = normalize_label(k) if k else parent_category
            if isinstance(v, dict):
                # Leaf case: {"Etiology": {"freq": "common"}}
                if all(isinstance(x, dict) and ("freq" in x or not x) for x in v.values()):
                    for et, meta in v.items():
                        name = normalize_label(et)
                        freq = (meta or {}).get("freq") if isinstance(meta, dict) else None
                        yield (cat, name, freq)
                else:
                    # Nested categories
                    yield from iter_etiologies(v, parent_category=cat or parent_category)
            elif isinstance(v, list):
                for item in v:
                    if isinstance(item, str):
                        yield (cat, normalize_label(item), None)
                    elif isinstance(item, dict):
                        nm = item.get("name") if isinstance(item.get("name"), str) else None
                        if nm:
                            yield (cat, normalize_label(nm), item.get("freq"))
                        else:
                            yield from iter_etiologies(item, parent_category=cat)
            elif isinstance(v, str):
                yield (cat, normalize_label(v), None)
    elif isinstance(index_block, list):
        for item in index_block:
            yield from iter_etiologies(item, parent_category=parent_category)
    elif isinstance(index_block, str):
        yield (parent_category, normalize_label(index_block), None)


def build_index_lookup(d: Dict[str, Any]) -> Dict[str, str]:
    def norm(t: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", t.lower())
    return {norm(k): k for k in d.keys()}


def resolve_index_keys(pres_name: str, section: str, clinical_idx: Dict[str, Any], nonclinical_idx: Dict[str, Any]) -> List[str]:
    # Manual alias first
    if (section, pres_name) in ALIAS_MAP:
        return ALIAS_MAP[(section, pres_name)]

    # Choose index by section
    idx = clinical_idx if SECTION_INDEX_TYPE.get(section) == "clinical" else nonclinical_idx

    # Exact (case-insensitive)
    for k in idx.keys():
        if k.lower() == pres_name.lower():
            return [k]

    # Token-normalized
    def norm(t: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", t.lower())
    n_name = norm(pres_name)

    # Exact normalized
    for k in idx.keys():
        if norm(k) == n_name:
            return [k]

    # Contains: if the list name is umbrella, gather children with substring match
    matches = [k for k in idx.keys() if n_name and n_name in norm(k)]
    return matches


def write_json_atomically(dest_path: str, data: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    tmp = dest_path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, dest_path)


# ! -----------------------------
# ! Main build
# ! -----------------------------

def main() -> None:
    # Load resources
    presentation_data: Dict[str, Any] = load_json(PRESENTATION_LIST_PATH)
    clinical_idx: Dict[str, Any] = load_json(CLINICAL_INDEX_PATH)
    nonclinical_idx: Dict[str, Any] = load_json(NONCLINICAL_INDEX_PATH)
    schema_data: Dict[str, Any] = load_json(SCHEMA_PATH)
    required_symptoms = get_required_symptom_keys(schema_data)

    created = 0
    updated = 0
    skipped = 0
    no_index = 0

    summary_rows = []

    for section, entries in presentation_data.items():
        folder_name = SECTION_FOLDERS.get(section, "misc")
        index_type = SECTION_INDEX_TYPE.get(section, "clinical")

        for entry in entries:
            pres_name = entry["name"] if isinstance(entry, dict) else str(entry)
            slug = slugify(pres_name)

            # Low priority routing
            subfolder = folder_name
            if slug in LOW_PRIORITY_SLUGS and LOW_PRIORITY_MODE == "subfolder":
                subfolder = "clinical/other"

            dest_path = os.path.join(BASE_DIR, subfolder, f"{slug}.json")
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)

            # Resolve which index keys to use
            matched_keys = resolve_index_keys(pres_name, section, clinical_idx, nonclinical_idx)
            used_keys: List[str] = []

            # Build items
            items: List[Dict[str, Any]] = []
            seen = set()
            chosen_idx = clinical_idx if index_type == "clinical" else nonclinical_idx

            for key in matched_keys:
                block = chosen_idx.get(key)
                if block is None:
                    continue
                used_keys.append(key)
                for cat, et, fq in iter_etiologies(block):
                    system = title_case_system(cat)
                    name = et
                    sig = (system.lower(), name.lower())
                    if sig in seen:
                        continue
                    seen.add(sig)
                    item: Dict[str, Any] = {
                        "name": name,
                        "system": system,
                        "redFlag": False,
                        "symptoms": blank_symptoms(required_symptoms),
                    }
                    if INCLUDE_FREQ:
                        item["freq"] = fq if fq else "unknown"
                    items.append(item)

            # Build document
            doc: Dict[str, Any] = {
                "presentation": pres_name,
                "items": items,
                "sources": {
                    "index_keys": used_keys,
                    "index_type": index_type,
                },
            }

            action = ""
            if os.path.exists(dest_path):
                if REBUILD_EXISTING:
                    # Preserve extra top-level fields (if any) not managed by us
                    try:
                        existing = load_json(dest_path)
                    except Exception:
                        existing = {}
                    for k in existing.keys():
                        if k not in doc and k not in {"items", "sources"}:
                            doc[k] = existing[k]
                    if not DRY_RUN:
                        write_json_atomically(dest_path, doc)
                    updated += 1
                    action = "updated"
                else:
                    skipped += 1
                    action = "skipped"
            else:
                if not DRY_RUN:
                    write_json_atomically(dest_path, doc)
                created += 1
                action = "created"

            if not used_keys:
                no_index += 1

            summary_rows.append({
                "Presentation": pres_name,
                "Section": section,
                "Action": action,
                "IndexType": index_type,
                "#Etiologies": len(items),
                "AliasesUsed": ", ".join(used_keys) if used_keys else "",
                "Path": dest_path,
            })

    # Write summary markdown
    lines = [
        "# Presentation Build Summary\n",
        f"Created: {created}  |  Updated: {updated}  |  Skipped: {skipped}  |  No index match: {no_index}\n",
        f"List: {PRESENTATION_LIST_PATH}\n",
        f"Clinical Index: {CLINICAL_INDEX_PATH}\n",
        f"Non-Clinical Index: {NONCLINICAL_INDEX_PATH}\n",
        f"Schema: {SCHEMA_PATH}\n",
        "\n",
        "| Presentation | Section | Action | IndexType | #Etiologies | Aliases Used | Path |\n",
        "|---|---|---|---|---:|---|---|\n",
    ]
    for r in summary_rows:
        lines.append(
            f"| {r['Presentation']} | {r['Section']} | {r['Action']} | {r['IndexType']} | {r['#Etiologies']} | {r['AliasesUsed']} | `{r['Path']}` |\n"
        )

    try:
        if not DRY_RUN:
            os.makedirs(os.path.dirname(SUMMARY_PATH), exist_ok=True)
            with open(SUMMARY_PATH, "w") as f:
                f.write("".join(lines))
    except Exception as e:
        print(f"! Failed to write summary: {e}")

    print(f"Created={created}, Updated={updated}, Skipped={skipped}, NoIndex={no_index}")


if __name__ == "__main__":
    main()