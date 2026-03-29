/** Canonical extension settings and public-options types shared across UI and runtime. */
// src/shared/types/options.ts

import type { AniListTitleLanguage } from '@/shared/schemas/anilist/anilist-title-language.schema';
import type { SonarrFormState } from '@/shared/schemas/providers/sonarr-settings.schema';
import type { RadarrFormState } from '@/shared/schemas/providers/radarr-settings.schema';
import type { ProviderCredentials } from '@/shared/types/providers';

export type BadgeVisibility = 'always' | 'hover';

export interface ProviderBrowseCardUiOptions {
  enabled: boolean;
  visibility: BadgeVisibility;
}

export interface ProviderAnimePageUiOptions {
  enabled: boolean;
}

export interface ProviderUiOptions {
  sonarr: ProviderBrowseCardUiOptions;
  radarr: ProviderBrowseCardUiOptions;
}

export interface ProviderAnimePageOptions {
  sonarr: ProviderAnimePageUiOptions;
  radarr: ProviderAnimePageUiOptions;
}

export interface UiOptions {
  browseCards: ProviderUiOptions;
  animePages: ProviderAnimePageOptions;
  schedulerDebugOverlayEnabled: boolean;
}

export interface SonarrOptions extends ProviderCredentials {
  preferredAniListTitleLanguage: AniListTitleLanguage;
  defaults: SonarrFormState;
}

export interface RadarrOptions extends ProviderCredentials {
  preferredAniListTitleLanguage: AniListTitleLanguage;
  defaults: RadarrFormState;
}

export interface SonarrPublicOptions {
  url: string;
  preferredAniListTitleLanguage: AniListTitleLanguage;
  defaults: SonarrFormState;
  isConfigured: boolean;
}

export interface RadarrPublicOptions {
  url: string;
  preferredAniListTitleLanguage: AniListTitleLanguage;
  defaults: RadarrFormState;
  isConfigured: boolean;
}

export interface ExtensionOptions {
  providers: {
    sonarr: SonarrOptions;
    radarr: RadarrOptions;
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
    sonarr: SonarrPublicOptions;
    radarr: RadarrPublicOptions;
  };
  ui: UiOptions;
  debugLogging: boolean;
}
