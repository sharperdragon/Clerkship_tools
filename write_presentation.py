import os
import json

# ! Define your target directory
base_dir = "/Users/claytongoddard/Git dub/Clerkship_tools_v2/differentials/data/presentations"

# ! All presentation filenames (from Pocketbook Section A, plus Biochem + Heme combined)
presentations = [
    "abdominal-pain", "abdominal-swellings", "anorectal-pain", "arm-pain",
    "arm-swellings", "ascites", "axillary-swellings", "backache", "breast-lumps",
    "breast-pain", "chest-pain", "clubbing", "coma", "confusion", "constipation",
    "convulsions", "cough", "cyanosis", "deafness", "diarrhoea", "dizziness",
    "dysphagia", "dyspnoea", "ear-disorders", "eye-disorders",
    "erectile-dysfunction", "facial-pain", "facial-swellings", "facial-ulcers",
    "faecal-incontinence", "finger-lesions", "finger-pain",
    "foot-and-ankle-deformities", "foot-pain", "foot-ulcers",
    "gait-abnormalities", "goitre", "groin-swellings", "gynaecomastia",
    "haematemesis", "haematuria", "haemoptysis", "hallucinations",
    "hand-deformities", "headache", "hemiparesis", "hepatomegaly", "hiccups",
    "hirsutism", "hypertension", "intestinal-obstruction", "jaundice",
    "jaw-pain-and-swellings", "joint-disorders", "kidney-swellings",
    "leg-pain", "leg-swellings", "leg-ulcers", "lip-lesions", "lymphadenopathy",
    "melaena", "mouth-ulcers", "muscle-weakness-and-wasting",
    "nail-abnormalities", "nasal-discharge", "neck-lumps", "neck-pain",
    "nipple-discharge", "oliguria", "palpitations", "penile-lesions",
    "polyuria", "popliteal-swellings", "pruritus", "pruritus-ani",
    "pyrexia-of-unknown-origin", "rectal-bleeding", "scalp-lesions",
    "scrotal-pain", "scrotal-swellings", "shock", "splenomegaly", "steatorrhoea",
    "stridor", "sweating-abnormalities", "syncope", "thirst", "throat-disorders",
    "tiredness", "toe-lesions", "tongue-disorders", "tremor", "urethral-discharge",
    "urinary-incontinence", "urinary-retention", "vaginal-discharge",
    "visual-problems", "voice-disorders", "vomiting", "weight-gain", "weight-loss",
    "Biochemical_presentations", "Heme_presentations"
]

# ! Schema stub for each file
def make_stub(presentation):
    return {
        "presentation": presentation.replace("-", " "),
        "items": []
    }

# Ensure the folder exists
os.makedirs(base_dir, exist_ok=True)

# Create each file if not present
for pres in presentations:
    path = os.path.join(base_dir, f"{pres}.json")
    if not os.path.exists(path):
        with open(path, "w") as f:
            json.dump(make_stub(pres), f, indent=2)
        print(f"Created {path}")
    else:
        print(f"Skipped (already exists): {path}")