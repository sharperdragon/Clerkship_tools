Clerkship Tools – NoteWriter

Overview
NoteWriter is a browser-based tool for building structured clinical notes. It provides interactive panels for Subjective, Review of Systems (ROS), Physical Exam (PE), and Mental Status Exam (MSE). Each section is defined by JSON templates, rendered dynamically in the UI, and exported into a complete note.

The project is designed to run entirely in the browser with no backend dependencies. It uses a manifest-driven system (tabs.json) to control which tabs are available and which template each tab uses.

Features
	•	Tab-driven workflow: Navigate between Subjective, ROS, PE, and MSE.
	•	Manifest-based config: tabs.json defines which tabs appear and their template sources.
	•	Template-driven UI: Each mode (e.g., PE, ROS) pulls its structure from a JSON template file (e.g., template_pe.json, template_ROS.json).
	•	Autosave and caching: State is cached in localStorage with TTL-based invalidation.
	•	Acute/Non-acute toggle: Subjective mode supports acuity-based rendering of the HPI panel.
	•	Split-pane layout: Subjective history supports a resizable HPI/General History layout.
	•	Vital signs parser: Free-text vitals can be auto-scrubbed into a standardized format.
	•	Sticky headers: App bar, Tier-1 (tabs), and Tier-2 (section tabs) remain visible while scrolling.
	•	Customizable styles: Driven by styles.css with responsive design for smaller screens.

File Structure
index.html              – Landing page (Clerkship Tools home)
writer.html             – Entry point for NoteWriter (links from index.html)
app.js                  – Core application logic (tab switching, rendering, caching)
styles.css              – Theme, layout, and responsive styles
tabs.json               – Manifest of available tabs & template files
template_subjective.json – Subjective (HPI, PMH, Allergies, etc.)
template_ROS.json        – Review of Systems panels
template_pe.json         – Physical Exam panels
template_MSE.json        – Mental Status Exam panels
make_tab_manifest.py     – Helper script to generate tabs.json automatically

Setup
	1.	Clone or download this repository.
	2.	Open index.html in your browser.
	3.	From the Clerkship Tools home screen, click NoteWriter to launch the tool.
	4.	The app will dynamically load templates from JSON files and render structured panels.

Usage
	1.	Select a Tab: Use the Tier-1 tab bar to choose Subjective, ROS, PE, or MSE.
	2.	Fill in Panels: Each panel has text fields, checkboxes, or “chips” (toggle buttons) depending on the template definition.
	3.	Resize Split View (Subjective only): Drag the vertical splitter between HPI and General History.
	4.	Review Output: The app generates structured text in real time, ready for copy/paste into clinical notes.

Customization
	•	Add/Edit Tabs: Update tabs.json with new entries pointing to template files.
	•	Modify Templates: Adjust template_*.json files to add new panels, fields, or chips.
	•	Generate Manifest: Run make_tab_manifest.py to regenerate tabs.json automatically when new templates are added.
	•	Styling: Modify styles.css to change theme colors, layout, or responsiveness.

Roadmap
	•	Export to DOCX or PDF
	•	Multi-patient state handling
	•	Additional clerkship-specific tools (e.g., USPSTF Helper)

License
© 2025 CJG. For personal and educational use.