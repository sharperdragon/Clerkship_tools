const { test, expect } = require("@playwright/test");

// ================================================================
// Configurable values (change here)
// ================================================================
const DIFFERENTIALS_PATH = "/differentials/differentials_index.html";
const DRAWER = "#drawer";
const DRAWER_OPEN_BUTTON = "#btnOpenFilters";
const DRAWER_APPLY_BUTTON = "#btnApplyFilters";
const DRAWER_CLEAR_BUTTON = "#btnClearFilters";
const SYSTEM_CHIPS = "#systemChips .chip";
const RESULT_CARDS = "#results .card";
const COMING_SOON_BADGES = "#results .badge--coming";
const DETAIL_TABLE_FREQUENCY_HEADER = "#detailBody .soft-table th";

async function waitForInitialCards(page) {
  await expect.poll(async () => page.locator(RESULT_CARDS).count()).toBeGreaterThan(0);
}

test.describe("Differentials smoke", () => {
  test("grid-only UI and forced options are applied", async ({ page }) => {
    await page.goto(DIFFERENTIALS_PATH);
    await waitForInitialCards(page);

    await expect(page.locator("#btnGrid")).toHaveCount(0);
    await expect(page.locator("#btnList")).toHaveCount(0);
    await expect(page.locator(".controls-row2")).toHaveCount(0);

    await expect(page.locator("#toggleFreq")).toHaveCount(0);
    await expect(page.locator("#toggleCompact")).toHaveCount(0);
    await expect(page.locator("#toggleHideUnfinished")).toHaveCount(0);

    await expect(page.locator("body")).toHaveClass(/compact/);
    await expect(page.locator("#results")).toHaveClass(/grid/);
    await expect(page.locator(COMING_SOON_BADGES)).toHaveCount(0);
  });

  test("drawer chips filter results and clear resets section/system filters", async ({ page }) => {
    await page.goto(DIFFERENTIALS_PATH);
    await waitForInitialCards(page);

    const cards = page.locator(RESULT_CARDS);
    const initialCount = await cards.count();

    await page.locator(DRAWER_OPEN_BUTTON).click();
    await expect(page.locator(DRAWER)).toHaveAttribute("aria-hidden", "false");
    await expect.poll(async () => page.locator(SYSTEM_CHIPS).count()).toBeGreaterThan(0);

    const firstChip = page.locator(SYSTEM_CHIPS).first();
    await firstChip.click();
    await expect(firstChip).toHaveClass(/chip--on/);

    await page.locator(DRAWER_APPLY_BUTTON).click();
    await expect(page.locator(DRAWER)).toHaveAttribute("aria-hidden", "true");

    await expect.poll(async () => page.locator(RESULT_CARDS).count()).toBeGreaterThan(0);
    const filteredCount = await cards.count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);

    await cards.first().click();
    await expect(page.locator(DETAIL_TABLE_FREQUENCY_HEADER, { hasText: "Frequency" })).toHaveCount(1);

    await page.locator(DRAWER_OPEN_BUTTON).click();
    await page.locator(DRAWER_CLEAR_BUTTON).click();
    await expect(page.locator("#systemChips .chip--on")).toHaveCount(0);
    await page.locator(DRAWER_APPLY_BUTTON).click();

    await expect(page.locator("#btnGrid")).toHaveCount(0);
    await expect(page.locator("#btnList")).toHaveCount(0);
    await expect(page.locator(COMING_SOON_BADGES)).toHaveCount(0);
    await expect(page.locator("body")).toHaveClass(/compact/);
  });
});
