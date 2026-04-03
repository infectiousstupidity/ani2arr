/** Runtime-validated extension settings schema and default factories. */
// src/shared/schemas/settings.ts

import * as v from 'valibot';
import type { ExtensionOptions } from '@/options';
import { createDefaultSonarrFormState, SonarrSettingsSchema } from './providers/sonarr-settings.schema';
import { createDefaultRadarrFormState, RadarrSettingsSchema } from './providers/radarr-settings.schema';
import { createDefaultUiOptions, UiOptionsSchema } from './ui-schema';

// --- Factory ---

const createDefaultSettingsInternal = (): ExtensionOptions => ({
  providers: {
    sonarr: {
      url: '',
      apiKey: '',
      preferredAniListTitleLanguage: 'english',
      defaults: createDefaultSonarrFormState(),
    },
    radarr: {
      url: '',
      apiKey: '',
      preferredAniListTitleLanguage: 'english',
      defaults: createDefaultRadarrFormState(),
    },
  },
  ui: createDefaultUiOptions(),
  debugLogging: false,
});

// --- Composed Settings Schema ---

const ExtensionOptionsSchema = v.object({
  providers: v.object({
    sonarr: v.fallback(SonarrSettingsSchema, {
      url: '',
      apiKey: '',
      preferredAniListTitleLanguage: 'english',
      defaults: createDefaultSonarrFormState(),
    }),
    radarr: v.fallback(RadarrSettingsSchema, {
      url: '',
      apiKey: '',
      preferredAniListTitleLanguage: 'english',
      defaults: createDefaultRadarrFormState(),
    }),
  }),
  ui: v.fallback(UiOptionsSchema, createDefaultUiOptions()),
  debugLogging: v.fallback(v.boolean(), false),
});

export const SettingsSchema = v.fallback(ExtensionOptionsSchema, createDefaultSettingsInternal());

export const createDefaultSettings = createDefaultSettingsInternal;
export const defaultSettings = createDefaultSettingsInternal;
export { createDefaultSonarrFormState as defaultSonarrFormState } from './providers/sonarr-settings.schema';
export { createDefaultRadarrFormState as defaultRadarrFormState } from './providers/radarr-settings.schema';
export { createDefaultUiOptions as defaultUiOptions } from './ui-schema';
