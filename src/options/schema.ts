/** Runtime-validated extension settings schema and default factories owned by the options domain. */
// src/options/schema.ts

import * as v from "valibot";
import {
	RadarrDefaultsSchema,
	RadarrSettingsSchema,
	normalizeRadarrFormState,
	SonarrDefaultsSchema,
	SonarrSettingsSchema,
	normalizeSonarrFormState,
} from "@/providers/settings/provider-settings.schema";
import type { ExtensionOptions } from "./types";
import { createDefaultUiOptions, UiOptionsSchema } from "./ui-schema";

export const createDefaultSonarrFormState = () =>
	normalizeSonarrFormState({
		...v.parse(SonarrDefaultsSchema, {}),
		seriesType: "anime",
		seasonFolder: true,
		addOptions: {
			monitor: "all",
			searchForMissingEpisodes: true,
			searchForCutoffUnmetEpisodes: false,
		},
	});

export const createDefaultRadarrFormState = () =>
	normalizeRadarrFormState({
		...v.parse(RadarrDefaultsSchema, {}),
		monitored: true,
		minimumAvailability: "released",
		addOptions: {
			searchForMovie: true,
		},
	});

const createDefaultSonarrProviderSettings = () => ({
	url: "",
	apiKey: "",
	preferredAniListTitleLanguage: "english" as const,
	defaults: createDefaultSonarrFormState(),
});

const createDefaultRadarrProviderSettings = () => ({
	url: "",
	apiKey: "",
	preferredAniListTitleLanguage: "english" as const,
	defaults: createDefaultRadarrFormState(),
});

const SonarrProviderSettingsSchema = v.object({
	...SonarrSettingsSchema.entries,
	defaults: v.fallback(SonarrDefaultsSchema, createDefaultSonarrFormState()),
});

const RadarrProviderSettingsSchema = v.object({
	...RadarrSettingsSchema.entries,
	defaults: v.fallback(RadarrDefaultsSchema, createDefaultRadarrFormState()),
});

export const createDefaultExtensionOptions = (): ExtensionOptions => ({
	providers: {
		sonarr: createDefaultSonarrProviderSettings(),
		radarr: createDefaultRadarrProviderSettings(),
	},
	ui: createDefaultUiOptions(),
	debugLogging: false,
});

const ExtensionOptionsObjectSchema = v.object({
	providers: v.object({
		sonarr: v.fallback(
			SonarrProviderSettingsSchema,
			createDefaultSonarrProviderSettings(),
		),
		radarr: v.fallback(
			RadarrProviderSettingsSchema,
			createDefaultRadarrProviderSettings(),
		),
	}),
	ui: v.fallback(UiOptionsSchema, createDefaultUiOptions()),
	debugLogging: v.fallback(v.boolean(), false),
});

export const ExtensionOptionsSchema = v.fallback(
	ExtensionOptionsObjectSchema,
	createDefaultExtensionOptions(),
);

export { createDefaultSonarrFormState as defaultSonarrFormState };
export { createDefaultRadarrFormState as defaultRadarrFormState };
export { createDefaultUiOptions as defaultUiOptions } from "./ui-schema";
