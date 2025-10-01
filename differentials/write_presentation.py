import os
import json
import re

# ! Base directory for all presentations
base_dir = "/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations"

# ! Load presentations from Presentation_list.json
with open("/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/Presentation_list.json", "r") as f:
    presentation_data = json.load(f)

# ! Map section names to folder names
section_folders = {
    "Clinical Presentations": "clinical",
    "Biochemical Presentations": "biochemical",
    "Haematological Presentations": "haematological"
}

# ! Utility: slugify name -> filename
def slugify(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)  # remove non-alphanumeric except spaces/hyphens
    slug = slug.strip().replace(" ", "-")
    return slug

# ! Schema stub for each file
def make_stub(name):
    return {
        "presentation": name,
        "items": []
    }

# Loop through sections
for section, items in presentation_data.items():
    folder_name = section_folders.get(section, "misc")  # default to "misc" if unmapped
    section_dir = os.path.join(base_dir, folder_name)
    os.makedirs(section_dir, exist_ok=True)

    for entry in items:
        pres = entry["name"]
        slug = slugify(pres)
        path = os.path.join(section_dir, f"{slug}.json")

        if not os.path.exists(path):
            with open(path, "w") as f:
                json.dump(make_stub(pres), f, indent=2)
            print(f"Created {path}")
        else:
            print(f"Skipped (already exists): {path}")