import { expect, type Locator, type Page } from '@playwright/test';

export class AnilistPage {
  constructor(public readonly page: Page) {}

  async goto(anilistId = 21): Promise<void> {
    await this.page.goto(`https://anilist.co/anime/${anilistId}`, { waitUntil: 'networkidle' });
  }

  get advancedButton(): Locator {
    return this.page.getByRole('button', { name: 'Advanced options' });
  }

  quickAddButton(): Locator {
    return this.advancedButton.locator('xpath=preceding-sibling::button[1]');
  }

  async waitForQuickAddReady(): Promise<void> {
    const timeout = 20_000;
    const pollInterval = 300;
    const end = Date.now() + timeout;

    // Ensure anchor is visible first
    await this.advancedButton.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});

    while (Date.now() < end) {
      const text = (await this.quickAddButton().textContent())?.trim() ?? '';
      if (/Add to Sonarr|In Sonarr/.test(text)) return;
      // If we see a transient "Error" or other state, wait a bit and retry
      await this.page.waitForTimeout(pollInterval);
    }

    // Timeout diagnostics
    const finalText = (await this.quickAddButton().textContent())?.trim() ?? '<missing>';
    try {
      await this.page.screenshot({ path: 'test-results/quick-add-ready-failed.png' });
    } catch {
      // ignore screenshot failures
    }
    throw new Error(`quick add button did not become ready within ${timeout}ms (final text: "${finalText}")`);
  }

  async openAdvancedModal(): Promise<Locator> {
    const button = this.advancedButton;
    await button.waitFor({ state: 'visible' });
    await button.click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async clickAddSeries(dialog: Locator): Promise<void> {
    const addButton = dialog.getByRole('button', { name: 'Add Series' });
    await expect(addButton).toBeVisible();
    await addButton.click();
  }

  async waitForModalHidden(dialog: Locator): Promise<void> {
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  }

  async waitForQuickAddState(expected: RegExp | string, timeout = 15_000): Promise<void> {
    await expect(this.quickAddButton()).toHaveText(expected, { timeout });
  }

  async screenshot(): Promise<Buffer> {
    return this.page.screenshot({ fullPage: false });
  }
}
