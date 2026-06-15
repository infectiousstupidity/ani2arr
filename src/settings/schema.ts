/** Runtime-validated extension settings schema and default factories owned by the options domain. */
// src/settings/schema.ts

import * as v from "valibot";
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
	defaults: createDefaultSonarrFormStateValue(),
});

const createDefaultRadarrProviderSettings = () => ({
	url: "",
	apiKey: "",
	defaults: createDefaultRadarrFormState(),
});

const createDefaultSeerrSettings = () => ({
	url: "",
	apiKey: "",
});

const SonarrProviderSettingsSchema = v.object({
	url: v.string(),
	apiKey: v.string(),
	defaults: v.fallback(
		SonarrDefaultsSchema,
		createDefaultSonarrFormStateValue(),
	),
});

const RadarrProviderSettingsSchema = v.object({
	url: v.string(),
	apiKey: v.string(),
	defaults: v.fallback(RadarrDefaultsSchema, createDefaultRadarrFormState()),
});

const SeerrSettingsSchema = v.object({
	url: v.string(),
	apiKey: v.string(),
});

export const createDefaultExtensionOptions = (): ExtensionOptions => ({
	providers: {
		sonarr: createDefaultSonarrProviderSettings(),
		radarr: createDefaultRadarrProviderSettings(),
	},
	seerr: createDefaultSeerrSettings(),
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
	seerr: v.fallback(SeerrSettingsSchema, createDefaultSeerrSettings()),
	ui: v.fallback(UiOptionsSchema, createDefaultUiOptions()),
	debugLogging: v.fallback(v.boolean(), false),
});

export const ExtensionOptionsSchema = v.fallback(
	ExtensionOptionsObjectSchema,
	createDefaultExtensionOptions(),
);
