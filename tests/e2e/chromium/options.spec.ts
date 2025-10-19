import { test, expect } from '@playwright/test';
import { OptionsPage } from '../pages/options-page';
import { resetServerState, updateServerState } from '../support/server-control';
import {
  attachJson,
  withChromiumHarness,
  collectBackgroundDiagnostics,
  testServerBaseUrl,
} from '../support/chromium';

const SONARR_API_KEY = '0123456789abcdef0123456789abcdef';
const INVALID_SONARR_KEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const EXPECTED_SONARR_KEY = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

test.describe('Chromium options page', () => {
  test('configures Sonarr connection and persists settings', async ({ browserName }, testInfo) => {
    await withChromiumHarness(testInfo, async harness => {
      await resetServerState(harness.serverBaseUrl);

      let optionsPage: OptionsPage | null = null;

      const captureDiagnostics = async (label: string) => {
        const diagnostics = await collectBackgroundDiagnostics(harness.background);
        await attachJson(testInfo, `${label}-${browserName}`, diagnostics);
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

          await captureDiagnostics('background-post-connect');
          console.log(`[${browserName}] Configure Sonarr connection complete`);
        });

        await test.step('Persist settings', async () => {
          if (!optionsPage) throw new Error('Options page not initialized');
          await optionsPage.save();
          await optionsPage.waitForSaveComplete();

          await captureDiagnostics('background-post-save');
          await testInfo.attach(`options-${browserName}`, {
            body: await optionsPage.page.screenshot({ fullPage: true }),
            contentType: 'image/png',
          });
          console.log(`[${browserName}] Persist settings complete`);
        });
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
      }
    });
  });

  test('surfaces Sonarr credential errors before allowing save', async ({ browserName }, testInfo) => {
    await withChromiumHarness(testInfo, async harness => {
      await resetServerState(harness.serverBaseUrl);
      await updateServerState(harness.serverBaseUrl, { requiredApiKey: EXPECTED_SONARR_KEY });

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
    });

    await resetServerState(testServerBaseUrl);
  });
});
