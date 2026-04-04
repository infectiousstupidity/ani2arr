/** Focused tests for options parsing and public snapshot shaping. */
// src/options/store.test.ts

import { describe, expect, it } from 'vitest';
import { createDefaultSettings, parseSettings, toPublicOptions } from '@/options';

describe('options store helpers', () => {
  it('falls back to default settings for missing input', () => {
    expect(parseSettings({})).toEqual(createDefaultSettings());
  });

  it('omits secrets and computes provider configuration in public options', () => {
    const settings = createDefaultSettings();
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
});
