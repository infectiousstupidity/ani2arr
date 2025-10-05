import { expect, type Locator, type Page } from '@playwright/test';

export class OptionsPage {
  constructor(public readonly page: Page) {}

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'networkidle' });
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Kitsunarr' });
  }

  get sonarrUrlField(): Locator {
    return this.page.getByLabel('Sonarr URL');
  }

  get sonarrApiKeyField(): Locator {
    return this.page.getByLabel('Sonarr API Key');
  }

  get connectButton(): Locator {
    return this.page.getByRole('button', { name: 'Connect' });
  }

  get status(): Locator {
    return this.page.getByRole('status');
  }

  get saveButton(): Locator {
    return this.page.getByRole('button', { name: 'Save settings' });
  }

  get editButton(): Locator {
    return this.page.getByRole('button', { name: 'Edit' });
  }

  get qualityProfileSelect(): Locator {
    return this.page.getByLabel('Quality Profile');
  }

  async configureSonarr(url: string, apiKey: string): Promise<void> {
    await this.sonarrUrlField.fill(url);
    await this.sonarrApiKeyField.fill(apiKey);
  }

  async connect(): Promise<void> {
    await expect(this.connectButton).toBeEnabled();
    await this.connectButton.click();
  }

  async waitForConnectionSuccess(): Promise<void> {
    await expect(this.status).toContainText('Connected');
    await expect(this.editButton).toBeEnabled();
    await expect(this.qualityProfileSelect).toBeVisible();
  }

  async waitForConnectionError(expected?: RegExp | string): Promise<void> {
    try {
      await expect(this.status).toContainText(/Failed|Error/);
    } catch {
      await expect(this.connectButton).toHaveText(/Retry/i);
    }
    if (!expected) return;
    const candidate = this.page.getByText(expected, { exact: false });
    await expect(candidate).toBeVisible();
  }

  async save(): Promise<void> {
    await expect(this.saveButton).toBeEnabled();
    await this.saveButton.click();
  }

  async waitForSaveComplete(): Promise<void> {
    await expect(this.saveButton).toBeDisabled({ timeout: 15_000 });
  }

  async statusText(): Promise<string | null> {
    return this.status.textContent();
  }
}
