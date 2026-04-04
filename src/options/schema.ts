/** Runtime-validated extension settings schema and default factories owned by the options domain. */
// src/options/schema.ts

import * as v from 'valibot';
import { createDefaultRadarrFormState, RadarrSettingsSchema } from '@/shared/schemas/providers/radarr-settings.schema';
import { createDefaultSonarrFormState, SonarrSettingsSchema } from '@/shared/schemas/providers/sonarr-settings.schema';
import type { ExtensionOptions } from './types';
import { createDefaultUiOptions, UiOptionsSchema } from './ui-schema';

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
export { createDefaultSonarrFormState as defaultSonarrFormState } from '@/shared/schemas/providers/sonarr-settings.schema';
export { createDefaultRadarrFormState as defaultRadarrFormState } from '@/shared/schemas/providers/radarr-settings.schema';
export { createDefaultUiOptions as defaultUiOptions } from './ui-schema';
