/** Canonical extension settings and public-options types shared across UI and runtime. */
// src/shared/types/options.ts

import type { AniListTitleLanguage } from '@/shared/schemas/anilist/anilist-title-language.schema';
import type { SonarrFormState } from '@/shared/schemas/providers/sonarr-settings.schema';
import type { RadarrFormState } from '@/shared/schemas/providers/radarr-settings.schema';
import type { ProviderCredentials } from '@/shared/types/providers';

export type BadgeVisibility = 'always' | 'hover';

export interface UiOptions {
  browseCards: {
    sonarr: {
      enabled: boolean;
      visibility: BadgeVisibility;
    };
    radarr: {
      enabled: boolean;
      visibility: BadgeVisibility;
    };
  };
  animePages: {
    sonarr: {
      enabled: boolean;
    };
    radarr: {
      enabled: boolean;
    };
  };
  schedulerDebugOverlayEnabled: boolean;
}

export interface ExtensionOptions {
  providers: {
    sonarr: ProviderCredentials & {
      preferredAniListTitleLanguage: AniListTitleLanguage;
      defaults: SonarrFormState;
    };
    radarr: ProviderCredentials & {
      preferredAniListTitleLanguage: AniListTitleLanguage;
      defaults: RadarrFormState;
    };
  };
  ui: UiOptions;
  debugLogging: boolean;
}

/**
 * Public-facing configuration data that is safe to expose to content scripts.
 * Secrets like provider API keys are intentionally excluded.
 */
export interface PublicOptions {
  providers: {
    sonarr: {
      url: string;
      preferredAniListTitleLanguage: AniListTitleLanguage;
      defaults: SonarrFormState;
      isConfigured: boolean;
    };
    radarr: {
      url: string;
      preferredAniListTitleLanguage: AniListTitleLanguage;
      defaults: RadarrFormState;
      isConfigured: boolean;
    };
  };
  ui: UiOptions;
  debugLogging: boolean;
}
