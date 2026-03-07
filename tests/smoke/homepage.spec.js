const { test, expect } = require("@playwright/test");

// ================================================================
// Configurable values (change here)
// ================================================================
const HOME_PATH = "/index.html";
const SETTINGS_BUTTON = "#settings-button";
const SETTINGS_PANEL = "#settings-panel";
const SETTINGS_CLOSE_BUTTON = "#close-settings";
const THEME_DARK_RADIO = 'input[name="theme"][value="dark"]';

test.describe("Homepage smoke", () => {
  test("settings panel opens and closes via overlay and Escape", async ({ page }) => {
    await page.goto(HOME_PATH);

    const settingsButton = page.locator(SETTINGS_BUTTON);
    const settingsPanel = page.locator(SETTINGS_PANEL);
    const closeButton = page.locator(SETTINGS_CLOSE_BUTTON);

    await expect(settingsButton).toHaveAttribute("aria-expanded", "false");
    await expect(settingsPanel).toHaveAttribute("aria-hidden", "true");

    await settingsButton.click();
    await expect(settingsButton).toHaveAttribute("aria-expanded", "true");
    await expect(settingsPanel).toHaveClass(/open/);
    await expect(settingsPanel).toHaveAttribute("aria-hidden", "false");

    await closeButton.click();
    await expect(settingsButton).toHaveAttribute("aria-expanded", "false");
    await expect(settingsPanel).not.toHaveClass(/open/);

    await settingsButton.click();
    await settingsPanel.click({ position: { x: 12, y: 12 } });
    await expect(settingsPanel).not.toHaveClass(/open/);

    await settingsButton.click();
    await page.keyboard.press("Escape");
    await expect(settingsPanel).not.toHaveClass(/open/);
    await expect(settingsButton).toBeFocused();
  });

  test("theme selection persists across reload", async ({ page }) => {
    await page.goto(HOME_PATH);

    await page.locator(SETTINGS_BUTTON).click();
    await page.locator(THEME_DARK_RADIO).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(THEME_DARK_RADIO)).toBeChecked();
  });
});
