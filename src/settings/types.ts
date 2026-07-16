/** Canonical extension settings and public-options types owned by the options domain. */
// src/settings/types.ts

import type { AniListTitleLanguage } from "@/anilist/title";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type { SeerrConnection } from "@/providers/seerr/types";
import type { ProviderCredentials } from "@/providers/types";

export type BadgeVisibility = "always" | "hover";
export type BrowseCardPrimaryStatus = "arr" | "seerr";

export interface UiOptions {
	preferredAniListTitleLanguage: AniListTitleLanguage;
	browseCards: {
		primaryStatus: BrowseCardPrimaryStatus;
		sonarr: {
			enabled: boolean;
			visibility: BadgeVisibility;
		};
		radarr: {
			enabled: boolean;
			visibility: BadgeVisibility;
		};
		seerr: {
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
		seerr: {
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
	seerr: SeerrConnection;
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
	seerr: {
		isConfigured: boolean;
		authMode: SeerrConnection["auth"]["mode"] | null;
	};
	ui: UiOptions;
	debugLogging: boolean;
}
