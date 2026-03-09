(function () {
  // ================================================================
  // Configurable values (change here)
  // ================================================================
  const CONFIG = {
    dataPath: "./assests/pharm_data_drugbank_enriched.json",
    searchDebounceMs: 170,
    mobileBreakpointPx: 1080,
    emptyStateCopy: "No medications match the current filters.",
    noSelectionTitle: "No selection",
    noSelectionCopy: "Select a medication card to view high-yield details.",
    uncategorizedClassLabel: "Other Classes",
    themeKey: "ui-theme",
    viewModeKey: "pharm-view-mode",
    defaultViewMode: "compact",
    viewModes: ["compact", "structured", "tree"],
    themeChangedEvent: "core-theme-changed",
    themeToggleLightLabel: "Light mode",
    themeToggleDarkLabel: "Dark mode",
    relevanceWeights: {
      exactName: 100,
      namePrefix: 80,
      aliasBrandPrefix: 60,
      nameContains: 45,
      classContains: 30,
      indicationMoaContains: 20,
      otherFieldsContains: 10,
    },
  };

  const RXNORM_PROXY_BASE_URL = "/api/rxnorm";
  const RXNORM_TIMEOUT_MS = 5500;
  const RXNORM_FETCH_ENABLED = true;
  const RXNORM_ENDPOINTS = {
    rxcuiByName: "/rxcui/by-name",
    relatedByRxcui: "/rxcui/{rxcui}/related",
    propertiesByRxcui: "/rxcui/{rxcui}/properties",
    classesByRxcui: "/rxcui/{rxcui}/classes",
  };
  const RXNORM_QUERY_KEYS = {
    name: "name",
    rxcui: "rxcui",
    tty: "tty",
  };
  const RXNORM_DEFAULT_RELATED_TTYS = "IN+MIN+PIN+DF+DFG";

  const SELECTORS = {
    searchInput: "#searchInput",
    classTreeControl: "#classTreeControl",
    classTreeTrigger: "#classTreeTrigger",
    classTreeTriggerText: "#classTreeTriggerText",
    classTreeMenu: "#classTreeMenu",
    classTreeColumns: "#classTreeColumns",
    routeFilter: "#routeFilter",
    clearFiltersButton: "#btnClearFilters",
    resultCount: "#resultCount",
    resultsGrid: "#results",
    detailPanel: "#detailPanel",
    detailCloseButton: "#btnCloseDetail",
    detailTitle: "#detailTitle",
    detailMeta: "#detailMeta",
    detailEmpty: "#detailEmpty",
    detailBody: "#detailBody",
    detailScrim: "#detailScrim",
    loadError: "#loadError",
    themeToggleButton: "#btnThemeToggle",
    viewModeControl: "#viewModeControl",
    viewModeSelect: "#viewModeSelect",
  };

  const ROUTE_ENUM = ["PO", "IV", "IM", "SQ", "INH", "IN", "SL", "Topical", "PR"];
  const RXNORM_STATUS = {
    IDLE: "idle",
    LOADING: "loading",
    SUCCESS: "success",
    EMPTY: "empty",
    ERROR: "error",
  };

  const CLASS_HIERARCHY_RULES = [
    {
      label: "Antibiotics",
      match:
        /(antibiotic|penicillin|cephalosporin|glycopeptide|macrolide|beta-lactam|tetracycline|anti-?staph|carbapenem|lincosamide|oxazolidinone|sulfonamide)/i,
      children: [
        {
          label: "Beta-lactams",
          match: /(beta-lactam|penicillin|cephalosporin|carbapenem)/i,
          children: [
            { label: "Penicillins", match: /(penicillin|aminopenicillin)/i },
            { label: "Cephalosporins", match: /cephalosporin/i },
            {
              label: "Beta-lactamase Inhibitor Combinations",
              match: /beta-lactamase inhibitor|beta-lactam\s*\+\s*inhibitor/i,
            },
            { label: "Carbapenems", match: /carbapenem/i },
          ],
        },
        { label: "Macrolides", match: /macrolide/i },
        {
          label: "Anti-Staph Penicillins",
          match: /anti-?staph(?:ylococcal)?\s*penicillin|nafcillin|oxacillin|cloxacillin|dicloxacillin|flucloxacillin/i,
        },
        { label: "Tetracyclines", match: /tetracycline/i },
        { label: "Glycopeptides", match: /(glycopeptide|vancomycin)/i },
        { label: "Lincosamides", match: /lincosamide/i },
        { label: "Oxazolidinones", match: /oxazolidinone/i },
        { label: "Sulfonamides", match: /sulfonamide|trimethoprim|tmp-?smx/i },
      ],
    },
    {
      label: "Antithrombotics",
      match: /(anticoagulant|antiplatelet|factor xa|heparin)/i,
      children: [
        { label: "Heparins", match: /(heparin|lmwh)/i },
        { label: "Direct Oral Anticoagulants", match: /(factor xa|apixaban|rivaroxaban)/i },
        { label: "Antiplatelets", match: /antiplatelet/i },
      ],
    },
    {
      label: "Cardiovascular",
      match: /(ace inhibitor|beta blocker|calcium channel|diuretic|statin)/i,
      children: [
        { label: "ACE Inhibitors", match: /ace inhibitor/i },
        { label: "Beta Blockers", match: /beta blocker/i },
        { label: "Calcium Channel Blockers", match: /calcium channel/i },
        { label: "Diuretics", match: /diuretic/i },
        { label: "Lipid Management", match: /statin|hmg-coa/i },
      ],
    },
    {
      label: "Endocrine and Metabolic",
      match: /(insulin|biguanide|thyroid hormone|thyroid)/i,
      children: [
        { label: "Diabetes Agents", match: /(insulin|biguanide|metformin)/i },
        { label: "Thyroid Replacement", match: /thyroid/i },
      ],
    },
    {
      label: "Respiratory",
      match: /(beta-2 agonist|bronchodilator|anticholinergic|glucocorticoid)/i,
      children: [
        { label: "Rescue Bronchodilators", match: /(beta-2 agonist|saba|albuterol)/i },
        { label: "Combination Bronchodilators", match: /(anticholinergic.*combination|ipratropium)/i },
        { label: "Systemic Steroids", match: /glucocorticoid|prednisone/i },
      ],
    },
    {
      label: "Gastrointestinal",
      match: /(proton pump|5-ht3|laxative|stool softener|antiemetic)/i,
      children: [
        { label: "Acid Suppression", match: /proton pump/i },
        { label: "Antiemetics", match: /5-ht3|antiemetic|ondansetron/i },
        { label: "Bowel Regimen", match: /laxative|stool softener|senna/i },
      ],
    },
    {
      label: "Psychiatric and Neurologic",
      match: /(ssri|benzodiazepine|antipsychotic)/i,
      children: [
        { label: "SSRIs", match: /ssri/ },
        { label: "Benzodiazepines", match: /benzodiazepine/ },
        { label: "Antipsychotics", match: /antipsychotic/ },
      ],
    },
    {
      label: "Emergency and Toxicology",
      match: /(opioid antagonist|adrenergic agonist|epinephrine|naloxone)/i,
      children: [
        { label: "Resuscitation Agents", match: /(adrenergic agonist|epinephrine)/i },
        { label: "Overdose Reversal", match: /(opioid antagonist|naloxone)/i },
      ],
    },
    {
      label: "Pain and Inflammation",
      match: /(nsaid|analgesic|antipyretic)/i,
      children: [
        { label: "NSAIDs", match: /nsaid/ },
        { label: "Analgesics and Antipyretics", match: /analgesic|antipyretic/ },
      ],
    },
  ];

  const REQUIRED_FIELDS = [
    "id",
    "name",
    "drugClass",
    "routes",
    "moa",
    "indications",
    "contraindications",
    "adverseEffects",
    "majorInteractions",
    "monitoring",
  ];

  // ================================================================
  // App state
  // ================================================================
  const STATE = {
    medications: [],
    filtered: [],
    groupingIndex: null,
    selectedId: null,
    query: "",
    classFilterNodeId: "",
    classFilterLabel: "All classes",
    classFilterClassSet: null,
    classTreeRoot: null,
    classTreeById: new Map(),
    classTreePath: [],
    classTreeMenuOpen: false,
    routeFilter: "",
    viewMode: CONFIG.defaultViewMode,
    expandedClassId: null,
    selectedSubclassByClass: {},
    theme: "light",
    rxnormByMedicationId: {},
  };
  const RXNORM_IN_FLIGHT = new Map();

  const EL = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    syncThemeFromStorage();
    syncViewModeFromStorage();
    syncViewModeControls();
    bindEvents();
    loadData();
  }

  function cacheElements() {
    Object.entries(SELECTORS).forEach(([key, selector]) => {
      EL[key] = document.querySelector(selector);
    });
  }

  function bindEvents() {
    if (EL.searchInput) {
      EL.searchInput.addEventListener(
        "input",
        debounce(() => {
          STATE.query = EL.searchInput.value.trim();
          applyFiltersAndRender();
        }, CONFIG.searchDebounceMs)
      );
    }

    if (EL.classTreeTrigger) {
      EL.classTreeTrigger.addEventListener("click", () => {
        if (STATE.classTreeMenuOpen) {
          closeClassTreeMenu();
        } else {
          openClassTreeMenu();
        }
      });
    }

    if (EL.classTreeColumns) {
      EL.classTreeColumns.addEventListener("click", (event) => {
        const option = event.target.closest(".class-tree-option");
        if (!option) return;

        const action = cleanText(option.dataset.action);
        const nodeId = cleanText(option.dataset.nodeId);
        const depth = Number(option.dataset.depth);
        const safeDepth = Number.isFinite(depth) && depth >= 0 ? depth : 0;

        if (action === "all") {
          resetClassFilter();
          applyFiltersAndRender();
          closeClassTreeMenu();
          return;
        }

        if (!nodeId || !STATE.classTreeById.has(nodeId)) return;

        const node = STATE.classTreeById.get(nodeId);
        STATE.classTreePath = STATE.classTreePath.slice(0, safeDepth);
        STATE.classTreePath[safeDepth] = nodeId;

        applyClassFilterNode(node);
        renderClassTreeColumns();

        if (!node.children || node.children.length === 0) {
          closeClassTreeMenu();
        }
      });
    }

    if (EL.routeFilter) {
      EL.routeFilter.addEventListener("change", () => {
        STATE.routeFilter = EL.routeFilter.value;
        applyFiltersAndRender();
      });
    }

    if (EL.clearFiltersButton) {
      EL.clearFiltersButton.addEventListener("click", () => {
        clearFilters();
        applyFiltersAndRender();
      });
    }

    if (EL.resultsGrid) {
      EL.resultsGrid.addEventListener("click", (event) => {
        const classToggle = event.target.closest(".class-toggle");
        if (classToggle) {
          handleClassToggleClick(classToggle.dataset.classId);
          return;
        }

        const subclassChip = event.target.closest(".subclass-chip");
        if (subclassChip) {
          handleSubclassChipClick(subclassChip.dataset.classId, subclassChip.dataset.subclassId);
          return;
        }

        const card = event.target.closest(".med-card");
        if (!card) return;
        selectMedication(card.dataset.id, true);
      });

      EL.resultsGrid.addEventListener("keydown", handleResultsGridKeydown);
    }

    if (EL.viewModeControl) {
      EL.viewModeControl.addEventListener("click", (event) => {
        const button = event.target.closest("[data-view-mode]");
        if (!button) return;
        setViewMode(button.dataset.viewMode, { persist: true, rerender: true });
      });
    }

    if (EL.viewModeSelect) {
      EL.viewModeSelect.addEventListener("change", () => {
        setViewMode(EL.viewModeSelect.value, { persist: true, rerender: true });
      });
    }

    if (EL.detailCloseButton) {
      EL.detailCloseButton.addEventListener("click", closeMobileDetailPanel);
    }

    if (EL.detailScrim) {
      EL.detailScrim.addEventListener("click", closeMobileDetailPanel);
    }

    if (EL.themeToggleButton) {
      EL.themeToggleButton.addEventListener("click", toggleTheme);
    }

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      if (STATE.classTreeMenuOpen) {
        closeClassTreeMenu();
        return;
      }

      if (EL.detailPanel && EL.detailPanel.classList.contains("open")) {
        closeMobileDetailPanel();
      }
    });

    document.addEventListener("click", (event) => {
      if (!STATE.classTreeMenuOpen || !EL.classTreeControl) return;
      if (EL.classTreeControl.contains(event.target)) return;
      closeClassTreeMenu();
    });

    window.addEventListener("resize", () => {
      if (!isMobileViewport()) {
        closeMobileDetailPanel();
      }
    });

    window.addEventListener("storage", (event) => {
      if (event.key === CONFIG.themeKey) {
        syncThemeFromStorage();
      }
    });

    document.addEventListener(CONFIG.themeChangedEvent, (event) => {
      const eventTheme = event?.detail?.theme;
      if (eventTheme === "light" || eventTheme === "dark") {
        applyTheme(eventTheme);
      } else {
        syncThemeFromStorage();
      }
    });
  }

  function clearFilters() {
    if (EL.searchInput) EL.searchInput.value = "";
    if (EL.routeFilter) EL.routeFilter.value = "";

    STATE.query = "";
    resetClassFilter();
    STATE.routeFilter = "";
    closeClassTreeMenu();
  }

  function handleClassToggleClick(classId) {
    if (!classId) return;
    STATE.expandedClassId = classId;
    renderCards();
  }

  function handleSubclassChipClick(classId, subclassId) {
    if (!classId || !subclassId) return;
    STATE.selectedSubclassByClass[classId] = subclassId;
    renderCards();
  }

  async function loadData() {
    hideError();
    try {
      const response = await fetch(CONFIG.dataPath, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load medication data (${response.status})`);
      }

      const payload = await response.json();
      const records = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.medications)
          ? payload.medications
          : [];

      STATE.medications = records
        .map((record, index) => normalizeMedication(record, index))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));

      populateClassFilter();
      populateRouteFilter();
      applyFiltersAndRender();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to load medication data.");
      STATE.medications = [];
      applyFiltersAndRender();
    }
  }

  function normalizeMedication(record, index) {
    if (!record || typeof record !== "object") return null;

    const id = cleanText(record.id) || `med-${index + 1}`;
    const name = cleanText(record.name);
    const drugClass = cleanText(record.drugClass);
    const routes = uniq(toTextArray(record.routes).map(normalizeRoute).filter(Boolean));
    const moa = cleanText(record.moa);
    const indications = toTextArray(record.indications);
    const contraindications = toTextArray(record.contraindications);
    const adverseEffects = toTextArray(record.adverseEffects);
    const majorInteractions = toTextArray(record.majorInteractions);
    const monitoring = toTextArray(record.monitoring);
    const aliases = toTextArray(record.aliases);
    const brandExamples = toTextArray(record.brandExamples);
    const pearls = toTextArray(record.pearls);

    const normalized = {
      id,
      name,
      drugClass,
      routes,
      moa,
      indications,
      contraindications,
      adverseEffects,
      majorInteractions,
      monitoring,
      aliases,
      brandExamples,
      pearls,
    };

    const missing = REQUIRED_FIELDS.filter((field) => {
      const value = normalized[field];
      if (Array.isArray(value)) return value.length === 0;
      return !value;
    });

    if (missing.length > 0) {
      console.warn(`Medication record "${id}" missing required field(s): ${missing.join(", ")}`);
      return null;
    }

    normalized.nameNorm = normalizeSearch(normalized.name);
    normalized.drugClassNorm = normalizeSearch(normalized.drugClass);
    normalized.routesNorm = normalized.routes.map(normalizeSearch);
    normalized.moaNorm = normalizeSearch(normalized.moa);
    normalized.indicationsNorm = normalized.indications.map(normalizeSearch);
    normalized.aliasesNorm = normalized.aliases.map(normalizeSearch);
    normalized.brandExamplesNorm = normalized.brandExamples.map(normalizeSearch);
    normalized.contraindicationsNorm = normalized.contraindications.map(normalizeSearch);
    normalized.adverseEffectsNorm = normalized.adverseEffects.map(normalizeSearch);
    normalized.majorInteractionsNorm = normalized.majorInteractions.map(normalizeSearch);
    normalized.monitoringNorm = normalized.monitoring.map(normalizeSearch);

    normalized.searchBlob = [
      normalized.nameNorm,
      normalized.drugClassNorm,
      normalized.moaNorm,
      ...normalized.routesNorm,
      ...normalized.aliasesNorm,
      ...normalized.brandExamplesNorm,
      ...normalized.indicationsNorm,
      ...normalized.contraindicationsNorm,
      ...normalized.adverseEffectsNorm,
      ...normalized.majorInteractionsNorm,
      ...normalized.monitoringNorm,
    ].join(" ");

    normalized.otherFieldsNorm = [
      ...normalized.routesNorm,
      ...normalized.contraindicationsNorm,
      ...normalized.adverseEffectsNorm,
      ...normalized.majorInteractionsNorm,
      ...normalized.monitoringNorm,
    ];

    normalized.classPath = deriveClassPath(normalized);

    return normalized;
  }

  function applyFiltersAndRender() {
    const q = normalizeSearch(STATE.query);
    const classFilterClassSet = STATE.classFilterClassSet;
    const routeFilter = STATE.routeFilter;

    STATE.filtered = STATE.medications.filter((medication) => {
      if (classFilterClassSet && !classFilterClassSet.has(medication.drugClass)) return false;
      if (routeFilter && !medication.routes.includes(routeFilter)) return false;
      if (q && !medication.searchBlob.includes(q)) return false;
      return true;
    });

    if (q) {
      STATE.filtered.sort((a, b) => compareByRelevance(a, b, q));
    } else {
      STATE.filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    STATE.groupingIndex = buildGroupingIndex(STATE.filtered, Boolean(q));
    syncGroupingStateAfterFilter();

    if (!STATE.filtered.some((medication) => medication.id === STATE.selectedId)) {
      STATE.selectedId = null;
      closeMobileDetailPanel();
    }

    renderResultCount();
    renderCards();
    renderDetail();
  }

  function compareByRelevance(a, b, query) {
    const aScore = computeRelevanceScore(a, query);
    const bScore = computeRelevanceScore(b, query);

    if (aScore !== bScore) {
      return bScore - aScore;
    }

    return a.name.localeCompare(b.name);
  }

  function computeRelevanceScore(medication, query) {
    const w = CONFIG.relevanceWeights;
    let score = 0;

    if (medication.nameNorm === query) {
      score = Math.max(score, w.exactName);
    }

    if (medication.nameNorm.startsWith(query)) {
      score = Math.max(score, w.namePrefix);
    }

    if (
      medication.aliasesNorm.some((value) => value.startsWith(query)) ||
      medication.brandExamplesNorm.some((value) => value.startsWith(query))
    ) {
      score = Math.max(score, w.aliasBrandPrefix);
    }

    if (medication.nameNorm.includes(query)) {
      score = Math.max(score, w.nameContains);
    }

    if (medication.drugClassNorm.includes(query)) {
      score = Math.max(score, w.classContains);
    }

    if (
      medication.moaNorm.includes(query) ||
      medication.indicationsNorm.some((value) => value.includes(query))
    ) {
      score = Math.max(score, w.indicationMoaContains);
    }

    if (medication.otherFieldsNorm.some((value) => value.includes(query))) {
      score = Math.max(score, w.otherFieldsContains);
    }

    return score;
  }

  function populateClassFilter() {
    const { root, byId } = buildClassFilterTree(STATE.medications);
    STATE.classTreeRoot = root;
    STATE.classTreeById = byId;

    if (STATE.classFilterNodeId && STATE.classTreeById.has(STATE.classFilterNodeId)) {
      const currentNode = STATE.classTreeById.get(STATE.classFilterNodeId);
      applyClassFilterNode(currentNode, { rerender: false });
    } else {
      resetClassFilter({ rerender: false });
    }

    syncClassTreeTrigger();
    renderClassTreeColumns();
  }

  function buildClassFilterTree(medications) {
    let nodeSequence = 0;
    const root = createClassFilterNode("class-tree-root", "All classes", null);

    medications.forEach((medication, index) => {
      const medicationId = cleanText(medication.id) || `med-${index + 1}`;
      const classValue = cleanText(medication.drugClass) || CONFIG.uncategorizedClassLabel;
      const rawPath = Array.isArray(medication.classPath) && medication.classPath.length > 0
        ? medication.classPath
        : [classValue];

      let node = root;
      node.classSet.add(classValue);
      node.medicationSet.add(medicationId);

      rawPath.forEach((segment) => {
        const label = cleanText(segment) || CONFIG.uncategorizedClassLabel;
        const lookupKey = normalizeSearch(label);
        if (!node.childMap.has(lookupKey)) {
          nodeSequence += 1;
          const childId = `class-tree-${nodeSequence}`;
          node.childMap.set(lookupKey, createClassFilterNode(childId, label, node.id));
        }

        const child = node.childMap.get(lookupKey);
        node = child;
        node.classSet.add(classValue);
        node.medicationSet.add(medicationId);
      });
    });

    const byId = new Map();

    function finalize(node) {
      node.children = Array.from(node.childMap.values()).sort((a, b) => a.label.localeCompare(b.label));
      node.classValues = Array.from(node.classSet.values());
      node.medicationCount = node.medicationSet.size;
      byId.set(node.id, node);
      node.children.forEach(finalize);
    }

    finalize(root);
    return { root, byId };
  }

  function createClassFilterNode(id, label, parentId) {
    return {
      id,
      label,
      parentId,
      childMap: new Map(),
      children: [],
      classSet: new Set(),
      medicationSet: new Set(),
      classValues: [],
      medicationCount: 0,
    };
  }

  function resetClassFilter(options = {}) {
    const { rerender = true } = options;
    STATE.classFilterNodeId = "";
    STATE.classFilterLabel = "All classes";
    STATE.classFilterClassSet = null;
    STATE.classTreePath = [];
    syncClassTreeTrigger();

    if (rerender) {
      renderClassTreeColumns();
    }
  }

  function applyClassFilterNode(node, options = {}) {
    const { rerender = true } = options;
    if (!node) {
      resetClassFilter({ rerender });
      return;
    }

    STATE.classFilterNodeId = node.id;
    STATE.classFilterLabel = node.label;
    STATE.classFilterClassSet = new Set(node.classValues);
    STATE.classTreePath = getClassTreePath(node.id);
    syncClassTreeTrigger();

    if (rerender) {
      renderClassTreeColumns();
    }
  }

  function getClassTreePath(nodeId) {
    const path = [];
    let current = STATE.classTreeById.get(nodeId);
    while (current && current.parentId) {
      path.unshift(current.id);
      current = STATE.classTreeById.get(current.parentId);
    }
    return path;
  }

  function syncClassTreeTrigger() {
    if (!EL.classTreeTrigger || !EL.classTreeTriggerText) return;
    EL.classTreeTriggerText.textContent = STATE.classFilterLabel || "All classes";
    EL.classTreeTrigger.classList.toggle("is-filtered", Boolean(STATE.classFilterNodeId));
  }

  function openClassTreeMenu() {
    if (!EL.classTreeMenu || !EL.classTreeTrigger) return;
    STATE.classTreeMenuOpen = true;
    EL.classTreeMenu.hidden = false;
    EL.classTreeTrigger.setAttribute("aria-expanded", "true");
    if (EL.classTreeControl) {
      EL.classTreeControl.classList.add("is-open");
    }
    renderClassTreeColumns();
  }

  function closeClassTreeMenu() {
    if (!EL.classTreeMenu || !EL.classTreeTrigger) return;
    STATE.classTreeMenuOpen = false;
    EL.classTreeMenu.hidden = true;
    EL.classTreeTrigger.setAttribute("aria-expanded", "false");
    if (EL.classTreeControl) {
      EL.classTreeControl.classList.remove("is-open");
    }
  }

  function renderClassTreeColumns() {
    if (!EL.classTreeColumns) return;
    EL.classTreeColumns.innerHTML = "";

    const root = STATE.classTreeRoot;
    if (!root) return;

    const validPath = [];
    let parent = root;
    for (const nodeId of STATE.classTreePath) {
      const candidate = STATE.classTreeById.get(nodeId);
      if (!candidate || candidate.parentId !== parent.id) break;
      validPath.push(candidate.id);
      parent = candidate;
    }
    STATE.classTreePath = validPath;

    const activePathIds = new Set(validPath);
    const columns = [{ depth: 0, parent: root, nodes: root.children }];

    let cursor = root;
    for (let depth = 0; depth < validPath.length; depth += 1) {
      const selectedId = validPath[depth];
      const selectedNode = STATE.classTreeById.get(selectedId);
      if (!selectedNode || selectedNode.parentId !== cursor.id) break;
      if (!selectedNode.children || selectedNode.children.length === 0) break;
      columns.push({ depth: depth + 1, parent: selectedNode, nodes: selectedNode.children });
      cursor = selectedNode;
    }

    columns.forEach((column) => {
      const columnEl = document.createElement("section");
      columnEl.className = "class-tree-column";

      const title = document.createElement("p");
      title.className = "class-tree-column__title";
      title.textContent = column.depth === 0 ? "All classes" : column.parent.label;
      columnEl.appendChild(title);

      const list = document.createElement("div");
      list.className = "class-tree-list";

      if (column.depth === 0) {
        const allOption = document.createElement("button");
        allOption.type = "button";
        allOption.className = `class-tree-option${STATE.classFilterNodeId ? "" : " is-active"}`;
        allOption.dataset.action = "all";
        allOption.dataset.depth = "0";
        allOption.setAttribute("role", "treeitem");
        allOption.setAttribute("aria-selected", String(!STATE.classFilterNodeId));

        const label = document.createElement("span");
        label.className = "class-tree-option__label";
        label.textContent = "All classes";
        allOption.appendChild(label);

        const count = document.createElement("span");
        count.className = "class-tree-option__count";
        count.textContent = `${root.medicationCount}`;
        allOption.appendChild(count);

        list.appendChild(allOption);
      }

      column.nodes.forEach((node) => {
        const option = document.createElement("button");
        option.type = "button";
        option.dataset.action = "node";
        option.dataset.nodeId = node.id;
        option.dataset.depth = String(column.depth);
        option.setAttribute("role", "treeitem");
        option.setAttribute("aria-selected", String(node.id === STATE.classFilterNodeId));

        const isActive = node.id === STATE.classFilterNodeId;
        const isBranch = activePathIds.has(node.id);
        option.className = `class-tree-option${isActive ? " is-active" : ""}${isBranch && !isActive ? " is-branch" : ""}`;

        const label = document.createElement("span");
        label.className = "class-tree-option__label";
        label.textContent = node.label;
        option.appendChild(label);

        const meta = document.createElement("span");
        meta.className = "class-tree-option__meta";

        const count = document.createElement("span");
        count.className = "class-tree-option__count";
        count.textContent = `${node.medicationCount}`;
        meta.appendChild(count);

        if (node.children && node.children.length > 0) {
          const caret = document.createElement("span");
          caret.className = "class-tree-option__caret";
          caret.textContent = "›";
          meta.appendChild(caret);
        }

        option.appendChild(meta);
        list.appendChild(option);
      });

      columnEl.appendChild(list);
      EL.classTreeColumns.appendChild(columnEl);
    });
  }

  function populateRouteFilter() {
    const presentRoutes = new Set(STATE.medications.flatMap((medication) => medication.routes));
    const routes = ROUTE_ENUM.filter((route) => presentRoutes.has(route));
    setSelectOptions(EL.routeFilter, [
      { value: "", label: "All routes" },
      ...routes.map((route) => ({ value: route, label: route })),
    ]);
  }

  function setSelectOptions(selectEl, options) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    options.forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      selectEl.appendChild(option);
    });
  }

  function renderResultCount() {
    if (!EL.resultCount) return;
    const count = STATE.filtered.length;
    EL.resultCount.textContent = `${count} medication${count === 1 ? "" : "s"}`;
  }

  function renderCards() {
    if (!EL.resultsGrid) return;
    EL.resultsGrid.innerHTML = "";
    EL.resultsGrid.dataset.viewMode = STATE.viewMode;

    if (STATE.filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "results-empty";
      empty.textContent = CONFIG.emptyStateCopy;
      EL.resultsGrid.appendChild(empty);
      return;
    }

    if (!STATE.groupingIndex) return;

    const fragment = document.createDocumentFragment();
    if (STATE.viewMode === "structured") {
      renderStructuredGroups(STATE.groupingIndex, fragment);
    } else if (STATE.viewMode === "tree") {
      renderTreeGroups(STATE.groupingIndex, fragment);
    } else {
      renderCompactGroups(STATE.groupingIndex, fragment);
    }
    EL.resultsGrid.appendChild(fragment);
  }

  function buildGroupingIndex(medications, sortByRelevance) {
    const root = createClassNode("root");
    const classMap = new Map();

    medications.forEach((medication, rank) => {
      insertMedicationIntoClassTree(root, medication.classPath, medication, rank);

      const topLabel = medication.classPath[0] || medication.drugClass || CONFIG.uncategorizedClassLabel;
      const subclassLabel = medication.classPath[2]
        || medication.classPath[1]
        || medication.drugClass
        || CONFIG.uncategorizedClassLabel;
      const classId = makeStableId(`class-${topLabel}`);

      if (!classMap.has(classId)) {
        classMap.set(classId, {
          id: classId,
          label: topLabel,
          medications: [],
          subclassMap: new Map(),
          firstRank: rank,
        });
      }

      const classGroup = classMap.get(classId);
      classGroup.firstRank = Math.min(classGroup.firstRank, rank);
      classGroup.medications.push(medication);

      const subclassId = makeStableId(`subclass-${topLabel}-${subclassLabel}`);
      if (!classGroup.subclassMap.has(subclassId)) {
        classGroup.subclassMap.set(subclassId, {
          id: subclassId,
          label: subclassLabel,
          medications: [],
          firstRank: rank,
        });
      }

      const subclassGroup = classGroup.subclassMap.get(subclassId);
      subclassGroup.firstRank = Math.min(subclassGroup.firstRank, rank);
      subclassGroup.medications.push(medication);
    });

    const classes = Array.from(classMap.values());
    classes.sort((a, b) => compareGroupEntries(a, b, sortByRelevance));
    classes.forEach((classGroup) => {
      classGroup.subclasses = Array.from(classGroup.subclassMap.values()).sort((a, b) =>
        compareGroupEntries(a, b, sortByRelevance)
      );
      delete classGroup.subclassMap;
    });

    return {
      classes,
      treeRoot: root,
      sortByRelevance,
    };
  }

  function compareGroupEntries(a, b, sortByRelevance) {
    if (sortByRelevance && a.firstRank !== b.firstRank) {
      return a.firstRank - b.firstRank;
    }
    return a.label.localeCompare(b.label);
  }

  function syncGroupingStateAfterFilter() {
    const classes = STATE.groupingIndex?.classes || [];
    if (classes.length === 0) {
      STATE.expandedClassId = null;
      STATE.selectedSubclassByClass = {};
      return;
    }

    const classIds = new Set(classes.map((classGroup) => classGroup.id));
    if (!STATE.expandedClassId || !classIds.has(STATE.expandedClassId)) {
      STATE.expandedClassId = classes[0].id;
    }

    const nextSelection = {};
    classes.forEach((classGroup) => {
      const selectedSubclassId = STATE.selectedSubclassByClass[classGroup.id];
      const hasSelected = classGroup.subclasses.some((subclass) => subclass.id === selectedSubclassId);
      nextSelection[classGroup.id] = hasSelected
        ? selectedSubclassId
        : classGroup.subclasses[0]
          ? classGroup.subclasses[0].id
          : "";
    });

    STATE.selectedSubclassByClass = nextSelection;
  }

  function createClassNode(label) {
    return {
      label,
      children: new Map(),
      medications: [],
      medicationCount: 0,
      firstRank: Number.POSITIVE_INFINITY,
    };
  }

  function insertMedicationIntoClassTree(node, path, medication, rank) {
    node.firstRank = Math.min(node.firstRank, rank);
    node.medicationCount += 1;
    if (!Array.isArray(path) || path.length === 0) {
      node.medications.push(medication);
      return;
    }

    const [nextLabel, ...remainingPath] = path;
    if (!node.children.has(nextLabel)) {
      node.children.set(nextLabel, createClassNode(nextLabel));
    }

    const child = node.children.get(nextLabel);
    insertMedicationIntoClassTree(child, remainingPath, medication, rank);
  }

  function renderCompactGroups(index, container) {
    index.classes.forEach((classGroup) => {
      const classSection = document.createElement("section");
      classSection.className = "class-block class-block--compact";
      classSection.dataset.classId = classGroup.id;

      const header = document.createElement("div");
      header.className = "class-block__header";

      const title = document.createElement("h3");
      title.className = "class-block__title";
      title.textContent = classGroup.label;
      header.appendChild(title);

      const count = document.createElement("span");
      count.className = "class-block__count";
      count.textContent = `${classGroup.medications.length}`;
      header.appendChild(count);

      classSection.appendChild(header);

      const body = document.createElement("div");
      body.className = "class-block__body";

      const selectedSubclassId = STATE.selectedSubclassByClass[classGroup.id];
      const selectedSubclass = classGroup.subclasses.find((subclass) => subclass.id === selectedSubclassId)
        || classGroup.subclasses[0];

      if (classGroup.subclasses.length > 1) {
        const chips = document.createElement("div");
        chips.className = "subclass-chips";
        classGroup.subclasses.forEach((subclass) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = `subclass-chip${subclass.id === selectedSubclass?.id ? " is-active" : ""}`;
          chip.dataset.classId = classGroup.id;
          chip.dataset.subclassId = subclass.id;
          chip.setAttribute("aria-pressed", String(subclass.id === selectedSubclass?.id));
          chip.textContent = subclass.label;
          chips.appendChild(chip);
        });
        body.appendChild(chips);
      }

      body.appendChild(makeCardsGrid(selectedSubclass ? selectedSubclass.medications : classGroup.medications));
      classSection.appendChild(body);
      container.appendChild(classSection);
    });
  }

  function renderStructuredGroups(index, container) {
    index.classes.forEach((classGroup) => {
      const expanded = classGroup.id === STATE.expandedClassId;
      const classSection = document.createElement("section");
      classSection.className = `class-block class-block--structured${expanded ? " is-expanded" : ""}`;
      classSection.dataset.classId = classGroup.id;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "class-toggle";
      toggle.dataset.classId = classGroup.id;
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute("aria-controls", `class-body-${classGroup.id}`);

      const title = document.createElement("span");
      title.className = "class-toggle__title";
      title.textContent = classGroup.label;
      toggle.appendChild(title);

      const count = document.createElement("span");
      count.className = "class-toggle__count";
      count.textContent = `${classGroup.medications.length}`;
      toggle.appendChild(count);

      classSection.appendChild(toggle);

      const body = document.createElement("div");
      body.className = "class-block__body";
      body.id = `class-body-${classGroup.id}`;
      body.hidden = !expanded;

      classGroup.subclasses.forEach((subclass) => {
        const heading = document.createElement("h4");
        heading.className = "subclass-heading";
        heading.textContent = subclass.label;
        body.appendChild(heading);
        body.appendChild(makeCardsGrid(subclass.medications));
      });

      classSection.appendChild(body);
      container.appendChild(classSection);
    });
  }

  function renderTreeGroups(index, container) {
    const topNodes = Array.from(index.treeRoot.children.values()).sort((a, b) =>
      compareGroupEntries(a, b, index.sortByRelevance)
    );

    topNodes.forEach((topNode) => {
      const classId = makeStableId(`class-${topNode.label}`);
      const expanded = classId === STATE.expandedClassId;

      const classSection = document.createElement("section");
      classSection.className = `class-block class-block--tree${expanded ? " is-expanded" : ""}`;
      classSection.dataset.classId = classId;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "class-toggle";
      toggle.dataset.classId = classId;
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute("aria-controls", `class-tree-${classId}`);

      const title = document.createElement("span");
      title.className = "class-toggle__title";
      title.textContent = topNode.label;
      toggle.appendChild(title);

      const count = document.createElement("span");
      count.className = "class-toggle__count";
      count.textContent = `${topNode.medicationCount}`;
      toggle.appendChild(count);

      classSection.appendChild(toggle);

      const body = document.createElement("div");
      body.className = "class-block__body";
      body.id = `class-tree-${classId}`;
      body.hidden = !expanded;

      if (topNode.medications.length > 0) {
        body.appendChild(makeCardsGrid(topNode.medications, "tree-cards"));
      }

      if (topNode.children.size > 0) {
        renderTreeBranches(topNode, body, 1, index.sortByRelevance);
      }

      classSection.appendChild(body);
      container.appendChild(classSection);
    });
  }

  function renderTreeBranches(node, container, depth, sortByRelevance) {
    const children = Array.from(node.children.values()).sort((a, b) =>
      compareGroupEntries(a, b, sortByRelevance)
    );

    children.forEach((child) => {
      const branch = document.createElement("div");
      branch.className = "tree-branch";
      branch.dataset.depth = String(depth);

      const label = document.createElement("p");
      label.className = "tree-branch__label";
      label.textContent = child.label;
      branch.appendChild(label);

      if (child.medications.length > 0) {
        branch.appendChild(makeCardsGrid(child.medications, "tree-cards"));
      }

      if (child.children.size > 0) {
        const subtree = document.createElement("div");
        subtree.className = "tree-children";
        renderTreeBranches(child, subtree, depth + 1, sortByRelevance);
        branch.appendChild(subtree);
      }

      container.appendChild(branch);
    });
  }

  function makeCardsGrid(medications, className = "cards-grid") {
    const grid = document.createElement("div");
    grid.className = className;
    medications.forEach((medication) => {
      grid.appendChild(makeMedicationCard(medication));
    });
    return grid;
  }

  function makeStableId(value) {
    const normalized = normalizeSearch(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalized || "group";
  }

  function setViewMode(mode, options = {}) {
    const { persist = true, rerender = true } = options;
    if (!CONFIG.viewModes.includes(mode)) return;

    STATE.viewMode = mode;
    syncViewModeControls();

    if (persist) {
      try {
        localStorage.setItem(CONFIG.viewModeKey, mode);
      } catch {
        // Non-fatal if storage is unavailable.
      }
    }

    if (rerender && STATE.groupingIndex) {
      syncGroupingStateAfterFilter();
      renderCards();
    }
  }

  function syncViewModeFromStorage() {
    try {
      const stored = localStorage.getItem(CONFIG.viewModeKey);
      STATE.viewMode = CONFIG.viewModes.includes(stored) ? stored : CONFIG.defaultViewMode;
    } catch {
      STATE.viewMode = CONFIG.defaultViewMode;
    }
  }

  function syncViewModeControls() {
    if (EL.viewModeControl) {
      const buttons = EL.viewModeControl.querySelectorAll("[data-view-mode]");
      buttons.forEach((button) => {
        const active = button.dataset.viewMode === STATE.viewMode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    }

    if (EL.viewModeSelect) {
      EL.viewModeSelect.value = STATE.viewMode;
    }

    if (EL.resultsGrid) {
      EL.resultsGrid.dataset.viewMode = STATE.viewMode;
    }
  }

  function makeMedicationCard(medication) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `med-card${STATE.selectedId === medication.id ? " is-selected" : ""}`;
    card.dataset.id = medication.id;
    card.setAttribute("aria-label", `${medication.name} details`);
    card.setAttribute("aria-pressed", String(STATE.selectedId === medication.id));

    const title = document.createElement("h3");
    title.className = "med-card__title";
    title.textContent = medication.name;

    const classText = document.createElement("p");
    classText.className = "med-card__class";
    classText.textContent = medication.drugClass;

    const routeRow = document.createElement("div");
    routeRow.className = "pill-row";
    medication.routes.forEach((route) => {
      const chip = document.createElement("span");
      chip.className = "pill";
      chip.textContent = route;
      routeRow.appendChild(chip);
    });

    const snippet = document.createElement("p");
    snippet.className = "med-card__snippet";
    const snippetValues = medication.indications.length > 0
      ? medication.indications.slice(0, 2)
      : [medication.moa];
    snippet.textContent = snippetValues.join(" • ");

    card.appendChild(title);
    card.appendChild(classText);
    card.appendChild(routeRow);
    card.appendChild(snippet);
    return card;
  }

  function handleResultsGridKeydown(event) {
    const card = event.target.closest(".med-card");
    if (!card || !EL.resultsGrid) return;

    const cards = Array.from(EL.resultsGrid.querySelectorAll(".med-card"));
    if (cards.length === 0) return;

    const currentIndex = cards.indexOf(card);
    if (currentIndex < 0) return;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusCard(cards, currentIndex + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusCard(cards, currentIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        focusCard(cards, 0);
        break;
      case "End":
        event.preventDefault();
        focusCard(cards, cards.length - 1);
        break;
      case "Enter":
      case " ":
      case "Spacebar":
        event.preventDefault();
        selectMedication(card.dataset.id, true);
        break;
      default:
        break;
    }
  }

  function focusCard(cards, index) {
    const boundedIndex = Math.max(0, Math.min(cards.length - 1, index));
    const target = cards[boundedIndex];
    if (!target) return;

    target.focus();
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function selectMedication(id, openOnMobile) {
    if (!id) return;
    STATE.selectedId = id;

    renderCards();
    ensureRxNormForMedication(id);
    renderDetail();

    if (openOnMobile && isMobileViewport() && EL.detailPanel && EL.detailScrim) {
      EL.detailPanel.classList.add("open");
      EL.detailScrim.hidden = false;
      document.body.classList.add("detail-open");
    }
  }

  function renderDetail() {
    if (!EL.detailTitle || !EL.detailBody || !EL.detailEmpty || !EL.detailMeta) return;

    const selected = STATE.medications.find((medication) => medication.id === STATE.selectedId);
    EL.detailBody.innerHTML = "";

    if (!selected) {
      EL.detailTitle.textContent = CONFIG.noSelectionTitle;
      EL.detailMeta.hidden = true;
      EL.detailBody.hidden = true;
      EL.detailEmpty.hidden = false;
      EL.detailEmpty.innerHTML = `<p>${CONFIG.noSelectionCopy}</p>`;
      return;
    }

    EL.detailTitle.textContent = selected.name;
    EL.detailMeta.hidden = false;
    EL.detailMeta.textContent = `${selected.classPath.join(" › ")} • ${selected.routes.join(", ")}`;
    EL.detailEmpty.hidden = true;
    EL.detailBody.hidden = false;
    const rxNormState = getRxNormStateForMedication(selected.id);

    const sections = [
      makeTextSection("Class", selected.drugClass, "class"),
      makeTextSection("Routes", selected.routes.join(", "), "routes"),
      makeTextSection("MOA", selected.moa, "moa"),
      makeListSection("Indications", selected.indications, "indications"),
      makeListSection("Contraindications", selected.contraindications, "contraindications"),
      makeListSection("Adverse Effects", selected.adverseEffects, "adverse-effects"),
      makeListSection("Major Interactions", selected.majorInteractions, "major-interactions"),
      makeListSection("Monitoring", selected.monitoring, "monitoring"),
      makeRxNormSection(rxNormState),
      makeListSection("Pearls", selected.pearls, "pearls"),
      makeListSection("Aliases", selected.aliases, "aliases"),
      makeListSection("Brand Examples", selected.brandExamples, "brand-examples"),
    ];

    const fragment = document.createDocumentFragment();
    sections.forEach((section) => fragment.appendChild(section));
    EL.detailBody.appendChild(fragment);
  }

  function makeTextSection(title, text, dataSection) {
    const section = document.createElement("section");
    section.className = "detail-section";
    section.dataset.section = dataSection;

    const heading = document.createElement("h3");
    heading.className = "detail-section__title";
    heading.textContent = title;

    const content = document.createElement("p");
    content.className = "detail-section__text";
    content.textContent = text || "None listed.";

    section.appendChild(heading);
    section.appendChild(content);
    return section;
  }

  function makeListSection(title, items, dataSection) {
    const section = document.createElement("section");
    section.className = "detail-section";
    section.dataset.section = dataSection;

    const heading = document.createElement("h3");
    heading.className = "detail-section__title";
    heading.textContent = title;

    const list = document.createElement("ul");
    list.className = "detail-section__list";
    const values = items.length > 0 ? items : ["None listed."];

    values.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });

    section.appendChild(heading);
    section.appendChild(list);
    return section;
  }

  function createEmptyRxNormPayload() {
    return {
      rxcui: null,
      canonicalName: null,
      ingredients: [],
      doseForms: [],
      classes: [],
    };
  }

  function makeRxNormState(status, data = createEmptyRxNormPayload(), errorMessage = "") {
    return {
      status,
      data,
      errorMessage,
    };
  }

  function getRxNormStateForMedication(medicationId) {
    const state = STATE.rxnormByMedicationId[medicationId];
    if (state) return state;
    return makeRxNormState(RXNORM_STATUS.IDLE);
  }

  function ensureRxNormForMedication(medicationId) {
    if (!medicationId) return;

    const cached = STATE.rxnormByMedicationId[medicationId];
    if (cached && cached.status !== RXNORM_STATUS.IDLE) {
      return;
    }

    if (!RXNORM_FETCH_ENABLED || !cleanText(RXNORM_PROXY_BASE_URL)) {
      STATE.rxnormByMedicationId[medicationId] = makeRxNormState(
        RXNORM_STATUS.ERROR,
        createEmptyRxNormPayload(),
        "RxNorm unavailable right now."
      );
      return;
    }

    if (RXNORM_IN_FLIGHT.has(medicationId)) {
      return;
    }

    const medication = STATE.medications.find((item) => item.id === medicationId);
    if (!medication) return;

    STATE.rxnormByMedicationId[medicationId] = makeRxNormState(RXNORM_STATUS.LOADING);

    const task = loadRxNormForMedication(medication)
      .then((payload) => {
        if (!payload) {
          STATE.rxnormByMedicationId[medicationId] = makeRxNormState(RXNORM_STATUS.EMPTY);
          return;
        }

        const hasAnyData = Boolean(
          payload.rxcui
          || payload.canonicalName
          || payload.ingredients.length > 0
          || payload.doseForms.length > 0
          || payload.classes.length > 0
        );

        STATE.rxnormByMedicationId[medicationId] = hasAnyData
          ? makeRxNormState(RXNORM_STATUS.SUCCESS, payload)
          : makeRxNormState(RXNORM_STATUS.EMPTY);
      })
      .catch((error) => {
        console.warn("RxNorm lookup failed:", error);
        STATE.rxnormByMedicationId[medicationId] = makeRxNormState(
          RXNORM_STATUS.ERROR,
          createEmptyRxNormPayload(),
          "RxNorm unavailable right now."
        );
      })
      .finally(() => {
        RXNORM_IN_FLIGHT.delete(medicationId);
        if (STATE.selectedId === medicationId) {
          renderDetail();
        }
      });

    RXNORM_IN_FLIGHT.set(medicationId, task);
  }

  async function loadRxNormForMedication(medication) {
    const rxcui = await resolveRxcuiForMedication(medication);
    if (!rxcui) return null;

    const [relatedResult, propertiesResult, classesResult] = await Promise.allSettled([
      fetchRelatedByRxcui(rxcui),
      fetchPropertiesByRxcui(rxcui),
      fetchClassesByRxcui(rxcui),
    ]);

    const allFailed = [relatedResult, propertiesResult, classesResult].every(
      (result) => result.status === "rejected"
    );
    if (allFailed) {
      const firstError = [relatedResult, propertiesResult, classesResult].find(
        (result) => result.status === "rejected"
      );
      throw firstError.reason;
    }

    return normalizeRxNormPayload({
      rxcui,
      relatedPayload: relatedResult.status === "fulfilled" ? relatedResult.value : null,
      propertiesPayload: propertiesResult.status === "fulfilled" ? propertiesResult.value : null,
      classesPayload: classesResult.status === "fulfilled" ? classesResult.value : null,
    });
  }

  async function resolveRxcuiForMedication(medication) {
    const candidates = dedupeText([
      medication.name,
      ...toTextArray(medication.aliases),
    ]);

    let hadNoMatchResponse = false;
    let lastError = null;

    for (const candidate of candidates) {
      try {
        const rxcui = await fetchRxcuiByName(candidate);
        if (rxcui) return rxcui;
        hadNoMatchResponse = true;
      } catch (error) {
        lastError = error;
      }
    }

    if (hadNoMatchResponse) return "";
    if (lastError) throw lastError;
    return "";
  }

  async function fetchRxcuiByName(name) {
    const url = buildRxNormUrl(
      RXNORM_ENDPOINTS.rxcuiByName,
      {},
      { [RXNORM_QUERY_KEYS.name]: cleanText(name) }
    );
    const payload = await fetchJsonWithTimeout(url);
    return extractRxcuiFromNamePayload(payload);
  }

  async function fetchRelatedByRxcui(rxcui) {
    const url = buildRxNormUrl(
      RXNORM_ENDPOINTS.relatedByRxcui,
      { [RXNORM_QUERY_KEYS.rxcui]: rxcui },
      { [RXNORM_QUERY_KEYS.tty]: RXNORM_DEFAULT_RELATED_TTYS }
    );
    return fetchJsonWithTimeout(url);
  }

  async function fetchPropertiesByRxcui(rxcui) {
    const url = buildRxNormUrl(
      RXNORM_ENDPOINTS.propertiesByRxcui,
      { [RXNORM_QUERY_KEYS.rxcui]: rxcui }
    );
    return fetchJsonWithTimeout(url);
  }

  async function fetchClassesByRxcui(rxcui) {
    const url = buildRxNormUrl(
      RXNORM_ENDPOINTS.classesByRxcui,
      { [RXNORM_QUERY_KEYS.rxcui]: rxcui }
    );
    return fetchJsonWithTimeout(url);
  }

  function normalizeRxNormPayload({ rxcui, relatedPayload, propertiesPayload, classesPayload }) {
    const canonicalName = cleanText(
      propertiesPayload?.properties?.name
      || propertiesPayload?.name
      || extractNameFromConceptGroups(relatedPayload)
    );

    const ingredients = dedupeText(
      extractRelatedConceptNames(relatedPayload, new Set(["IN", "MIN", "PIN"]))
    );
    const doseForms = dedupeText([
      ...extractRelatedConceptNames(relatedPayload, new Set(["DF", "DFG"])),
      ...toTextArray(propertiesPayload?.properties?.doseFormName),
      ...toTextArray(propertiesPayload?.doseFormName),
    ]);

    return {
      rxcui: cleanText(rxcui) || null,
      canonicalName: canonicalName || null,
      ingredients,
      doseForms,
      classes: dedupeClassEntries(extractRxNormClasses(classesPayload)),
    };
  }

  function extractConceptGroups(relatedPayload) {
    const groups = [];

    if (Array.isArray(relatedPayload?.allRelatedGroup?.conceptGroup)) {
      groups.push(...relatedPayload.allRelatedGroup.conceptGroup);
    }

    if (Array.isArray(relatedPayload?.relatedGroup?.conceptGroup)) {
      groups.push(...relatedPayload.relatedGroup.conceptGroup);
    }

    if (Array.isArray(relatedPayload?.conceptGroup)) {
      groups.push(...relatedPayload.conceptGroup);
    }

    return groups;
  }

  function extractRelatedConceptNames(relatedPayload, allowedTtys = null) {
    const names = [];
    const groups = extractConceptGroups(relatedPayload);

    groups.forEach((group) => {
      const tty = cleanText(group?.tty).toUpperCase();
      if (allowedTtys && !allowedTtys.has(tty)) {
        return;
      }

      const concepts = Array.isArray(group?.conceptProperties) ? group.conceptProperties : [];
      concepts.forEach((concept) => {
        const name = cleanText(concept?.name || concept?.synonym);
        if (name) names.push(name);
      });
    });

    return names;
  }

  function extractNameFromConceptGroups(relatedPayload) {
    const names = extractRelatedConceptNames(relatedPayload);
    return names[0] || "";
  }

  function extractRxcuiFromNamePayload(payload) {
    const idGroup = payload?.idGroup;
    if (Array.isArray(idGroup?.rxnormId) && idGroup.rxnormId.length > 0) {
      return cleanText(idGroup.rxnormId[0]);
    }

    if (Array.isArray(payload?.approximateGroup?.candidate) && payload.approximateGroup.candidate.length > 0) {
      return cleanText(payload.approximateGroup.candidate[0]?.rxcui);
    }

    if (cleanText(payload?.rxcui)) {
      return cleanText(payload.rxcui);
    }

    return "";
  }

  function extractRxNormClasses(classesPayload) {
    const classes = [];
    const infoList = classesPayload?.rxclassDrugInfoList?.rxclassDrugInfo;
    if (Array.isArray(infoList)) {
      infoList.forEach((item) => {
        const name = cleanText(item?.rxclassMinConceptItem?.className || item?.className);
        if (!name) return;
        const source = cleanText(item?.relaSource);
        const type = cleanText(item?.rela);
        classes.push({
          name,
          source: source || undefined,
          type: type || undefined,
        });
      });
    }

    const minConceptList = classesPayload?.rxclassMinConceptList?.rxclassMinConcept;
    if (Array.isArray(minConceptList)) {
      minConceptList.forEach((item) => {
        const name = cleanText(item?.className || item?.name);
        if (!name) return;
        classes.push({ name });
      });
    }

    return classes;
  }

  function makeRxNormSection(rxNormState) {
    const section = document.createElement("section");
    section.className = "detail-section detail-section--rxnorm";
    section.dataset.section = "rxnorm";

    const heading = document.createElement("h3");
    heading.className = "detail-section__title";
    heading.textContent = "RxNorm";
    section.appendChild(heading);

    const body = document.createElement("div");
    body.className = "rxnorm-body";

    const status = rxNormState?.status || RXNORM_STATUS.IDLE;
    if (status === RXNORM_STATUS.LOADING || status === RXNORM_STATUS.IDLE) {
      body.appendChild(makeRxNormStateMessage(RXNORM_STATUS.LOADING, "Loading RxNorm data..."));
      section.appendChild(body);
      return section;
    }

    if (status === RXNORM_STATUS.ERROR) {
      body.appendChild(
        makeRxNormStateMessage(
          RXNORM_STATUS.ERROR,
          cleanText(rxNormState?.errorMessage) || "RxNorm unavailable right now."
        )
      );
      section.appendChild(body);
      return section;
    }

    if (status === RXNORM_STATUS.EMPTY) {
      body.appendChild(makeRxNormStateMessage(RXNORM_STATUS.EMPTY, "No RxNorm match found."));
      section.appendChild(body);
      return section;
    }

    const payload = rxNormState?.data || createEmptyRxNormPayload();
    const hasFieldValues = [
      appendRxNormField(body, "RxCUI", payload.rxcui, "rxcui"),
      appendRxNormField(body, "Canonical Name", payload.canonicalName, "canonical-name"),
      appendRxNormChipField(body, "Ingredients", payload.ingredients, "ingredients"),
      appendRxNormChipField(body, "Dose Forms", payload.doseForms, "dose-forms"),
      appendRxNormClassesField(body, payload.classes),
    ].some(Boolean);

    if (!hasFieldValues) {
      body.appendChild(makeRxNormStateMessage(RXNORM_STATUS.EMPTY, "No RxNorm match found."));
    }

    section.appendChild(body);
    return section;
  }

  function makeRxNormStateMessage(status, text) {
    const message = document.createElement("p");
    message.className = `detail-section__text rxnorm-state rxnorm-state--${status}`;
    message.dataset.rxnormState = status;
    message.textContent = text;
    return message;
  }

  function appendRxNormField(container, label, value, fieldKey) {
    const textValue = cleanText(value);
    if (!textValue) return false;

    const field = document.createElement("div");
    field.className = "rxnorm-field";
    field.dataset.rxnormField = fieldKey;

    const fieldLabel = document.createElement("p");
    fieldLabel.className = "rxnorm-field__label";
    fieldLabel.textContent = label;

    const fieldValue = document.createElement("p");
    fieldValue.className = "rxnorm-field__value";
    fieldValue.textContent = textValue;

    field.appendChild(fieldLabel);
    field.appendChild(fieldValue);
    container.appendChild(field);
    return true;
  }

  function appendRxNormChipField(container, label, items, fieldKey) {
    const values = dedupeText(toTextArray(items));
    if (values.length === 0) return false;

    const field = document.createElement("div");
    field.className = "rxnorm-field";
    field.dataset.rxnormField = fieldKey;

    const fieldLabel = document.createElement("p");
    fieldLabel.className = "rxnorm-field__label";
    fieldLabel.textContent = label;

    const row = document.createElement("div");
    row.className = "rxnorm-chip-row";
    values.forEach((item) => {
      const chip = document.createElement("span");
      chip.className = "pill rxnorm-pill";
      chip.textContent = item;
      row.appendChild(chip);
    });

    field.appendChild(fieldLabel);
    field.appendChild(row);
    container.appendChild(field);
    return true;
  }

  function appendRxNormClassesField(container, classes) {
    if (!Array.isArray(classes) || classes.length === 0) return false;

    const field = document.createElement("div");
    field.className = "rxnorm-field";
    field.dataset.rxnormField = "classes";

    const fieldLabel = document.createElement("p");
    fieldLabel.className = "rxnorm-field__label";
    fieldLabel.textContent = "Class Links";

    const list = document.createElement("ul");
    list.className = "detail-section__list rxnorm-class-list";
    classes.forEach((item) => {
      const li = document.createElement("li");
      const suffixBits = [item.source, item.type].filter(Boolean);
      li.textContent = suffixBits.length > 0
        ? `${item.name} (${suffixBits.join(" • ")})`
        : item.name;
      list.appendChild(li);
    });

    field.appendChild(fieldLabel);
    field.appendChild(list);
    container.appendChild(field);
    return true;
  }

  function buildRxNormUrl(endpointTemplate, pathParams = {}, queryParams = {}) {
    const path = fillPathTemplate(endpointTemplate, pathParams);
    const baseUrl = joinUrlParts(RXNORM_PROXY_BASE_URL, path);
    return mergeQueryParams(baseUrl, queryParams);
  }

  function fillPathTemplate(template, pathParams) {
    let output = cleanText(template);
    Object.entries(pathParams || {}).forEach(([key, value]) => {
      output = output.replace(`{${key}}`, encodeURIComponent(cleanText(value)));
    });
    return output;
  }

  function joinUrlParts(base, path) {
    const basePart = cleanText(base).replace(/\/+$/g, "");
    const pathPart = cleanText(path).replace(/^\/+/g, "");
    if (!basePart) return `/${pathPart}`;
    if (!pathPart) return basePart;
    return `${basePart}/${pathPart}`;
  }

  function mergeQueryParams(url, params) {
    const searchParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      const cleaned = cleanText(value);
      if (!cleaned) return;
      searchParams.set(key, cleaned);
    });
    const encoded = searchParams.toString();
    if (!encoded) return url;
    return `${url}?${encoded}`;
  }

  async function fetchJsonWithTimeout(url) {
    const requestUrl = cleanText(url);
    if (!requestUrl) {
      throw new Error("RxNorm proxy URL is not configured.");
    }

    let timeoutId = null;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), RXNORM_TIMEOUT_MS);
    }

    try {
      const response = await fetch(requestUrl, {
        cache: "no-store",
        signal: controller ? controller.signal : undefined,
      });

      if (!response.ok) {
        throw new Error(`RxNorm proxy request failed (${response.status})`);
      }

      const payload = await response.json();
      if (!payload || typeof payload !== "object") {
        throw new Error("RxNorm proxy returned invalid JSON.");
      }

      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("RxNorm request timed out.");
      }
      throw error instanceof Error ? error : new Error("RxNorm request failed.");
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  function dedupeText(items) {
    const seen = new Set();
    const out = [];
    toTextArray(items).forEach((item) => {
      const normalized = normalizeSearch(item);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      out.push(cleanText(item));
    });
    return out;
  }

  function dedupeClassEntries(classes) {
    if (!Array.isArray(classes)) return [];
    const seen = new Set();
    const deduped = [];

    classes.forEach((item) => {
      const name = cleanText(item?.name);
      if (!name) return;

      const source = cleanText(item?.source);
      const type = cleanText(item?.type);
      const key = [normalizeSearch(name), normalizeSearch(source), normalizeSearch(type)].join("|");
      if (seen.has(key)) return;
      seen.add(key);

      deduped.push({
        name,
        source: source || undefined,
        type: type || undefined,
      });
    });

    return deduped;
  }

  function closeMobileDetailPanel() {
    if (!EL.detailPanel || !EL.detailScrim) return;
    EL.detailPanel.classList.remove("open");
    EL.detailScrim.hidden = true;
    document.body.classList.remove("detail-open");
  }

  function isMobileViewport() {
    return window.matchMedia(`(max-width: ${CONFIG.mobileBreakpointPx}px)`).matches;
  }

  function syncThemeFromStorage() {
    applyTheme(getStoredTheme());
  }

  function getStoredTheme() {
    try {
      const saved = localStorage.getItem(CONFIG.themeKey);
      return saved === "dark" || saved === "light" ? saved : "light";
    } catch {
      return "light";
    }
  }

  function applyTheme(mode) {
    const theme = mode === "dark" ? "dark" : "light";
    STATE.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
    updateThemeToggleLabel();
  }

  function updateThemeToggleLabel() {
    if (!EL.themeToggleButton) return;

    const willSwitchToDark = STATE.theme !== "dark";
    const nextLabel = willSwitchToDark
      ? CONFIG.themeToggleDarkLabel
      : CONFIG.themeToggleLightLabel;

    EL.themeToggleButton.textContent = nextLabel;
    EL.themeToggleButton.setAttribute("aria-label", `Switch to ${nextLabel.toLowerCase()}`);
  }

  function toggleTheme() {
    const nextTheme = STATE.theme === "dark" ? "light" : "dark";

    if (typeof window.setTheme === "function") {
      window.setTheme(nextTheme);
      return;
    }

    try {
      localStorage.setItem(CONFIG.themeKey, nextTheme);
    } catch {
      // If local storage fails, still apply in-memory theme for this session.
    }

    applyTheme(nextTheme);
  }

  function deriveClassPath(medication) {
    const sourceClass = cleanText(medication.drugClass);
    if (!sourceClass) return [CONFIG.uncategorizedClassLabel];

    const context = normalizeSearch(
      [
        medication.name,
        medication.drugClass,
        ...medication.aliases,
        ...medication.brandExamples,
        ...medication.indications,
      ].join(" ")
    );

    const rulePath = findClassPathFromRules(context, CLASS_HIERARCHY_RULES);
    if (rulePath.length === 0) {
      return [sourceClass];
    }

    const alreadyIncludesSource = rulePath.some((label) => normalizeSearch(label) === normalizeSearch(sourceClass));
    if (!alreadyIncludesSource) {
      rulePath.push(sourceClass);
    }

    return dedupeClassPath(rulePath);
  }

  function findClassPathFromRules(context, rules) {
    for (const rule of rules) {
      if (!rule.match.test(context)) continue;

      const childPath = Array.isArray(rule.children)
        ? findClassPathFromRules(context, rule.children)
        : [];
      return [rule.label, ...childPath];
    }
    return [];
  }

  function dedupeClassPath(path) {
    const deduped = [];
    path.forEach((segment) => {
      const label = cleanText(segment);
      if (!label) return;

      const prior = deduped[deduped.length - 1];
      if (prior && normalizeSearch(prior) === normalizeSearch(label)) return;
      deduped.push(label);
    });

    if (deduped.length === 0) {
      return [CONFIG.uncategorizedClassLabel];
    }

    return deduped;
  }

  function showError(message) {
    if (!EL.loadError) return;
    EL.loadError.hidden = false;
    EL.loadError.textContent = message;
  }

  function hideError() {
    if (!EL.loadError) return;
    EL.loadError.hidden = true;
    EL.loadError.textContent = "";
  }

  function toTextArray(value) {
    if (Array.isArray(value)) {
      return value.map(cleanText).filter(Boolean);
    }
    const cleaned = cleanText(value);
    return cleaned ? [cleaned] : [];
  }

  function cleanText(value) {
    return String(value || "").trim();
  }

  function normalizeRoute(route) {
    const value = cleanText(route).toUpperCase();
    if (!value) return "";
    if (value === "SC" || value === "SUBQ" || value === "SUBCUTANEOUS") return "SQ";
    if (value === "INHALATION") return "INH";
    if (value === "INTRANASAL") return "IN";
    if (value === "SUBLINGUAL") return "SL";
    if (value === "RECTAL") return "PR";
    if (value === "TOPICAL") return "Topical";
    return ROUTE_ENUM.includes(value) ? value : "";
  }

  function normalizeSearch(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u2019']/g, "")
      .toLowerCase();
  }

  function uniq(items) {
    return Array.from(new Set(items));
  }

  function debounce(fn, ms) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }
})();
