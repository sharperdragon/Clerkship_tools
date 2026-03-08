(function () {
  // ================================================================
  // Configurable values (change here)
  // ================================================================
  const CONFIG = {
    dataPath: "./pharm_data.json",
    searchDebounceMs: 170,
    mobileBreakpointPx: 1080,
    emptyStateCopy: "No medications match the current filters.",
    themeKey: "ui-theme",
  };

  const SELECTORS = {
    searchInput: "#searchInput",
    classFilter: "#classFilter",
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
  };

  const ROUTE_ENUM = ["PO", "IV", "IM", "SQ", "INH", "IN", "SL", "Topical", "PR"];

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
    selectedId: null,
    query: "",
    classFilter: "",
    routeFilter: "",
  };

  const EL = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    applyThemeFromStorage();
    bindEvents();
    loadData();
  }

  function cacheElements() {
    Object.entries(SELECTORS).forEach(([key, selector]) => {
      EL[key] = document.querySelector(selector);
    });
  }

  function bindEvents() {
    if (!EL.searchInput || !EL.classFilter || !EL.routeFilter || !EL.resultsGrid) return;

    EL.searchInput.addEventListener(
      "input",
      debounce(() => {
        STATE.query = EL.searchInput.value.trim();
        applyFiltersAndRender();
      }, CONFIG.searchDebounceMs)
    );

    EL.classFilter.addEventListener("change", () => {
      STATE.classFilter = EL.classFilter.value;
      applyFiltersAndRender();
    });

    EL.routeFilter.addEventListener("change", () => {
      STATE.routeFilter = EL.routeFilter.value;
      applyFiltersAndRender();
    });

    EL.clearFiltersButton.addEventListener("click", () => {
      EL.searchInput.value = "";
      EL.classFilter.value = "";
      EL.routeFilter.value = "";
      STATE.query = "";
      STATE.classFilter = "";
      STATE.routeFilter = "";
      applyFiltersAndRender();
    });

    EL.resultsGrid.addEventListener("click", (event) => {
      const card = event.target.closest(".med-card");
      if (!card) return;
      selectMedication(card.dataset.id, true);
    });

    EL.detailCloseButton.addEventListener("click", closeMobileDetailPanel);
    EL.detailScrim.addEventListener("click", closeMobileDetailPanel);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && EL.detailPanel.classList.contains("open")) {
        closeMobileDetailPanel();
      }
    });

    window.addEventListener("resize", () => {
      if (!isMobileViewport()) {
        closeMobileDetailPanel();
      }
    });
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

    normalized.searchBlob = normalizeSearch(
      [
        normalized.name,
        normalized.drugClass,
        normalized.moa,
        ...normalized.routes,
        ...normalized.aliases,
        ...normalized.brandExamples,
        ...normalized.indications,
        ...normalized.contraindications,
        ...normalized.adverseEffects,
        ...normalized.majorInteractions,
        ...normalized.monitoring,
      ].join(" ")
    );

    return normalized;
  }

  function applyFiltersAndRender() {
    const q = normalizeSearch(STATE.query);
    const classFilter = STATE.classFilter;
    const routeFilter = STATE.routeFilter;

    STATE.filtered = STATE.medications.filter((medication) => {
      if (classFilter && medication.drugClass !== classFilter) return false;
      if (routeFilter && !medication.routes.includes(routeFilter)) return false;
      if (q && !medication.searchBlob.includes(q)) return false;
      return true;
    });

    if (!STATE.filtered.some((medication) => medication.id === STATE.selectedId)) {
      STATE.selectedId = null;
      closeMobileDetailPanel();
    }

    renderResultCount();
    renderCards();
    renderDetail();
  }

  function populateClassFilter() {
    const classes = uniq(STATE.medications.map((medication) => medication.drugClass)).sort((a, b) =>
      a.localeCompare(b)
    );
    setSelectOptions(EL.classFilter, [{ value: "", label: "All classes" }, ...classes.map((item) => ({ value: item, label: item }))]);
  }

  function populateRouteFilter() {
    const presentRoutes = new Set(
      STATE.medications.flatMap((medication) => medication.routes)
    );
    const routes = ROUTE_ENUM.filter((route) => presentRoutes.has(route));
    setSelectOptions(EL.routeFilter, [{ value: "", label: "All routes" }, ...routes.map((route) => ({ value: route, label: route }))]);
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

    if (STATE.filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "results-empty";
      empty.textContent = CONFIG.emptyStateCopy;
      EL.resultsGrid.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    STATE.filtered.forEach((medication) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `med-card${STATE.selectedId === medication.id ? " is-selected" : ""}`;
      card.dataset.id = medication.id;
      card.setAttribute("aria-label", `${medication.name} details`);

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
      snippet.textContent = medication.indications.slice(0, 2).join(" • ");

      card.appendChild(title);
      card.appendChild(classText);
      card.appendChild(routeRow);
      card.appendChild(snippet);
      fragment.appendChild(card);
    });

    EL.resultsGrid.appendChild(fragment);
  }

  function selectMedication(id, openOnMobile) {
    STATE.selectedId = id;
    renderCards();
    renderDetail();

    if (openOnMobile && isMobileViewport()) {
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
      EL.detailTitle.textContent = "No selection";
      EL.detailMeta.hidden = true;
      EL.detailBody.hidden = true;
      EL.detailEmpty.hidden = false;
      return;
    }

    EL.detailTitle.textContent = selected.name;
    EL.detailMeta.hidden = false;
    EL.detailMeta.textContent = `${selected.drugClass} • ${selected.routes.join(", ")}`;
    EL.detailEmpty.hidden = true;
    EL.detailBody.hidden = false;

    const sections = [
      makeTextSection("Class", selected.drugClass, "class"),
      makeTextSection("Routes", selected.routes.join(", "), "routes"),
      makeTextSection("MOA", selected.moa, "moa"),
      makeListSection("Indications", selected.indications, "indications"),
      makeListSection("Contraindications", selected.contraindications, "contraindications"),
      makeListSection("Adverse Effects", selected.adverseEffects, "adverse-effects"),
      makeListSection("Major Interactions", selected.majorInteractions, "major-interactions"),
      makeListSection("Monitoring", selected.monitoring, "monitoring"),
      makeListSection("Pearls", selected.pearls, "pearls"),
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

  function closeMobileDetailPanel() {
    if (!EL.detailPanel || !EL.detailScrim) return;
    EL.detailPanel.classList.remove("open");
    EL.detailScrim.hidden = true;
    document.body.classList.remove("detail-open");
  }

  function isMobileViewport() {
    return window.matchMedia(`(max-width: ${CONFIG.mobileBreakpointPx}px)`).matches;
  }

  function applyThemeFromStorage() {
    try {
      const saved = localStorage.getItem(CONFIG.themeKey);
      const mode = saved === "dark" || saved === "light" ? saved : "light";
      document.documentElement.setAttribute("data-theme", mode);
      document.documentElement.style.colorScheme = mode;
    } catch {
      document.documentElement.setAttribute("data-theme", "light");
      document.documentElement.style.colorScheme = "light";
    }
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
