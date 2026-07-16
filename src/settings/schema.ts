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
import type { SeerrConnection } from "@/providers/seerr/types";
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

export const createDefaultSeerrConnection = (): SeerrConnection => ({
	url: "",
	auth: { mode: "session" },
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

const SeerrAccountSummarySchema = v.object({
	id: v.pipe(v.number(), v.finite(), v.integer(), v.minValue(1)),
	displayName: v.string(),
	avatar: v.optional(v.string()),
});

const SeerrAuthSchema = v.union([
	v.object({
		mode: v.literal("session"),
	}),
	v.object({
		mode: v.literal("apiKey"),
		apiKey: v.string(),
	}),
]);

export const SeerrConnectionSchema = v.object({
	url: v.string(),
	auth: SeerrAuthSchema,
	account: v.optional(SeerrAccountSummarySchema),
});

export const createDefaultExtensionOptions = (): ExtensionOptions => ({
	providers: {
		sonarr: createDefaultSonarrProviderSettings(),
		radarr: createDefaultRadarrProviderSettings(),
	},
	seerr: createDefaultSeerrConnection(),
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
	seerr: v.fallback(SeerrConnectionSchema, createDefaultSeerrConnection()),
	ui: v.fallback(UiOptionsSchema, createDefaultUiOptions()),
	debugLogging: v.fallback(v.boolean(), false),
});

export const ExtensionOptionsSchema = v.fallback(
	ExtensionOptionsObjectSchema,
	createDefaultExtensionOptions(),
);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// LEGACY: Remove after upgrades from API-key-only Seerr records are unsupported.
export function migrateLegacySeerrConnection(
	value: unknown,
): SeerrConnection {
	const current = v.safeParse(SeerrConnectionSchema, value);
	if (current.success) return current.output;

	if (!isRecord(value)) return createDefaultSeerrConnection();

	const url = typeof value.url === "string" ? value.url.trim() : "";
	const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";
	if (!url || !apiKey) return createDefaultSeerrConnection();

	return {
		url,
		auth: {
			mode: "apiKey",
			apiKey,
		},
	};
}
