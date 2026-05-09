/** Canonical extension settings and public-options types owned by the options domain. */
// src/settings/types.ts

import type { AniListTitleLanguage } from "@/anilist/schemas/title-language.schema";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type { ProviderCredentials } from "@/providers";

export type BadgeVisibility = "always" | "hover";

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
