const { test, expect } = require("@playwright/test");

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
const EXPECTED_INITIAL_COUNT = 32;
const MOBILE_WIDTH = 900;
const MOBILE_HEIGHT = 1000;

async function waitForCards(page, expectedMinimum = 1) {
  await expect.poll(async () => page.locator(RESULTS_CARDS).count()).toBeGreaterThanOrEqual(expectedMinimum);
}

test.describe("Pharm reference smoke", () => {
  test("page loads, disclaimer shows, and initial medication cards render", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await expect(page.locator(DISCLAIMER_BANNER)).toBeVisible();
    await waitForCards(page, EXPECTED_INITIAL_COUNT);
    await expect(page.locator(RESULTS_CARDS)).toHaveCount(EXPECTED_INITIAL_COUNT);
    await expect(page.locator(RESULT_COUNT)).toContainText(`${EXPECTED_INITIAL_COUNT} medications`);
  });

  test("search narrows results and class filter can be cleared", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await waitForCards(page, EXPECTED_INITIAL_COUNT);

    await page.locator(SEARCH_INPUT).fill("heparin");
    await expect(page.locator(RESULTS_CARDS)).toHaveCount(1);
    await expect(page.locator(RESULTS_CARDS).first()).toContainText("Heparin");

    await page.locator(SEARCH_INPUT).fill("");
    await page.locator(CLASS_FILTER).selectOption("NSAID");
    await expect(page.locator(RESULTS_CARDS)).toHaveCount(2);
    await expect(page.locator(RESULTS_CARDS).first()).toContainText(/Ibuprofen|Ketorolac/);

    await page.locator(CLEAR_FILTERS_BUTTON).click();
    await expect(page.locator(SEARCH_INPUT)).toHaveValue("");
    await expect(page.locator(CLASS_FILTER)).toHaveValue("");
    await expect(page.locator(ROUTE_FILTER)).toHaveValue("");
    await expect(page.locator(RESULTS_CARDS)).toHaveCount(EXPECTED_INITIAL_COUNT);
  });

  test("route filter combines with search and class filter", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await waitForCards(page, EXPECTED_INITIAL_COUNT);

    await page.locator(CLASS_FILTER).selectOption("Anticoagulant (LMWH)");
    await page.locator(ROUTE_FILTER).selectOption("SQ");
    await page.locator(SEARCH_INPUT).fill("enoxaparin");

    await expect(page.locator(RESULTS_CARDS)).toHaveCount(1);
    await expect(page.locator(RESULTS_CARDS).first()).toContainText("Enoxaparin");
  });

  test("clicking a card opens detail panel sections in expected structure", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await waitForCards(page, EXPECTED_INITIAL_COUNT);

    await page.locator(SEARCH_INPUT).fill("naloxone");
    await expect(page.locator(RESULTS_CARDS)).toHaveCount(1);
    await expect(page.locator(RESULTS_CARDS).first()).toContainText("Naloxone");
    await page.locator(RESULTS_CARDS).first().click();

    await expect(page.locator(DETAIL_TITLE)).toHaveText("Naloxone");
    await expect(page.locator(`${DETAIL_BODY} [data-section="class"]`)).toContainText("Class");
    await expect(page.locator(`${DETAIL_BODY} [data-section="routes"]`)).toContainText("Routes");
    await expect(page.locator(`${DETAIL_BODY} [data-section="moa"]`)).toContainText("MOA");
    await expect(page.locator(`${DETAIL_BODY} [data-section="indications"]`)).toContainText("Indications");
    await expect(page.locator(`${DETAIL_BODY} [data-section="contraindications"]`)).toContainText("Contraindications");
    await expect(page.locator(`${DETAIL_BODY} [data-section="adverse-effects"]`)).toContainText("Adverse Effects");
    await expect(page.locator(`${DETAIL_BODY} [data-section="major-interactions"]`)).toContainText("Major Interactions");
    await expect(page.locator(`${DETAIL_BODY} [data-section="monitoring"]`)).toContainText("Monitoring");
    await expect(page.locator(`${DETAIL_BODY} [data-section="pearls"]`)).toContainText("Pearls");
  });

  test("mobile drawer opens and closes via scrim and close button", async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT });
    await page.goto(PHARM_PATH);
    await waitForCards(page, EXPECTED_INITIAL_COUNT);

    await page.locator(RESULTS_CARDS).first().click();
    await expect(page.locator(DETAIL_PANEL)).toHaveClass(/open/);
    await expect(page.locator(DETAIL_SCRIM)).toBeVisible();

    await page.locator(DETAIL_SCRIM).click();
    await expect(page.locator(DETAIL_PANEL)).not.toHaveClass(/open/);

    await page.locator(RESULTS_CARDS).first().click();
    await expect(page.locator(DETAIL_PANEL)).toHaveClass(/open/);
    await page.locator(DETAIL_CLOSE_BUTTON).click();
    await expect(page.locator(DETAIL_PANEL)).not.toHaveClass(/open/);
  });
});
