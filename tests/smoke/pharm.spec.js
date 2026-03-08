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
const THEME_TOGGLE = "#btnThemeToggle";
const THEME_STORAGE_KEY = "ui-theme";
const EXPECTED_INITIAL_COUNT = 32;
const MOBILE_WIDTH = 900;
const MOBILE_HEIGHT = 1000;

async function waitForCards(page, expectedMinimum = 1) {
  await expect.poll(async () => page.locator(RESULTS_CARDS).count()).toBeGreaterThanOrEqual(expectedMinimum);
}

test.describe("Pharm reference smoke", () => {
  test("page loads with disclaimer, cards, and no default selection", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await expect(page.locator(DISCLAIMER_BANNER)).toBeVisible();
    await waitForCards(page, EXPECTED_INITIAL_COUNT);

    await expect(page.locator(RESULTS_CARDS)).toHaveCount(EXPECTED_INITIAL_COUNT);
    await expect(page.locator(RESULT_COUNT)).toContainText(`${EXPECTED_INITIAL_COUNT} medications`);
    await expect(page.locator(DETAIL_TITLE)).toHaveText("No selection");
    await expect(page.locator(DETAIL_BODY)).toBeHidden();
  });

  test("search ranking prioritizes exact match and alphabetical fallback", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await waitForCards(page, EXPECTED_INITIAL_COUNT);

    await page.locator(SEARCH_INPUT).fill("albuterol");
    await expect(page.locator(RESULTS_CARDS)).toHaveCount(2);
    await expect(page.locator(`${RESULTS_CARDS} .med-card__title`).nth(0)).toHaveText("Albuterol");

    await page.locator(SEARCH_INPUT).fill("amoxi");
    await expect(page.locator(RESULTS_CARDS)).toHaveCount(2);
    await expect(page.locator(`${RESULTS_CARDS} .med-card__title`).nth(0)).toHaveText("Amoxicillin");
    await expect(page.locator(`${RESULTS_CARDS} .med-card__title`).nth(1)).toHaveText("Amoxicillin-Clavulanate");
  });

  test("filters combine correctly and clear resets all controls", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await waitForCards(page, EXPECTED_INITIAL_COUNT);

    await page.locator(CLASS_FILTER).selectOption("Anticoagulant (LMWH)");
    await page.locator(ROUTE_FILTER).selectOption("SQ");
    await page.locator(SEARCH_INPUT).fill("enoxaparin");

    await expect(page.locator(RESULTS_CARDS)).toHaveCount(1);
    await expect(page.locator(RESULTS_CARDS).first()).toContainText("Enoxaparin");

    await page.locator(CLEAR_FILTERS_BUTTON).click();
    await expect(page.locator(SEARCH_INPUT)).toHaveValue("");
    await expect(page.locator(CLASS_FILTER)).toHaveValue("");
    await expect(page.locator(ROUTE_FILTER)).toHaveValue("");
    await expect(page.locator(RESULTS_CARDS)).toHaveCount(EXPECTED_INITIAL_COUNT);
  });

  test("keyboard navigation supports arrow movement and enter selection", async ({ page }) => {
    await page.goto(PHARM_PATH);
    await waitForCards(page, EXPECTED_INITIAL_COUNT);

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
    await waitForCards(page, EXPECTED_INITIAL_COUNT);

    const html = page.locator("html");
    const initialTheme = (await html.getAttribute("data-theme")) || "light";

    await page.locator(THEME_TOGGLE).click();
    const toggledTheme = await html.getAttribute("data-theme");

    expect(toggledTheme).not.toBe(initialTheme);
    const storedTheme = await page.evaluate((themeKey) => localStorage.getItem(themeKey), THEME_STORAGE_KEY);
    expect(storedTheme).toBe(toggledTheme);

    await page.reload();
    await waitForCards(page, EXPECTED_INITIAL_COUNT);
    await expect(html).toHaveAttribute("data-theme", toggledTheme);
  });

  test("mobile drawer opens and closes via escape, scrim, and close button", async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT });
    await page.goto(PHARM_PATH);
    await waitForCards(page, EXPECTED_INITIAL_COUNT);

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
