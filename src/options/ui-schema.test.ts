/** Focused tests for the options-owned UI schema behavior. */
// src/options/ui-schema.test.ts

import { describe, expect, it } from 'vitest';
import { createDefaultSettings, createDefaultUiOptions, parseSettings } from '@/options';

describe('parseSettings ui schema', () => {
  it('keeps current UI settings shape', () => {
    const settings = createDefaultSettings();
    settings.ui.browseCards.sonarr.visibility = 'hover';
    settings.ui.animePages.radarr.enabled = false;
    settings.ui.schedulerDebugOverlayEnabled = true;

    expect(parseSettings(settings).ui).toEqual(settings.ui);
  });

  it('does not migrate removed legacy UI fields', () => {
    const parsed = parseSettings({
      ui: {
        browseOverlayEnabled: false,
        badgeVisibility: 'hidden',
        headerInjectionEnabled: false,
      },
    });

    expect(parsed.ui).toEqual(createDefaultUiOptions());
  });
});
