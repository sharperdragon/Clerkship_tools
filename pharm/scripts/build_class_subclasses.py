#!/usr/bin/env python3
"""
Generate subclass taxonomy artifacts for pharm class filtering.

Outputs:
1) One subclass file per primary class in `pharm/assests/classes`.
2) A master index file at `pharm/assests/classes/class_subclasses_index.json`.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple


# ================================================================
# Configurable values (change here)
# ================================================================
PHARM_DIR = Path(__file__).resolve().parents[1]
CLASSES_SIMPLE_PATH = PHARM_DIR / "assests" / "classes_simple.json"
ENRICHED_DATA_PATH = PHARM_DIR / "assests" / "pharm_data_drugbank_enriched.json"
OUTPUT_CLASSES_DIR = PHARM_DIR / "assests" / "classes"
MASTER_INDEX_PATH = OUTPUT_CLASSES_DIR / "class_subclasses_index.json"

SUBCLASS_FILE_SUFFIX = "_subclasses.json"
INDEX_VERSION = "1"
APPROVED_GROUP_NAME = "approved"
CLEAN_EXISTING_SUBCLASS_FILES = True

# Stem overrides for families where fallback stem would over/under-group.
STEM_OVERRIDES: Dict[str, str] = {
    "adrenergic agents": "adrenergic",
    "dopamine agents": "dopamine",
    "anesthetics": "anesthetics",
    "antibiotics": "antibiotics",
    "antineoplastic agents": "antineoplastic",
    "diuretics": "diuretics",
    "contraceptive agents": "contraceptive",
    "contraceptives oral combined": "contraceptives",
    "contraceptives oral synthetic": "contraceptives",
    "contraceptives postcoital hormonal": "contraceptives",
    "contraceptives postcoital synthetic": "contraceptives",
    "adjuvants": "adjuvants",
    "muscle relaxants": "muscle",
}


def clean_text(value: object) -> str:
    return str(value or "").strip()


def normalize_text(value: object) -> str:
    text = clean_text(value).lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def slugify(value: object) -> str:
    text = normalize_text(value)
    slug = text.replace(" ", "-")
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "class"


def ensure_unique_slug(base_slug: str, used_slugs: Set[str]) -> str:
    if base_slug not in used_slugs:
        used_slugs.add(base_slug)
        return base_slug

    suffix = 2
    while True:
        candidate = f"{base_slug}-{suffix}"
        if candidate not in used_slugs:
            used_slugs.add(candidate)
            return candidate
        suffix += 1


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def load_classes_simple(path: Path) -> List[str]:
    payload = load_json(path)
    if isinstance(payload, dict):
        classes = payload.get("classes", [])
    else:
        classes = payload

    if not isinstance(classes, list):
        raise ValueError(f"Expected list of classes in {path}")

    ordered: List[str] = []
    seen: Set[str] = set()
    for item in classes:
        label = clean_text(item)
        if not label:
            continue
        key = normalize_text(label)
        if key in seen:
            continue
        seen.add(key)
        ordered.append(label)

    return ordered


def load_medications(path: Path) -> List[Dict[str, object]]:
    payload = load_json(path)
    if isinstance(payload, list):
        meds = payload
    elif isinstance(payload, dict) and isinstance(payload.get("medications"), list):
        meds = payload["medications"]
    else:
        raise ValueError(f"Unable to read medications array from {path}")

    out: List[Dict[str, object]] = []
    for item in meds:
        if isinstance(item, dict):
            out.append(item)
    return out


def to_text_list(value: object) -> List[str]:
    if isinstance(value, list):
        return [clean_text(v) for v in value if clean_text(v)]

    cleaned = clean_text(value)
    return [cleaned] if cleaned else []


def medication_groups(record: Dict[str, object]) -> Set[str]:
    drugbank_meta = record.get("drugbank")
    if not isinstance(drugbank_meta, dict):
        return set()

    groups = to_text_list(drugbank_meta.get("groups"))
    return {normalize_text(g) for g in groups if normalize_text(g)}


def medication_class_labels(record: Dict[str, object]) -> Set[str]:
    labels: Set[str] = set()

    drug_class = clean_text(record.get("drugClass"))
    if drug_class:
        labels.add(drug_class)

    drugbank_meta = record.get("drugbank")
    if isinstance(drugbank_meta, dict):
        for category in to_text_list(drugbank_meta.get("categories")):
            labels.add(category)

    return labels


def collect_approved_supported_classes(
    medications: Iterable[Dict[str, object]],
    canonical_classes: Set[str],
) -> Tuple[Dict[str, int], Dict[str, int]]:
    all_counts: Dict[str, int] = {label: 0 for label in canonical_classes}
    approved_counts: Dict[str, int] = {label: 0 for label in canonical_classes}

    normalized_to_canonical = {normalize_text(label): label for label in canonical_classes}

    for med in medications:
        groups = medication_groups(med)
        approved = APPROVED_GROUP_NAME in groups

        labels = medication_class_labels(med)
        matched_labels: Set[str] = set()
        for raw in labels:
            canonical = normalized_to_canonical.get(normalize_text(raw))
            if canonical:
                matched_labels.add(canonical)

        for label in matched_labels:
            all_counts[label] += 1
            if approved:
                approved_counts[label] += 1

    return all_counts, approved_counts


def derive_stem(primary_class: str) -> str:
    primary_key = normalize_text(primary_class)
    override = STEM_OVERRIDES.get(primary_key)
    if override:
        return normalize_text(override)

    before_comma = clean_text(primary_class).split(",", 1)[0]
    normalized_before_comma = normalize_text(before_comma)
    if not normalized_before_comma:
        return ""

    return normalized_before_comma.split(" ", 1)[0]


def starts_with_stem(label: str, stem: str) -> bool:
    normalized_label = normalize_text(label)
    normalized_stem = normalize_text(stem)
    if not normalized_label or not normalized_stem:
        return False

    if normalized_label == normalized_stem:
        return True

    return normalized_label.startswith(f"{normalized_stem} ")


def build_primary_records(
    ordered_classes: List[str],
    approved_counts: Dict[str, int],
) -> List[Dict[str, object]]:
    supported = {label for label, count in approved_counts.items() if count > 0}

    used_slugs: Set[str] = set()
    records: List[Dict[str, object]] = []

    for primary in ordered_classes:
        stem = derive_stem(primary)
        subclasses = sorted(
            {
                label
                for label in ordered_classes
                if label in supported and starts_with_stem(label, stem)
            },
            key=lambda item: item.lower(),
        )

        if not subclasses:
            continue

        slug = ensure_unique_slug(slugify(primary), used_slugs)
        file_name = f"{slug}{SUBCLASS_FILE_SUFFIX}"

        records.append(
            {
                "primaryClass": primary,
                "slug": slug,
                "stem": stem,
                "fileName": file_name,
                "subclasses": subclasses,
            }
        )

    return records


def write_primary_files(records: List[Dict[str, object]], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    if CLEAN_EXISTING_SUBCLASS_FILES:
        for existing in output_dir.glob(f"*{SUBCLASS_FILE_SUFFIX}"):
            existing.unlink()

    for record in records:
        payload = {
            "primaryClass": record["primaryClass"],
            "slug": record["slug"],
            "stem": record["stem"],
            "subclasses": record["subclasses"],
        }

        file_path = output_dir / str(record["fileName"])
        file_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def write_master_index(
    records: List[Dict[str, object]],
    classes_simple_path: Path,
    enriched_data_path: Path,
    output_path: Path,
) -> None:
    primaries = [
        {
            "primaryClass": record["primaryClass"],
            "slug": record["slug"],
            "file": f"classes/{record['fileName']}",
            "subclasses": record["subclasses"],
        }
        for record in records
    ]

    payload = {
        "version": INDEX_VERSION,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "sourceFiles": {
            "classesSimple": str(classes_simple_path),
            "enrichedData": str(enriched_data_path),
        },
        "primaries": primaries,
    }

    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def validate_outputs(
    records: List[Dict[str, object]],
    ordered_classes: List[str],
    approved_counts: Dict[str, int],
    output_dir: Path,
    index_path: Path,
) -> None:
    canonical_set = set(ordered_classes)

    slugs = [str(record["slug"]) for record in records]
    if len(slugs) != len(set(slugs)):
        raise ValueError("Duplicate slugs detected in generated records.")

    for record in records:
        subclasses = list(record["subclasses"])
        if len(subclasses) != len(set(subclasses)):
            raise ValueError(f"Duplicate subclasses in primary {record['primaryClass']}")

        for subclass in subclasses:
            if subclass not in canonical_set:
                raise ValueError(f"Subclass '{subclass}' not found in classes_simple.json")
            if approved_counts.get(subclass, 0) <= 0:
                raise ValueError(f"Subclass '{subclass}' has zero approved support")

        output_file = output_dir / str(record["fileName"])
        if not output_file.exists():
            raise ValueError(f"Missing generated primary file: {output_file}")

    if not index_path.exists():
        raise ValueError(f"Missing master index file: {index_path}")


def run() -> None:
    ordered_classes = load_classes_simple(CLASSES_SIMPLE_PATH)
    medications = load_medications(ENRICHED_DATA_PATH)

    all_counts, approved_counts = collect_approved_supported_classes(medications, set(ordered_classes))

    primary_records = build_primary_records(ordered_classes, approved_counts)

    write_primary_files(primary_records, OUTPUT_CLASSES_DIR)
    write_master_index(primary_records, CLASSES_SIMPLE_PATH, ENRICHED_DATA_PATH, MASTER_INDEX_PATH)
    validate_outputs(primary_records, ordered_classes, approved_counts, OUTPUT_CLASSES_DIR, MASTER_INDEX_PATH)

    supported_classes = sum(1 for label in ordered_classes if approved_counts.get(label, 0) > 0)
    dropped_classes = sum(1 for label in ordered_classes if all_counts.get(label, 0) > 0 and approved_counts.get(label, 0) == 0)

    print("Subclass taxonomy build completed.")
    print(f"- Primary classes generated: {len(primary_records)}")
    print(f"- Approved-supported classes: {supported_classes}")
    print(f"- Classes present but non-approved only: {dropped_classes}")
    print(f"- Master index: {MASTER_INDEX_PATH}")


if __name__ == "__main__":
    run()
