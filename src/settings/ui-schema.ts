/** Runtime-validated UI settings schema and defaults owned by the options domain. */
// src/settings/ui-schema.ts

import * as v from "valibot";
import { ANILIST_TITLE_LANGUAGES } from "@/anilist/title";
import type { BadgeVisibility, UiOptions } from "./types";

const BADGE_VISIBILITY_OPTIONS: [BadgeVisibility, ...BadgeVisibility[]] = [
	"always",
	"hover",
];
const AniListTitleLanguageSchema = v.picklist(ANILIST_TITLE_LANGUAGES);

const createDefaultBrowseCardUiOptions =
	(): UiOptions["browseCards"]["sonarr"] => ({
		enabled: true,
		visibility: "always",
	});

const createDefaultAnimePageUiOptions =
	(): UiOptions["animePages"]["sonarr"] => ({
		enabled: true,
	});

export const createDefaultUiOptions = (): UiOptions => ({
	preferredAniListTitleLanguage: "english",
	browseCards: {
		sonarr: createDefaultBrowseCardUiOptions(),
		radarr: createDefaultBrowseCardUiOptions(),
		seerr: createDefaultBrowseCardUiOptions(),
	},
	animePages: {
		sonarr: createDefaultAnimePageUiOptions(),
		radarr: createDefaultAnimePageUiOptions(),
		seerr: createDefaultAnimePageUiOptions(),
	},
});

const asRecord = (input: unknown): Record<string, unknown> =>
	input && typeof input === "object" ? (input as Record<string, unknown>) : {};

const ProviderBrowseCardUiOptionsSchema = v.pipe(
	v.unknown(),
	v.transform(asRecord),
	v.object({
		enabled: v.fallback(v.boolean(), true),
		visibility: v.fallback(v.picklist(BADGE_VISIBILITY_OPTIONS), "always"),
	}),
);

const ProviderAnimePageUiOptionsSchema = v.pipe(
	v.unknown(),
	v.transform(asRecord),
	v.object({
		enabled: v.fallback(v.boolean(), true),
	}),
);

export const UiOptionsSchema = v.pipe(
	v.unknown(),
	v.transform(asRecord),
	v.object({
		preferredAniListTitleLanguage: v.fallback(
			AniListTitleLanguageSchema,
			"english",
		),
		browseCards: v.object({
			sonarr: v.fallback(
				ProviderBrowseCardUiOptionsSchema,
				createDefaultBrowseCardUiOptions(),
			),
			radarr: v.fallback(
				ProviderBrowseCardUiOptionsSchema,
				createDefaultBrowseCardUiOptions(),
			),
			seerr: v.fallback(
				ProviderBrowseCardUiOptionsSchema,
				createDefaultBrowseCardUiOptions(),
			),
		}),
		animePages: v.object({
			sonarr: v.fallback(
				ProviderAnimePageUiOptionsSchema,
				createDefaultAnimePageUiOptions(),
			),
			radarr: v.fallback(
				ProviderAnimePageUiOptionsSchema,
				createDefaultAnimePageUiOptions(),
			),
			seerr: v.fallback(
				ProviderAnimePageUiOptionsSchema,
				createDefaultAnimePageUiOptions(),
			),
		}),
	}),
);
