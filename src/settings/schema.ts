/** Runtime-validated extension settings schema and default factories owned by the options domain. */
// src/settings/schema.ts

import * as v from "valibot";
import {
	SonarrDefaultsSchema,
	createDefaultSonarrFormState as createDefaultSonarrFormStateValue,
	normalizeSonarrDefaults,
} from "@/providers/sonarr/form-state";
import {
	createDefaultRadarrFormState,
	normalizeRadarrDefaults,
	RadarrDefaultsSchema,
} from "@/providers/radarr/form-state";
import type { ProviderCredentials } from "@/providers/types";
import type {
	ExtensionOptions,
	PrivateConnections,
	PublicOptions,
} from "./types";
import { createDefaultUiOptions, UiOptionsSchema } from "./ui-schema";

const asRecord = (input: unknown): Record<string, unknown> =>
	input && typeof input === "object" && !Array.isArray(input)
		? (input as Record<string, unknown>)
		: {};

export const createDefaultProviderConnection = (): ProviderCredentials => ({
	url: "",
	apiKey: "",
});

export const createDefaultPrivateConnections = (): PrivateConnections => ({
	sonarr: createDefaultProviderConnection(),
	radarr: createDefaultProviderConnection(),
	seerr: createDefaultProviderConnection(),
});

export const createDefaultExtensionOptions = (): ExtensionOptions => ({
	providers: {
		sonarr: {
			...createDefaultProviderConnection(),
			defaults: createDefaultSonarrFormStateValue(),
		},
		radarr: {
			...createDefaultProviderConnection(),
			defaults: createDefaultRadarrFormState(),
		},
	},
	seerr: createDefaultProviderConnection(),
	ui: createDefaultUiOptions(),
	debugLogging: false,
});

export const createDefaultPublicOptions = (): PublicOptions => {
	const defaults = createDefaultExtensionOptions();
	return {
		providers: {
			sonarr: {
				defaults: defaults.providers.sonarr.defaults,
				isConfigured: false,
			},
			radarr: {
				defaults: defaults.providers.radarr.defaults,
				isConfigured: false,
			},
		},
		seerr: { isConfigured: false },
		ui: defaults.ui,
		debugLogging: false,
	};
};

const ProviderCredentialsSchema = v.object({
	url: v.string(),
	apiKey: v.string(),
});

export const PrivateConnectionsSchema = v.object({
	sonarr: ProviderCredentialsSchema,
	radarr: ProviderCredentialsSchema,
	seerr: ProviderCredentialsSchema,
});

export const StoredPrivateConnectionsSchema = v.pipe(
	v.unknown(),
	v.transform(asRecord),
	v.object({
		sonarr: v.fallback(
			ProviderCredentialsSchema,
			createDefaultProviderConnection(),
		),
		radarr: v.fallback(
			ProviderCredentialsSchema,
			createDefaultProviderConnection(),
		),
		seerr: v.fallback(
			ProviderCredentialsSchema,
			createDefaultProviderConnection(),
		),
	}),
);

// LEGACY: Remove after upgrades from per-provider secret records are unsupported.
export const LegacyProviderCredentialsSchema = v.pipe(
	v.unknown(),
	v.transform(asRecord),
	v.object({
		url: v.fallback(v.string(), ""),
		apiKey: v.fallback(v.string(), ""),
	}),
);

const NormalizedSonarrDefaultsSchema = v.pipe(
	v.unknown(),
	v.transform((input) => {
		const result = v.safeParse(SonarrDefaultsSchema, input);
		return normalizeSonarrDefaults(result.success ? result.output : undefined);
	}),
);

const NormalizedRadarrDefaultsSchema = v.pipe(
	v.unknown(),
	v.transform((input) => {
		const result = v.safeParse(RadarrDefaultsSchema, input);
		return normalizeRadarrDefaults(result.success ? result.output : undefined);
	}),
);

const PublicProvidersSchema = v.pipe(
	v.unknown(),
	v.transform(asRecord),
	v.object({
		sonarr: v.fallback(
			v.pipe(
				v.unknown(),
				v.transform(asRecord),
				v.object({
					defaults: NormalizedSonarrDefaultsSchema,
					isConfigured: v.fallback(v.boolean(), false),
				}),
			),
			createDefaultPublicOptions().providers.sonarr,
		),
		radarr: v.fallback(
			v.pipe(
				v.unknown(),
				v.transform(asRecord),
				v.object({
					defaults: NormalizedRadarrDefaultsSchema,
					isConfigured: v.fallback(v.boolean(), false),
				}),
			),
			createDefaultPublicOptions().providers.radarr,
		),
	}),
);

export const PublicOptionsSchema = v.pipe(
	v.unknown(),
	v.transform(asRecord),
	v.object({
		providers: v.fallback(
			PublicProvidersSchema,
			createDefaultPublicOptions().providers,
		),
		seerr: v.fallback(
			v.pipe(
				v.unknown(),
				v.transform(asRecord),
				v.object({
					isConfigured: v.fallback(v.boolean(), false),
				}),
			),
			createDefaultPublicOptions().seerr,
		),
		ui: v.fallback(UiOptionsSchema, createDefaultUiOptions()),
		debugLogging: v.fallback(v.boolean(), false),
	}),
);
