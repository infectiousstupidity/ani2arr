import { test, expect } from '@playwright/test';
import { OptionsPage } from '../pages/options-page';
import { AnilistPage } from '../pages/anilist-page';
import { resetServerState, getSonarrSeries, updateServerState } from '../support/server-control';
import {
  attachJson,
  withChromiumHarness,
  collectBackgroundDiagnostics,
  readLibraryEpoch,
  waitForLibraryEpochBump,
} from '../support/chromium';

const SONARR_API_KEY = '0123456789abcdef0123456789abcdef';

async function waitForQuickAddCompletion(page: AnilistPage, timeoutMs = 15_000): Promise<string> {
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
  throw new Error(
    `Quick add did not reach 'In Sonarr' within ${timeoutMs}ms (last seen state: ${lastText || 'empty'})`,
  );
}

test.describe('Chromium quick add flow', () => {
  test('quick add completes after configuring Sonarr', async ({ browserName }, testInfo) => {
    await withChromiumHarness(async harness => {
      await resetServerState(harness.serverBaseUrl);

      const captureDiagnostics = async (label: string) => {
        const diagnostics = await collectBackgroundDiagnostics(harness.background);
        await attachJson(testInfo, `${label}-${browserName}`, diagnostics);
        return diagnostics;
      };

      try {
        const optionsPage = new OptionsPage(await harness.openOptionsPage());
        await expect(optionsPage.heading).toBeVisible();

        await optionsPage.configureSonarr(`${harness.serverBaseUrl}/sonarr`, SONARR_API_KEY);
        const statusResponse = harness.waitForTestConnection();
        await optionsPage.connect();
        await statusResponse;
        await optionsPage.waitForConnectionSuccess();

        await captureDiagnostics('background-post-connect');

        await optionsPage.save();
        await optionsPage.waitForSaveComplete();

        await captureDiagnostics('background-post-save');

        const aniListPage = new AnilistPage(await harness.context.newPage());
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
      } catch (error) {
        try {
          await captureDiagnostics('background-on-error');
        } catch (diagError) {
          console.warn(
            `[E2E] Failed to capture diagnostics on error:`,
            (diagError as Error).message,
          );
        }
        throw error;
      } finally {
        await resetServerState(harness.serverBaseUrl);
      }
    });
  });

  test('quick add surfaces failure and recovers without reload', async ({ browserName }, testInfo) => {
    await withChromiumHarness(async harness => {
      await resetServerState(harness.serverBaseUrl);

      const captureDiagnostics = async (label: string) => {
        const diagnostics = await collectBackgroundDiagnostics(harness.background);
        await attachJson(testInfo, `${label}-${browserName}`, diagnostics);
        return diagnostics;
      };

      try {
        const optionsPage = new OptionsPage(await harness.openOptionsPage());
        await expect(optionsPage.heading).toBeVisible();

        await optionsPage.configureSonarr(`${harness.serverBaseUrl}/sonarr`, SONARR_API_KEY);
        const statusResponse = harness.waitForTestConnection();
        await optionsPage.connect();
        await statusResponse;
        await optionsPage.waitForConnectionSuccess();

        await captureDiagnostics('background-post-connect-retry');

        await optionsPage.save();
        await optionsPage.waitForSaveComplete();

        await captureDiagnostics('background-post-save-retry');

        const aniListPage = new AnilistPage(await harness.context.newPage());
        console.log(`[${browserName}] Navigating to AniList page (retry test)`);
        await aniListPage.goto();
        await aniListPage.waitForQuickAddReady();

        const quickButton = aniListPage.quickAddButton();
        await updateServerState(harness.serverBaseUrl, {
          failNextAdd: { status: 500, body: { message: 'Forced failure' } },
        });

        await quickButton.click();
        await aniListPage.waitForQuickAddState('Adding...', 5_000);
        await aniListPage.waitForQuickAddError();

        const afterFailureSeries = await getSonarrSeries(harness.serverBaseUrl, SONARR_API_KEY);
        expect(afterFailureSeries).toHaveLength(0);

        await aniListPage.waitForQuickAddState('Add to Sonarr', 10_000);

        await quickButton.click();
        await aniListPage.waitForQuickAddState('Adding...', 5_000);
        const finalText = await waitForQuickAddCompletion(aniListPage);
        expect(finalText).toContain('In Sonarr');

        const sonarrSeries = await getSonarrSeries(harness.serverBaseUrl, SONARR_API_KEY);
        expect(sonarrSeries.length).toBeGreaterThan(0);

        await testInfo.attach(`anilist-retry-${browserName}`, {
          body: await aniListPage.screenshot(),
          contentType: 'image/png',
        });
      } catch (error) {
        try {
          await captureDiagnostics('background-on-error-retry');
        } catch (diagError) {
          console.warn(
            `[E2E] Failed to capture diagnostics on retry error:`,
            (diagError as Error).message,
          );
        }
        throw error;
      } finally {
        await resetServerState(harness.serverBaseUrl);
      }
    });
  });
});
