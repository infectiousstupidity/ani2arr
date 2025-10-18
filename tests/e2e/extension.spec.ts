import { test, expect } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import {
  createExtensionHarness,
  collectBackgroundDiagnostics,
  readLibraryEpoch,
  waitForLibraryEpochBump,
  testServerBaseUrl,
} from './support/extension';
import { resetServerState, updateServerState, getSonarrSeries } from './support/server-control';
import { OptionsPage } from './pages/options-page';
import { AnilistPage } from './pages/anilist-page';

const SONARR_API_KEY = '0123456789abcdef0123456789abcdef';
const INVALID_SONARR_KEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const EXPECTED_SONARR_KEY = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

async function attachJson(testInfo: TestInfo, name: string, payload: unknown) {
  try {
    const serialized = JSON.stringify(payload ?? null, null, 2) ?? 'null';
    await testInfo.attach(name, {
      body: Buffer.from(serialized, 'utf8'),
      contentType: 'application/json',
    });
  } catch (error) {
    console.warn(`[E2E] Failed to attach ${name}:`, (error as Error).message);
  }
}

async function waitForQuickAddCompletion(page: AnilistPage, timeoutMs = 15_000) {
  const button = page.quickAddButton();
  const start = Date.now();
  let lastText = '';
  while (Date.now() - start <= timeoutMs) {
    const text = (await button.textContent())?.trim() ?? '';
    if (text) {
      lastText = text;
      if (text.includes('In Sonarr')) return text;
      if (text.includes('Error')) {
        throw new Error(`Quick add failed with state: ${text}`);
      }
    }
    await page.page.waitForTimeout(250);
  }
  throw new Error(`Quick add did not reach 'In Sonarr' within ${timeoutMs}ms (last seen state: ${lastText || 'empty'})`);
}

test.describe('Kitsunarr extension end-to-end', () => {
  test('configures options and supports quick add flows', async ({ browserName }, testInfo) => {
    const harness = await createExtensionHarness();
    await resetServerState(harness.serverBaseUrl);

    let optionsPage: OptionsPage | null = null;
    let aniListPage: AnilistPage | null = null;

    const collectDiagnostics = async (label: string) => {
      const diagnostics = await collectBackgroundDiagnostics(harness.background);
      await attachJson(testInfo, label, diagnostics);
      return diagnostics;
    };

    try {
      await test.step('Configure Sonarr connection', async () => {
        optionsPage = new OptionsPage(await harness.openOptionsPage());
        await expect(optionsPage.heading).toBeVisible();

        await optionsPage.configureSonarr(`${harness.serverBaseUrl}/sonarr`, SONARR_API_KEY);
        const statusResponse = harness.waitForTestConnection();
        await optionsPage.connect();
        await statusResponse;
        await optionsPage.waitForConnectionSuccess();

        await collectDiagnostics(`background-post-connect-${browserName}`);
        console.log(`[${browserName}] Configure Sonarr connection complete`);
      });

      await test.step('Persist settings', async () => {
        if (!optionsPage) throw new Error('Options page not initialized');
        await optionsPage.save();
        await optionsPage.waitForSaveComplete();

        await collectDiagnostics(`background-post-save-${browserName}`);
        await testInfo.attach(`options-${browserName}`, {
          body: await optionsPage.page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        console.log(`[${browserName}] Persist settings complete`);
      });

      await test.step('Quick add series and verify state', async () => {
        aniListPage = new AnilistPage(await harness.context.newPage());
        console.log(`[${browserName}] Navigating to AniList page`);
        await aniListPage.goto();
        console.log(`[${browserName}] Waiting for quick add ready`);
        await aniListPage.waitForQuickAddReady();

        const quickButton = aniListPage.quickAddButton();
        const initialEpoch = await readLibraryEpoch(harness.background);
        await quickButton.click();
        await aniListPage.waitForQuickAddState('Adding...', 5_000);
        const finalText = await waitForQuickAddCompletion(aniListPage);
        console.log(`[${browserName}] quick add final state: ${finalText}`);
        const bumped = await waitForLibraryEpochBump(harness.background, initialEpoch ?? undefined);
        if (!bumped) {
          console.warn(`[${browserName}] libraryEpoch did not update after quick add`);
        }

        const sonarrSeries = await getSonarrSeries(harness.serverBaseUrl, SONARR_API_KEY);
        expect(sonarrSeries.length).toBeGreaterThan(0);

        await testInfo.attach(`anilist-${browserName}`, {
          body: await aniListPage.screenshot(),
          contentType: 'image/png',
        });
        console.log(`[${browserName}] Quick add series step complete`);
      });
    } catch (error) {
      try {
        await collectDiagnostics(`background-on-error-${browserName}`);
      } catch (diagError) {
        console.warn(`[E2E] Failed to capture diagnostics on error:`, (diagError as Error).message);
      }
      throw error;
    } finally {
      await harness.cleanup();
    }
  });

  test('surfaces Sonarr credential errors before allowing save', async ({ browserName }, testInfo) => {
    const harness = await createExtensionHarness();
    await resetServerState(harness.serverBaseUrl);
    await updateServerState(harness.serverBaseUrl, { requiredApiKey: EXPECTED_SONARR_KEY });

    try {
      const optionsPage = new OptionsPage(await harness.openOptionsPage());

      await optionsPage.configureSonarr(`${harness.serverBaseUrl}/sonarr`, INVALID_SONARR_KEY);
      const initialStatusResponse = harness.waitForTestConnection();
      await optionsPage.connect();
      await initialStatusResponse.catch(() => undefined);
      await optionsPage.waitForConnectionError();

      const failureDiagnostics = await collectBackgroundDiagnostics(harness.background);
      await attachJson(testInfo, `background-unauthorized-${browserName}`, failureDiagnostics);
      console.log(`[${browserName}] Unauthorized state captured`);

      await optionsPage.configureSonarr(`${harness.serverBaseUrl}/sonarr`, EXPECTED_SONARR_KEY);
      const recoveryStatusResponse = harness.waitForTestConnection();
      await optionsPage.connect();
      await recoveryStatusResponse;
      await optionsPage.waitForConnectionSuccess();

      await optionsPage.save();
      await optionsPage.waitForSaveComplete();
      console.log(`[${browserName}] Authorization recovery complete`);
    } finally {
      await harness.cleanup();
      await resetServerState(testServerBaseUrl);
    }
  });
});
