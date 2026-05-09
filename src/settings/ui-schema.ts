/** Runtime-validated UI settings schema and defaults owned by the options domain. */
// src/settings/ui-schema.ts

import * as v from "valibot";
import type { BadgeVisibility, UiOptions } from "./types";

const BADGE_VISIBILITY_OPTIONS: [BadgeVisibility, ...BadgeVisibility[]] = [
	"always",
	"hover",
];

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
	browseCards: {
		sonarr: createDefaultBrowseCardUiOptions(),
		radarr: createDefaultBrowseCardUiOptions(),
	},
	animePages: {
		sonarr: createDefaultAnimePageUiOptions(),
		radarr: createDefaultAnimePageUiOptions(),
	},
	schedulerDebugOverlayEnabled: false,
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
		browseCards: v.object({
			sonarr: v.fallback(
				ProviderBrowseCardUiOptionsSchema,
				createDefaultBrowseCardUiOptions(),
			),
			radarr: v.fallback(
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
		}),
		schedulerDebugOverlayEnabled: v.fallback(v.boolean(), false),
	}),
);
