/** Runtime-validated extension settings schema and default factories owned by the options domain. */
// src/settings/schema.ts

import * as v from "valibot";
import { AniListTitleLanguageSchema } from "@/anilist/schemas/title-language.schema";
import {
	SonarrDefaultsSchema,
	createDefaultSonarrFormState as createDefaultSonarrFormStateValue,
} from "@/providers/sonarr/form-state";
import {
	createDefaultRadarrFormState,
	RadarrDefaultsSchema,
} from "@/providers/radarr/form-state";
import type { ExtensionOptions } from "./types";
import { createDefaultUiOptions, UiOptionsSchema } from "./ui-schema";

const createDefaultSonarrProviderSettings = () => ({
	url: "",
	apiKey: "",
	preferredAniListTitleLanguage: "english" as const,
	defaults: createDefaultSonarrFormStateValue(),
});

const createDefaultRadarrProviderSettings = () => ({
	url: "",
	apiKey: "",
	preferredAniListTitleLanguage: "english" as const,
	defaults: createDefaultRadarrFormState(),
});

const SonarrProviderSettingsSchema = v.object({
	url: v.string(),
	apiKey: v.string(),
	preferredAniListTitleLanguage: v.fallback(
		AniListTitleLanguageSchema,
		"english",
	),
	defaults: v.fallback(
		SonarrDefaultsSchema,
		createDefaultSonarrFormStateValue(),
	),
});

const RadarrProviderSettingsSchema = v.object({
	url: v.string(),
	apiKey: v.string(),
	preferredAniListTitleLanguage: v.fallback(
		AniListTitleLanguageSchema,
		"english",
	),
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

export { createDefaultSonarrFormState } from "@/providers/sonarr/form-state";
export { createDefaultSonarrFormState as defaultSonarrFormState } from "@/providers/sonarr/form-state";
export {
	createDefaultRadarrFormState,
	createDefaultRadarrFormState as defaultRadarrFormState,
} from "@/providers/radarr/form-state";
export { createDefaultUiOptions as defaultUiOptions } from "./ui-schema";
