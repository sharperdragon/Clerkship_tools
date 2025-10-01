import os
import json
import re
from typing import Dict, Any, Iterable, Tuple, Optional

from pathlib import Path

INDEX_FILENAME = "clinical_presentation_index.json"
SCHEMA_FILENAME = "presentations_schema.json"

# ! -----------------------------
# ! Config: paths & behavior
# ! -----------------------------
# $ Base directory for all presentations
BASE_DIR = "/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations"

# $ Source resources
PRESENTATION_LIST_PATH = "/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/Presentation_list.json"
# ? If you move these into the repo, just update these two variables.
INDEX_PATH = "clinical_presentation_index.json"          # master etiologies by presentation
SCHEMA_PATH = "presentations_schema.json"                 # required symptoms scaffold

# $ Behavior flags
INCLUDE_FREQ = True                     # <- include frequency in each item
BACKFILL_SCHEMA_ON_EXISTING = True      # add missing required symptom arrays on existing files
LOW_PRIORITY_MODE = "subfolder"          # "subfolder" => route to clinical/other; "flag" => keep path, set priority=low
DRY_RUN = False
SUMMARY_PATH = "/Users/claytongoddard/Desktop/presentation_build_summary.md"

# ? Resolve external resource paths with env overrides and local fallbacks
#   Env vars (if set) take precedence: CLINICAL_INDEX_PATH, PRESENTATIONS_SCHEMA_PATH
#   Otherwise we try a series of sensible locations.

def _candidate_paths(primary: str, fname: str) -> Iterable[str]:
    # 1) Primary (as configured)
    yield primary

    # 2) Env override
    env_map = {
        INDEX_FILENAME: os.environ.get("CLINICAL_INDEX_PATH"),
        SCHEMA_FILENAME: os.environ.get("PRESENTATIONS_SCHEMA_PATH"),
    }
    env_val = env_map.get(fname)
    if env_val:
        yield env_val

    # 3) Next to this script (repo-friendly)
    here = Path(__file__).resolve().parent
    yield str(here / fname)

    # 4) ./data/<fname> next to this script
    yield str(here / "data" / fname)

    # 5) Under BASE_DIR
    yield str(Path(BASE_DIR) / fname)

    # 6) One level above BASE_DIR/data (common repo layout)
    base_parent = Path(BASE_DIR).resolve().parent
    yield str(base_parent / "data" / fname)


def _resolve_first(primary: str, fname: str) -> str:
    for cand in _candidate_paths(primary, fname):
        if cand and os.path.exists(cand):
            return cand
    # If nothing exists, return the primary so the error clearly shows what we attempted first
    return primary

# ! -----------------------------
# ! Known section → folder mapping
# ! -----------------------------
SECTION_FOLDERS: Dict[str, str] = {
    "Clinical Presentations": "clinical",
    "Biochemical Presentations": "biochemical",
    "Hematological Presentations": "hematological",
}

# ! Utility: slugify name -> filename
_def_slug_cleanup = re.compile(r"[^a-z0-9\s-]")

def slugify(name: str) -> str:
    s = name.lower()
    s = _def_slug_cleanup.sub("", s)
    s = s.strip().replace(" ", "-")
    s = re.sub(r"-+", "-", s)
    return s

# ! -----------------------------
# ! Low-priority & already-written sets (derived from user-provided paths)
# ! -----------------------------
# NOTE: We only need slugs; extract them from the terminal filename in each path.
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

# Convert to slug sets
WRITTEN_SLUGS = {os.path.splitext(os.path.basename(p))[0] for p in _WRITTEN_PATHS}
LOW_PRIORITY_SLUGS = {os.path.splitext(os.path.basename(p))[0] for p in _LOW_PRIORITY_PATHS}

# ! -----------------------------
# ! Helper utilities
# ! -----------------------------

def load_json(path: str) -> Any:
    try:
        with open(path, "r") as f:
            return json.load(f)
    except FileNotFoundError as e:
        raise FileNotFoundError(
            f"JSON not found at: {path}\n"
            f"Tip: Provide the file or set env vars CLINICAL_INDEX_PATH / PRESENTATIONS_SCHEMA_PATH,\n"
            f"or place {INDEX_FILENAME}/{SCHEMA_FILENAME} adjacent to this script or in ./data/."
        ) from e


def load_index_json() -> Any:
    resolved = _resolve_first(INDEX_PATH, INDEX_FILENAME)
    return load_json(resolved)


def load_schema_json() -> Any:
    resolved = _resolve_first(SCHEMA_PATH, SCHEMA_FILENAME)
    return load_json(resolved)

# ? Required symptom keys (from schema)
_REQUIRED_SYMPTOMS: Optional[Iterable[str]] = None

def _init_required_symptoms(schema: Dict[str, Any]) -> Iterable[str]:
    # schema keeps a list under "symptoms" which defines the required keys
    # Example content: ["onset", "progression", ..., "clinical tests", "other symptoms"]
    global _REQUIRED_SYMPTOMS
    keys = schema.get("symptoms") or []
    _REQUIRED_SYMPTOMS = list(keys)
    return _REQUIRED_SYMPTOMS

# Normalize labels: strip bullets, figure refs, trailing punctuation, e.g. tails
_bullet_pat = re.compile(r"^[\u2022\u2023\u25E6\u2043\u2219\-•\s]+")
_fig_pat = re.compile(r"\((?:fig|figure|see)[:\s][^\)]*\)", re.IGNORECASE)
_eg_tail_pat = re.compile(r"\be\.g\.[^;,.]*")
_trailing_punct = re.compile(r"[\s,:;\-]+$")


def normalize_label(s: str) -> str:
    s = s.strip()
    s = _bullet_pat.sub("", s)
    s = _fig_pat.sub("", s)
    s = _eg_tail_pat.sub("", s)
    s = _trailing_punct.sub("", s)
    return s.strip()

# Iterate nested index structures and yield (category, etiology, freq)

def iter_etiologies(index_block: Any, parent_category: str = "") -> Iterable[Tuple[str, str, Optional[str]]]:
    # The index may be: dict of categories → dict/list/str; lists of etiologies; or strings
    if isinstance(index_block, dict):
        for k, v in index_block.items():
            cat = normalize_label(k) if k else parent_category
            # If value is a dict with possible {name:{freq:..}} shapes or nested categories
            if isinstance(v, dict):
                # Case A: leaf objects like {"Diverticulosis": {"freq": "common"}}
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
                        # e.g., [{"name":"X", "freq":"common"}] variants
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


def ensure_schema_symptoms(obj: Dict[str, Any], required_keys: Iterable[str]) -> Tuple[Dict[str, Any], bool]:
    changed = False
    if "symptoms" not in obj or not isinstance(obj.get("symptoms"), dict):
        obj["symptoms"] = {}
        changed = True
    for key in required_keys:
        if key not in obj["symptoms"] or not isinstance(obj["symptoms"].get(key), list) or len(obj["symptoms"][key]) == 0:
            obj["symptoms"][key] = ["n/a"]
            changed = True
    return obj, changed


def write_json_atomically(dest_path: str, data: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    tmp = dest_path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, dest_path)


def find_index_key(name: str, index_dict: Dict[str, Any]) -> Optional[str]:
    # Try exact case-insensitive
    for k in index_dict.keys():
        if k.lower() == name.lower():
            return k
    # Try loose match: strip non-alnum
    def norm(t: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", t.lower())
    n_name = norm(name)
    for k in index_dict.keys():
        if norm(k) == n_name:
            return k
    return None


# ! -----------------------------
# ! Main build
# ! -----------------------------

def main() -> None:
    # Load resources
    presentation_data: Dict[str, Any] = load_json(PRESENTATION_LIST_PATH)
    index_data: Dict[str, Any] = load_index_json()
    schema_data: Dict[str, Any] = load_schema_json()
    required_symptoms = list(_init_required_symptoms(schema_data))

    created = 0
    skipped_existing = 0
    backfilled = 0
    missing_index = 0

    summary_rows = []

    for section, items in presentation_data.items():
        folder_name = SECTION_FOLDERS.get(section, "misc")

        for entry in items:
            pres_name = entry["name"] if isinstance(entry, dict) else str(entry)
            slug = slugify(pres_name)

            # Low priority routing
            subfolder = folder_name
            priority_val: Optional[str] = None
            if slug in LOW_PRIORITY_SLUGS:
                if LOW_PRIORITY_MODE == "subfolder":
                    # Route to clinical/other regardless of section
                    subfolder = "clinical/other"
                elif LOW_PRIORITY_MODE == "flag":
                    priority_val = "low"

            dest_path = os.path.join(BASE_DIR, subfolder, f"{slug}.json")
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)

            # Prepare template
            data: Dict[str, Any] = {
                "presentation": pres_name,
                "symptoms": {},  # ensure later
                "items": [],
                "sources": {"index_key": None},
            }
            if priority_val:
                data["priority"] = priority_val

            # Populate symptoms scaffold
            data, _ = ensure_schema_symptoms(data, required_symptoms)

            # Locate index content for this presentation
            idx_key = find_index_key(pres_name, index_data)
            if idx_key is None:
                missing_index += 1
            else:
                data["sources"]["index_key"] = idx_key
                block = index_data.get(idx_key)
                if block is not None:
                    for cat, et, fq in iter_etiologies(block):
                        item = {"name": et, "category": cat or ""}
                        if INCLUDE_FREQ and fq:
                            item["freq"] = fq
                        data["items"].append(item)

            # If file exists, either skip or backfill schema
            if os.path.exists(dest_path):
                # Only backfill symptoms if configured
                if BACKFILL_SCHEMA_ON_EXISTING:
                    existing = load_json(dest_path)
                    existing, changed = ensure_schema_symptoms(existing, required_symptoms)
                    if changed and not DRY_RUN:
                        write_json_atomically(dest_path, existing)
                        backfilled += 1
                        action = "backfilled"
                    else:
                        skipped_existing += 1
                        action = "skipped"
                else:
                    skipped_existing += 1
                    action = "skipped"
            else:
                # Write new file
                action = "created"
                if not DRY_RUN:
                    write_json_atomically(dest_path, data)
                created += 1

            summary_rows.append({
                "Presentation": pres_name,
                "Section": section,
                "Dest Path": dest_path,
                "Action": action,
                "Priority": (priority_val or ("low" if subfolder.endswith("/other") else "normal")),
                "Index Match": "yes" if idx_key else "no",
            })

    # Report where resources were loaded from
    index_resolved = _resolve_first(INDEX_PATH, INDEX_FILENAME)
    schema_resolved = _resolve_first(SCHEMA_PATH, SCHEMA_FILENAME)

    # Write summary markdown
    lines = [
        "# Presentation Build Summary\n",
        f"Created: {created}  |  Skipped: {skipped_existing}  |  Backfilled: {backfilled}  |  Missing index: {missing_index}\n",
        f"Index source: {index_resolved}\n",
        f"Schema source: {schema_resolved}\n",
        "\n",
        "| Presentation | Section | Action | Priority | Index Match | Path |\n",
        "|---|---|---|---|---|---|\n",
    ]
    for r in summary_rows:
        lines.append(
            f"| {r['Presentation']} | {r['Section']} | {r['Action']} | {r['Priority']} | {r['Index Match']} | `{r['Dest Path']}` |\n"
        )

    try:
        if not DRY_RUN:
            os.makedirs(os.path.dirname(SUMMARY_PATH), exist_ok=True)
            with open(SUMMARY_PATH, "w") as f:
                f.write("".join(lines))
    except Exception as e:
        print(f"! Failed to write summary: {e}")

    print(f"Created={created}, Skipped={skipped_existing}, Backfilled={backfilled}, MissingIndex={missing_index}")


if __name__ == "__main__":
    main()