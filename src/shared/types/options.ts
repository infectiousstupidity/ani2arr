import type {
  SonarrPublicSettings,
  SonarrSettings,
} from '@/shared/providers/sonarr/types';
import type {
  RadarrPublicSettings,
  RadarrSettings,
} from '@/shared/providers/radarr/types';

export type BadgeVisibility = 'always' | 'hover' | 'hidden';

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

export interface ProviderSettings {
  sonarr: SonarrSettings;
  radarr: RadarrSettings;
}

export interface ExtensionOptions {
  providers: ProviderSettings;
  ui: UiOptions;
  debugLogging: boolean;
}

export interface ProviderPublicOptions {
  sonarr: SonarrPublicSettings;
  radarr: RadarrPublicSettings;
}

/**
 * Public-facing configuration data that is safe to expose to content scripts.
 * Secrets (like provider API keys) are intentionally excluded.
 */
export interface PublicOptions {
  providers: ProviderPublicOptions;
  ui: UiOptions;
  debugLogging: boolean;
}
