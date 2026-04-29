/** Focused tests for options parsing and public snapshot shaping. */
// src/options/store.test.ts

import { describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import {
  PUBLIC_OPTIONS_CHANGE_KEY,
  createDefaultExtensionOptions,
  getExtensionOptionsSnapshot,
  getPublicOptionsSnapshot,
  parseExtensionOptions,
  toPublicOptions,
  watchPublicOptionsSnapshot,
} from '@/options';
import type { PublicOptions } from '@/options';

const PUBLIC_OPTIONS_STORAGE_KEY = 'publicOptions';
const SONARR_SECRETS_STORAGE_KEY = 'sonarrSecrets';
const RADARR_SECRETS_STORAGE_KEY = 'radarrSecrets';

describe('options store helpers', () => {
  it('falls back to default settings for missing input', () => {
    expect(parseExtensionOptions({})).toEqual(createDefaultExtensionOptions());
  });

  it('omits secrets and computes provider configuration in public options', () => {
    const settings = createDefaultExtensionOptions();
    settings.providers.sonarr.url = 'https://sonarr.example';
    settings.providers.sonarr.apiKey = 'sonarr-key';
    settings.providers.radarr.url = 'https://radarr.example';
    settings.providers.radarr.apiKey = '';

    expect(toPublicOptions(settings)).toEqual({
      providers: {
        sonarr: {
          url: 'https://sonarr.example',
          preferredAniListTitleLanguage: 'english',
          defaults: settings.providers.sonarr.defaults,
          isConfigured: true,
        },
        radarr: {
          url: 'https://radarr.example',
          preferredAniListTitleLanguage: 'english',
          defaults: settings.providers.radarr.defaults,
          isConfigured: false,
        },
      },
      ui: settings.ui,
      debugLogging: false,
    });
  });

  it('falls back from malformed public options without healing storage on read', async () => {
    const malformedPublicOptions = {
      debugLogging: true,
    } as unknown as PublicOptions;

    await browser.storage.local.set({ [PUBLIC_OPTIONS_STORAGE_KEY]: malformedPublicOptions });

    const snapshot = await getExtensionOptionsSnapshot();

    expect(snapshot).toEqual({
      ...createDefaultExtensionOptions(),
      debugLogging: true,
    });
    await expect(browser.storage.local.get(PUBLIC_OPTIONS_STORAGE_KEY)).resolves.toEqual({
      [PUBLIC_OPTIONS_STORAGE_KEY]: malformedPublicOptions,
    });
  });

  it('falls back to empty API keys for malformed secret records', async () => {
    const settings = createDefaultExtensionOptions();
    const persistedPublicOptions = toPublicOptions({
      ...settings,
      providers: {
        sonarr: {
          ...settings.providers.sonarr,
          url: 'https://sonarr.example',
        },
        radarr: {
          ...settings.providers.radarr,
          url: 'https://radarr.example',
        },
      },
    });

    await browser.storage.local.set({
      [PUBLIC_OPTIONS_STORAGE_KEY]: persistedPublicOptions,
      [SONARR_SECRETS_STORAGE_KEY]: { apiKey: 123 } as unknown as { apiKey: string },
      [RADARR_SECRETS_STORAGE_KEY]: null as unknown as { apiKey: string },
    });

    const snapshot = await getExtensionOptionsSnapshot();

    expect(snapshot.providers.sonarr.url).toBe('https://sonarr.example');
    expect(snapshot.providers.sonarr.apiKey).toBe('');
    expect(snapshot.providers.radarr.url).toBe('https://radarr.example');
    expect(snapshot.providers.radarr.apiKey).toBe('');
  });

  it('reads public options from the public snapshot only', async () => {
    await browser.storage.local.set({
      [PUBLIC_OPTIONS_STORAGE_KEY]: {
        ...toPublicOptions(createDefaultExtensionOptions()),
        debugLogging: true,
        providers: {
          sonarr: {
            ...toPublicOptions(createDefaultExtensionOptions()).providers.sonarr,
            isConfigured: true,
          },
          radarr: toPublicOptions(createDefaultExtensionOptions()).providers.radarr,
        },
      },
      [SONARR_SECRETS_STORAGE_KEY]: { apiKey: '' },
    });

    const snapshot = await getPublicOptionsSnapshot();

    expect(snapshot.debugLogging).toBe(true);
    expect(snapshot.providers.sonarr.isConfigured).toBe(true);
  });

  it('watches only public options for public snapshot updates', async () => {
    const snapshots: PublicOptions[] = [];
    const unsubscribe = watchPublicOptionsSnapshot(snapshot => {
      snapshots.push(snapshot);
    });

    await browser.storage.local.set({
      [SONARR_SECRETS_STORAGE_KEY]: { apiKey: 'secret-only-change' },
    });
    await browser.storage.local.set({
      [PUBLIC_OPTIONS_STORAGE_KEY]: {
        ...toPublicOptions(createDefaultExtensionOptions()),
        debugLogging: true,
      },
    });

    unsubscribe();

    expect(PUBLIC_OPTIONS_CHANGE_KEY).toBe(PUBLIC_OPTIONS_STORAGE_KEY);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.debugLogging).toBe(true);
  });
});
