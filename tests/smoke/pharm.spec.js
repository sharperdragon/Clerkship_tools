const { test, expect } = require("@playwright/test");
const path = require("path");
const pharmData = require(path.resolve(__dirname, "../../pharm/pharm_data.json"));

// ================================================================
// Configurable values (change here)
// ================================================================
const PHARM_PATH = "/pharm/pharm_index.html";
const DISCLAIMER_BANNER = "#disclaimerBanner";
const RESULTS_CARDS = "#results .med-card";
const SEARCH_INPUT = "#searchInput";
const CLASS_FILTER = "#classFilter";
const ROUTE_FILTER = "#routeFilter";
const CLEAR_FILTERS_BUTTON = "#btnClearFilters";
const RESULT_COUNT = "#resultCount";
const DETAIL_PANEL = "#detailPanel";
const DETAIL_TITLE = "#detailTitle";
const DETAIL_BODY = "#detailBody";
const DETAIL_SCRIM = "#detailScrim";
const DETAIL_CLOSE_BUTTON = "#btnCloseDetail";
const THEME_TOGGLE = "#btnThemeToggle";
const THEME_STORAGE_KEY = "ui-theme";
const VIEW_MODE_KEY = "pharm-view-mode";
const VIEW_MODE_CONTROL = "#viewModeControl";
const RESULTS_GRID = "#results";
const FOOTER_DISCLAIMER = "footer #disclaimerBanner";
const CLASS_BLOCKS = "#results .class-block";
const CLASS_TOGGLES = "#results .class-toggle";
const SUBCLASS_CHIPS = "#results .subclass-chip";
const SUBCLASS_HEADINGS = "#results .subclass-heading";
const TREE_BRANCHES = "#results .tree-branch";
const RXNORM_PROXY_ROUTE = "**/api/rxnorm/**";
const RXNORM_SECTION = '#detailBody [data-section="rxnorm"]';
const RXNORM_LOADING = `${RXNORM_SECTION} [data-rxnorm-state="loading"]`;
const RXNORM_EMPTY = `${RXNORM_SECTION} [data-rxnorm-state="empty"]`;
const RXNORM_ERROR = `${RXNORM_SECTION} [data-rxnorm-state="error"]`;
const RXNORM_RXCUI_FIELD = `${RXNORM_SECTION} [data-rxnorm-field="rxcui"]`;
const RXNORM_CANONICAL_NAME_FIELD = `${RXNORM_SECTION} [data-rxnorm-field="canonical-name"]`;
const RXNORM_INGREDIENTS_FIELD = `${RXNORM_SECTION} [data-rxnorm-field="ingredients"]`;
const RXNORM_CLASSES_FIELD = `${RXNORM_SECTION} [data-rxnorm-field="classes"]`;
const VIEW_MODE_COMPACT = `${VIEW_MODE_CONTROL} [data-view-mode="compact"]`;
const VIEW_MODE_STRUCTURED = `${VIEW_MODE_CONTROL} [data-view-mode="structured"]`;
const VIEW_MODE_TREE = `${VIEW_MODE_CONTROL} [data-view-mode="tree"]`;
const EXPECTED_TOTAL_MEDICATIONS = pharmData.medications.length;
const MOBILE_WIDTH = 900;
const MOBILE_HEIGHT = 1000;
const RXNORM_TEST_RXCUI = "435";

async function mockRxNormSuccess(page, { lookupName = "albuterol", responseDelayMs = 0 } = {}) {
  const requestCounts = { byName: 0, related: 0, properties: 0, classes: 0 };

  await page.route(RXNORM_PROXY_ROUTE, async (route) => {
    const url = new URL(route.request().url());
    const queryName = (url.searchParams.get("name") || "").toLowerCase();
    const path = url.pathname;

    if (responseDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, responseDelayMs));
    }

    if (path.endsWith("/rxcui/by-name")) {
      requestCounts.byName += 1;
      const rxnormId = queryName === lookupName.toLowerCase() ? [RXNORM_TEST_RXCUI] : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ idGroup: { name: queryName, rxnormId } }),
      });
      return;
    }

    if (path.endsWith(`/rxcui/${RXNORM_TEST_RXCUI}/related`)) {
      requestCounts.related += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          allRelatedGroup: {
            conceptGroup: [
              { tty: "IN", conceptProperties: [{ name: "Albuterol" }] },
              { tty: "DF", conceptProperties: [{ name: "Metered Dose Inhaler" }] },
            ],
          },
        }),
      });
      return;
    }

    if (path.endsWith(`/rxcui/${RXNORM_TEST_RXCUI}/properties`)) {
      requestCounts.properties += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ properties: { rxcui: RXNORM_TEST_RXCUI, name: "Albuterol" } }),
      });
      return;
    }

    if (path.endsWith(`/rxcui/${RXNORM_TEST_RXCUI}/classes`)) {
      requestCounts.classes += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rxclassDrugInfoList: {
            rxclassDrugInfo: [
              {
                rxclassMinConceptItem: { className: "Adrenergic beta-Agonists" },
                relaSource: "ATC",
                rela: "has_MoA",
              },
            ],
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unexpected mocked endpoint" }),
    });
  });

  return requestCounts;
}

async function mockRxNormNoMatch(page) {
  await page.route(RXNORM_PROXY_ROUTE, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith("/rxcui/by-name")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ idGroup: { rxnormId: [] } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

async function mockRxNormError(page) {
  await page.route(RXNORM_PROXY_ROUTE, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Proxy failure" }),
    });
  });
}

async function waitForCards(page, expectedMinimum = 1) {
  await expect.poll(async () => page.locator(RESULTS_CARDS).count()).toBeGreaterThanOrEqual(expectedMinimum);
}

test.describe("Pharm reference smoke", () => {
  test("page loads with compact mode default, disclaimer, cards, and no default selection", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await expect(page.locator(DISCLAIMER_BANNER)).toBeVisible();
    await expect(page.locator(FOOTER_DISCLAIMER)).toBeVisible();
    await waitForCards(page);

    await expect(page.locator(RESULTS_GRID)).toHaveAttribute("data-view-mode", "compact");
    await expect(page.locator(VIEW_MODE_COMPACT)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(CLASS_BLOCKS).first()).toBeVisible();
    await expect(page.locator(RESULTS_CARDS).first()).toBeVisible();
    await expect(page.locator(RESULT_COUNT)).toContainText(`${EXPECTED_TOTAL_MEDICATIONS} medications`);
    await expect(page.locator(DETAIL_TITLE)).toHaveText("No selection");
    await expect(page.locator(DETAIL_BODY)).toBeHidden();
  });

  test("search ranking prioritizes exact match and alphabetical fallback", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await waitForCards(page);
    await page.locator(VIEW_MODE_STRUCTURED).click();
    await expect(page.locator(RESULTS_GRID)).toHaveAttribute("data-view-mode", "structured");

    await page.locator(SEARCH_INPUT).fill("albuterol");
    await expect(page.locator(RESULTS_CARDS)).toHaveCount(2);
    await expect(page.locator(`${RESULTS_CARDS} .med-card__title`).nth(0)).toHaveText("Albuterol");

    await page.locator(SEARCH_INPUT).fill("amoxi");
    await expect(page.locator(RESULTS_CARDS)).toHaveCount(2);
    await expect(page.locator(`${RESULTS_CARDS} .med-card__title`).nth(0)).toHaveText("Amoxicillin");
    await expect(page.locator(`${RESULTS_CARDS} .med-card__title`).nth(1)).toHaveText("Amoxicillin-Clavulanate");
  });

  test("compact mode keeps grouped display without deep nested containers", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await waitForCards(page);

    await page.locator(SEARCH_INPUT).fill("amoxi");
    await expect(page.locator(RESULTS_CARDS)).toHaveCount(1);
    const compactTitle = await page.locator(`${RESULTS_CARDS} .med-card__title`).first().innerText();
    expect(["Amoxicillin", "Amoxicillin-Clavulanate"]).toContain(compactTitle);
    await expect(page.locator(RESULTS_GRID)).toHaveAttribute("data-view-mode", "compact");
    await expect(page.locator(SUBCLASS_CHIPS).first()).toBeVisible();
    await expect(page.locator(CLASS_TOGGLES)).toHaveCount(0);
    await expect(page.locator(TREE_BRANCHES)).toHaveCount(0);
  });

  test("structured mode shows accordion classes and subclass headings", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await waitForCards(page);

    await page.locator(VIEW_MODE_STRUCTURED).click();
    await expect(page.locator(RESULTS_GRID)).toHaveAttribute("data-view-mode", "structured");
    await expect(page.locator(CLASS_TOGGLES).first()).toBeVisible();
    await expect(page.locator(CLASS_TOGGLES).first()).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(SUBCLASS_HEADINGS).first()).toBeVisible();
  });

  test("tree mode renders full hierarchy branches", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await waitForCards(page);

    await page.locator(VIEW_MODE_TREE).click();
    await page.locator(SEARCH_INPUT).fill("amoxi");

    await expect(page.locator(RESULTS_GRID)).toHaveAttribute("data-view-mode", "tree");
    await expect(page.locator(CLASS_TOGGLES).first()).toBeVisible();
    await expect(page.locator(TREE_BRANCHES).first()).toBeVisible();
  });

  test("view mode persists across reload", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await waitForCards(page);

    await page.locator(VIEW_MODE_STRUCTURED).click();
    await expect(page.locator(RESULTS_GRID)).toHaveAttribute("data-view-mode", "structured");

    const storedMode = await page.evaluate((storageKey) => localStorage.getItem(storageKey), VIEW_MODE_KEY);
    expect(storedMode).toBe("structured");

    await page.reload();
    await waitForCards(page);
    await expect(page.locator(RESULTS_GRID)).toHaveAttribute("data-view-mode", "structured");
    await expect(page.locator(VIEW_MODE_STRUCTURED)).toHaveAttribute("aria-pressed", "true");
  });

  test("filters combine correctly and clear resets all controls", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await waitForCards(page);

    const initialVisibleCardCount = await page.locator(RESULTS_CARDS).count();

    await page.locator(CLASS_FILTER).selectOption("Anticoagulant (LMWH)");
    await page.locator(ROUTE_FILTER).selectOption("SQ");
    await page.locator(SEARCH_INPUT).fill("enoxaparin");

    await expect(page.locator(RESULTS_CARDS)).toHaveCount(1);
    await expect(page.locator(RESULTS_CARDS).first()).toContainText("Enoxaparin");

    await page.locator(CLEAR_FILTERS_BUTTON).click();
    await expect(page.locator(SEARCH_INPUT)).toHaveValue("");
    await expect(page.locator(CLASS_FILTER)).toHaveValue("");
    await expect(page.locator(ROUTE_FILTER)).toHaveValue("");
    await expect(page.locator(RESULTS_CARDS)).toHaveCount(initialVisibleCardCount);
  });

  test("keyboard navigation supports arrow movement and enter selection", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await waitForCards(page);

    const cards = page.locator(RESULTS_CARDS);
    const secondCardTitle = await cards.nth(1).locator(".med-card__title").innerText();

    await cards.first().focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");

    await expect(page.locator(DETAIL_TITLE)).toHaveText(secondCardTitle);
    await expect(cards.nth(1)).toHaveClass(/is-selected/);
  });

  test("theme toggle updates and persists selected mode", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await waitForCards(page);

    const html = page.locator("html");
    const initialTheme = (await html.getAttribute("data-theme")) || "light";

    await page.locator(THEME_TOGGLE).click();
    const toggledTheme = await html.getAttribute("data-theme");

    expect(toggledTheme).not.toBe(initialTheme);
    const storedTheme = await page.evaluate((themeKey) => localStorage.getItem(themeKey), THEME_STORAGE_KEY);
    expect(storedTheme).toBe(toggledTheme);

    await page.reload();
    await waitForCards(page);
    await expect(html).toHaveAttribute("data-theme", toggledTheme);
  });

  test("auto-loads RxNorm facts when selecting a medication", async ({ page }) => {
    await mockRxNormSuccess(page, { responseDelayMs: 250 });
    await page.goto(PHARM_PATH);
    await waitForCards(page);

    await page.locator(SEARCH_INPUT).fill("albuterol");
    await page.getByRole("button", { name: "Short-acting beta-2 agonist", exact: true }).click();
    const albuterolCard = page.getByRole("button", { name: /^Albuterol details$/ });
    await expect(albuterolCard).toBeVisible();
    await albuterolCard.click();

    await expect(page.locator(RXNORM_LOADING)).toBeVisible();
    await expect(page.locator(RXNORM_RXCUI_FIELD)).toContainText(RXNORM_TEST_RXCUI);
    await expect(page.locator(RXNORM_CANONICAL_NAME_FIELD)).toContainText("Albuterol");
    await expect(page.locator(RXNORM_INGREDIENTS_FIELD)).toContainText("Albuterol");
    await expect(page.locator(RXNORM_CLASSES_FIELD)).toContainText("Adrenergic beta-Agonists");
  });

  test("reuses cached RxNorm data and avoids duplicate fetches", async ({ page }) => {
    const requestCounts = await mockRxNormSuccess(page);
    await page.goto(PHARM_PATH);
    await waitForCards(page);

    await page.locator(SEARCH_INPUT).fill("albuterol");
    await page.getByRole("button", { name: "Short-acting beta-2 agonist", exact: true }).click();
    const albuterolCard = page.getByRole("button", { name: /^Albuterol details$/ });
    await expect(albuterolCard).toBeVisible();

    await albuterolCard.click();
    await expect(page.locator(RXNORM_RXCUI_FIELD)).toContainText(RXNORM_TEST_RXCUI);

    await albuterolCard.click();
    await expect.poll(() => requestCounts.byName).toBe(1);
    await expect.poll(() => requestCounts.related).toBe(1);
    await expect.poll(() => requestCounts.properties).toBe(1);
    await expect.poll(() => requestCounts.classes).toBe(1);
  });

  test("shows no-match state when RxNorm has no concept for a medication", async ({ page }) => {
    await mockRxNormNoMatch(page);
    await page.goto(PHARM_PATH);
    await waitForCards(page);

    await page.locator(SEARCH_INPUT).fill("albuterol");
    await expect(page.locator(RESULT_COUNT)).toContainText("2 medications");
    await page.locator(RESULTS_CARDS).first().click();

    await expect(page.locator(RXNORM_EMPTY)).toBeVisible();
    await expect(page.locator(RXNORM_EMPTY)).toContainText("No RxNorm match found.");
  });

  test("shows RxNorm unavailable state when proxy returns errors", async ({ page }) => {
    await mockRxNormError(page);
    await page.goto(PHARM_PATH);
    await waitForCards(page);

    await page.locator(SEARCH_INPUT).fill("albuterol");
    await expect(page.locator(RESULT_COUNT)).toContainText("2 medications");
    await page.locator(RESULTS_CARDS).first().click();

    await expect(page.locator(RXNORM_ERROR)).toBeVisible();
    await expect(page.locator(RXNORM_ERROR)).toContainText("RxNorm unavailable right now.");
  });

  test("mobile drawer opens and closes via escape, scrim, and close button", async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT });
    await page.goto(PHARM_PATH);
    await waitForCards(page);

    await page.locator(RESULTS_CARDS).first().click();
    await expect(page.locator(DETAIL_PANEL)).toHaveClass(/open/);
    await expect(page.locator(DETAIL_SCRIM)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(DETAIL_PANEL)).not.toHaveClass(/open/);

    await page.locator(RESULTS_CARDS).first().click();
    await expect(page.locator(DETAIL_PANEL)).toHaveClass(/open/);
    await page.locator(DETAIL_SCRIM).click();
    await expect(page.locator(DETAIL_PANEL)).not.toHaveClass(/open/);

    await page.locator(RESULTS_CARDS).first().click();
    await expect(page.locator(DETAIL_PANEL)).toHaveClass(/open/);
    await page.locator(DETAIL_CLOSE_BUTTON).click();
    await expect(page.locator(DETAIL_PANEL)).not.toHaveClass(/open/);
  });
});
