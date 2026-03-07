const path = require("path");
const { test, expect } = require("@playwright/test");

// ================================================================
// Configurable values (change here)
// ================================================================
const USPSTF_PATH = "/Maintenance/USPSTF.html";
const FIXTURE_PATH = path.resolve("tests/fixtures/uspstf_fixture.json");
const CUSTOM_API_URL = "https://example.com/uspstf.json";
const TOOLS_NOTICE_SUBSTRING = "Tools filter partially applied";

async function loadFixture(page) {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator("#btnLoadJSON").click();
  const chooser = await chooserPromise;
  await chooser.setFiles(FIXTURE_PATH);
  await expect(page.locator("#status")).toContainText("Loaded JSON file");
}

test.describe("USPSTF smoke", () => {
  test("parse handles negation phrases for pregnancy and sexual activity", async ({ page }) => {
    await page.goto(USPSTF_PATH);

    await page.locator("#paste").fill("34 y/o female not sexually active and not pregnant");
    await page.locator("#btnParse").click();

    await expect(page.locator("#pregnant")).toHaveValue("N");
    await expect(page.locator("#sexuallyActive")).toHaveValue("N");
  });

  test("loading fixture renders cards and enables copy", async ({ page }) => {
    await page.goto(USPSTF_PATH);
    await loadFixture(page);

    await expect(page.locator("#results .card")).toHaveCount(4);
    await expect(page.locator("#btnCopy")).toBeEnabled();
  });

  test("tools-only filter hides explicit non-tools and keeps unknown metadata with notice", async ({ page }) => {
    await page.goto(USPSTF_PATH);
    await loadFixture(page);

    await page.locator("#toolsOnly").check();
    await expect(page.locator("#status")).toContainText(TOOLS_NOTICE_SUBSTRING);
    await expect(page.locator("#results .card h4")).toContainText(["CRC Risk Calculator"]);
    await expect(page.locator("#results .card h4", { hasText: "Blood Pressure Screening" })).toHaveCount(0);
    await expect(page.locator("#results .card h4", { hasText: "Record Missing Tool Metadata" })).toHaveCount(1);
  });

  test("settings URL persists and clears cache on change", async ({ page }) => {
    await page.goto(USPSTF_PATH);
    await loadFixture(page);
    await expect(page.locator("#results .card")).toHaveCount(4);

    await page.locator("#btnSettings").click();
    await page.locator("#apiUrl").fill(CUSTOM_API_URL);
    await page.locator("#btnSaveSettings").click();

    await expect(page.locator("#status")).toContainText("Settings saved. API URL changed, cache cleared.");
    await expect(page.locator("#results .card")).toHaveCount(0);
    await expect(page.locator("#btnCopy")).toBeDisabled();

    await page.reload();
    await page.locator("#btnSettings").click();
    await expect(page.locator("#apiUrl")).toHaveValue(CUSTOM_API_URL);
  });

  test("auto theme mode persists and tracks system preference changes", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(USPSTF_PATH);

    await page.locator("#themeSelect").selectOption("theme-auto");
    await expect(page.locator("body")).toHaveAttribute("data-theme-resolved", "theme-dark");

    await page.emulateMedia({ colorScheme: "light" });
    await expect
      .poll(async () => page.locator("body").getAttribute("data-theme-resolved"))
      .toBe("theme-light");

    await page.reload();
    await expect(page.locator("#themeSelect")).toHaveValue("theme-auto");
  });
});
