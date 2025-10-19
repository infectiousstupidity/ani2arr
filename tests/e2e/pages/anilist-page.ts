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

  externalSonarrLink(): Locator {
    return this.page.locator('a[target="_blank"][href*="/sonarr/"]').first();
  }

  async readExternalLinkHref(): Promise<string> {
    const anchor = this.externalSonarrLink();
    await expect(anchor).toHaveAttribute('href', /.+/);
    const href = await anchor.getAttribute('href');
    if (!href) {
      throw new Error('Expected external Sonarr link to have an href attribute');
    }
    return href;
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
    const isEnabled = await button.isEnabled();
    if (!isEnabled) {
      throw new Error('Advanced options button is disabled');
    }
    await button.click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async clickAddSeries(dialog: Locator): Promise<void> {
    const addButton = this.modalAddSeriesButton(dialog);
    await expect(addButton).toBeVisible();
    await addButton.click();
  }

  async waitForAddSeriesStatus(dialog: Locator, expected: RegExp | string, timeout = 15_000): Promise<void> {
    const addButton = this.modalAddSeriesButton(dialog);
    await expect(addButton).toHaveText(expected, { timeout });
  }

  async readModalStatusText(dialog: Locator): Promise<string> {
    const addButton = this.modalAddSeriesButton(dialog);
    const text = (await addButton.textContent()) ?? '';
    return text.trim();
  }

  async selectQualityProfile(dialog: Locator, profileName: string): Promise<void> {
    const trigger = dialog.getByLabel('Quality Profile');
    await this.selectFromDropdown(trigger, profileName);
  }

  async selectRootFolder(dialog: Locator, folderPath: string): Promise<void> {
    const trigger = dialog.getByLabel('Root Folder');
    await this.selectFromDropdown(trigger, folderPath);
  }

  async selectMonitorOption(dialog: Locator, optionLabel: string): Promise<void> {
    const trigger = dialog.getByLabel('Monitor');
    await this.selectFromDropdown(trigger, optionLabel);
  }

  async selectSeriesType(dialog: Locator, optionLabel: string): Promise<void> {
    const trigger = dialog.getByLabel('Series Type');
    await this.selectFromDropdown(trigger, optionLabel);
  }

  async setSeasonFolder(dialog: Locator, enabled: boolean): Promise<void> {
    await this.setSwitchState(dialog, 'Use Season Folders', enabled);
  }

  async setSearchForMissingEpisodes(dialog: Locator, enabled: boolean): Promise<void> {
    await this.setSwitchState(dialog, 'Search on Add', enabled);
  }

  async saveDefaults(dialog: Locator): Promise<void> {
    const button = dialog.getByRole('button', { name: 'Save as Default' });
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toBeHidden({ timeout: 10_000 });
  }

  async waitForModalHidden(dialog: Locator): Promise<void> {
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  }

  async waitForQuickAddState(expected: RegExp | string, timeout = 15_000): Promise<void> {
    await expect(this.quickAddButton()).toHaveText(expected, { timeout });
  }

  async waitForQuickAddError(timeout = 15_000): Promise<void> {
    await this.waitForQuickAddState(/Error/i, timeout);
  }

  async screenshot(): Promise<Buffer> {
    return this.page.screenshot({ fullPage: false });
  }

  private modalAddSeriesButton(dialog: Locator): Locator {
    return dialog.getByRole('button', { name: /Add Series|Added!/ });
  }

  private async selectFromDropdown(trigger: Locator, optionLabel: string): Promise<void> {
    await trigger.click();
    const option = this.page.getByRole('option', { name: optionLabel });
    await expect(option).toBeVisible();
    await option.click();
  }

  private async setSwitchState(dialog: Locator, label: string, enabled: boolean): Promise<void> {
    const control = dialog.getByRole('switch', { name: label });
    const expectedState = enabled ? 'checked' : 'unchecked';
    const currentState = await control.getAttribute('data-state');
    if (currentState !== expectedState) {
      await control.click();
    }
    await expect(control).toHaveAttribute('data-state', expectedState);
  }
}
