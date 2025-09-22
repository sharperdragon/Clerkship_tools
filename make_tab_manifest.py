import os
import json

# ===== Variables (edit these as needed) =====
FOLDER = "/Users/claytongoddard/Git dub/Clerkship_tools"   # folder with template_*.json
OUTPUT = os.path.join(FOLDER, "tabs.json")


def main():
    tabs = []
    for fname in sorted(os.listdir(FOLDER)):
        if not fname.startswith("template_") or not fname.endswith(".json"):
            continue
        path = os.path.join(FOLDER, fname)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"⚠️ Skipping {fname}: {e}")
            continue

        modes = data.get("modes") or []
        if not modes:
            print(f"⚠️ {fname} has no 'modes' key, skipping")
            continue
        key = str(modes[0]).strip().upper()

        tabs.append({
            "key": key,
            "label": key,
            "file": fname
        })

    if not tabs:
        print("No templates found.")
        return

    # Set the first tab as default
    tabs[0]["default"] = True

    manifest = {
        "tabs": tabs,
        "settings": { "columns": 3 }
    }

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"✅ Wrote {OUTPUT} with {len(tabs)} tabs")

if __name__ == "__main__":
    main()