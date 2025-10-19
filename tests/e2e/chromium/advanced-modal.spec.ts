import { test, expect } from '@playwright/test';
import { OptionsPage } from '../pages/options-page';
import { AnilistPage } from '../pages/anilist-page';
import { resetServerState, getSonarrSeries } from '../support/server-control';
import {
  attachJson,
  withChromiumHarness,
  collectBackgroundDiagnostics,
} from '../support/chromium';

const SONARR_API_KEY = '0123456789abcdef0123456789abcdef';
const QUALITY_PROFILE_LABEL = 'HD-1080p';
const ROOT_FOLDER_LABEL = '/sonarr/anime';

function extractStoredDefaults(diagnostics: Record<string, unknown>): Record<string, unknown> | undefined {
  const storageLocal = diagnostics.storageLocal as Record<string, unknown> | undefined;
  if (!storageLocal) return undefined;
  const options = storageLocal['local:options'];
  if (!options || typeof options !== 'object') return undefined;
  const defaults = (options as { defaults?: Record<string, unknown> }).defaults;
  return defaults;
}

test.describe('Chromium advanced modal flow', () => {
  test('advanced add saves defaults and adds series', async ({ browserName }, testInfo) => {
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

        await optionsPage.save();
        await optionsPage.waitForSaveComplete();

        const postSaveDiagnostics = await captureDiagnostics('background-post-save');
        // Read modal defaults from background storage diagnostics instead of mutating
        // the rendered DOM so the test exercises the real persistence flow.
        const baselineDefaults = extractStoredDefaults(postSaveDiagnostics);

        const aniListPage = new AnilistPage(await harness.context.newPage());
        await aniListPage.goto();
        await aniListPage.waitForQuickAddReady();

        const dialog = await aniListPage.openAdvancedModal();

        await aniListPage.selectQualityProfile(dialog, QUALITY_PROFILE_LABEL);
        await aniListPage.selectRootFolder(dialog, ROOT_FOLDER_LABEL);
        await aniListPage.selectMonitorOption(dialog, 'None');
        await aniListPage.setSeasonFolder(dialog, false);
        await aniListPage.setSearchForMissingEpisodes(dialog, false);

        await aniListPage.saveDefaults(dialog);

        const defaultsDiagnostics = await captureDiagnostics('background-post-defaults');
        const storedDefaults = extractStoredDefaults(defaultsDiagnostics);
        if (!storedDefaults) {
          throw new Error('Expected stored defaults to be defined after saving');
        }
        expect(storedDefaults).toMatchObject({
          monitorOption: 'none',
          seasonFolder: false,
          searchForMissingEpisodes: false,
        });
        if (baselineDefaults) {
          expect(storedDefaults).not.toEqual(baselineDefaults);
        }

        await aniListPage.clickAddSeries(dialog);
        await aniListPage.waitForAddSeriesStatus(dialog, 'Added!');
        await aniListPage.waitForModalHidden(dialog);

        await aniListPage.waitForQuickAddState(/In Sonarr/);

        const sonarrSeries = await getSonarrSeries(harness.serverBaseUrl, SONARR_API_KEY);
        expect(sonarrSeries.some(series => series.title === 'Kitsunarr Test Series')).toBe(true);

        await testInfo.attach(`anilist-advanced-${browserName}`, {
          body: await aniListPage.screenshot(),
          contentType: 'image/png',
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
      } finally {
        await resetServerState(harness.serverBaseUrl);
      }
    });
  });
});
