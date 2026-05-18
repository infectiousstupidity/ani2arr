/** Canonical extension settings and public-options types owned by the options domain. */
// src/settings/types.ts

import type { AniListTitleLanguage } from "@/anilist/schemas/title-language.schema";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type { ProviderCredentials } from "@/providers";

export type BadgeVisibility = "always" | "hover";

export interface UiOptions {
	preferredAniListTitleLanguage: AniListTitleLanguage;
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
}

export interface ExtensionOptions {
	providers: {
		sonarr: ProviderCredentials & {
			defaults: SonarrFormState;
		};
		radarr: ProviderCredentials & {
			defaults: RadarrFormState;
		};
	};
	ui: UiOptions;
	debugLogging: boolean;
}

export interface PublicOptions {
	providers: {
		sonarr: {
			defaults: SonarrFormState;
			isConfigured: boolean;
		};
		radarr: {
			defaults: RadarrFormState;
			isConfigured: boolean;
		};
	};
	ui: UiOptions;
	debugLogging: boolean;
}
