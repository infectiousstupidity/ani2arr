/** Runtime-validated extension settings schema and default factories owned by settings. */

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
import type { SeerrConnection } from "@/providers/seerr/types";
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

export const createDefaultSeerrConnection = (): SeerrConnection => ({
	url: "",
	auth: { mode: "session" },
});

export const createDefaultPrivateConnections = (): PrivateConnections => ({
	sonarr: createDefaultProviderConnection(),
	radarr: createDefaultProviderConnection(),
	seerr: createDefaultSeerrConnection(),
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
	seerr: createDefaultSeerrConnection(),
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
		seerr: { isConfigured: false, authMode: null },
		ui: defaults.ui,
		debugLogging: false,
	};
};

const ProviderCredentialsSchema = v.object({
	url: v.string(),
	apiKey: v.string(),
});

const SeerrAccountSummarySchema = v.object({
	id: v.pipe(v.number(), v.finite(), v.integer(), v.minValue(1)),
	displayName: v.string(),
	avatar: v.optional(v.string()),
});

const SeerrAuthSchema = v.union([
	v.object({ mode: v.literal("session") }),
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// LEGACY: Remove after upgrades from API-key-only Seerr records are unsupported.
export function migrateLegacySeerrConnection(value: unknown): SeerrConnection {
	const current = v.safeParse(SeerrConnectionSchema, value);
	if (current.success) {
		const account = current.output.account;
		return {
			url: current.output.url,
			auth: current.output.auth,
			...(account
				? {
						account: {
							id: account.id,
							displayName: account.displayName,
							...(account.avatar === undefined
								? {}
								: { avatar: account.avatar }),
						},
					}
				: {}),
		};
	}

	if (!isRecord(value)) return createDefaultSeerrConnection();

	const url = typeof value.url === "string" ? value.url.trim() : "";
	const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";
	if (!url || !apiKey) return createDefaultSeerrConnection();

	return {
		url,
		auth: { mode: "apiKey", apiKey },
	};
}

export const PrivateConnectionsSchema = v.object({
	sonarr: ProviderCredentialsSchema,
	radarr: ProviderCredentialsSchema,
	seerr: SeerrConnectionSchema,
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
		seerr: v.pipe(v.unknown(), v.transform(migrateLegacySeerrConnection)),
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
					authMode: v.fallback(
						v.nullable(v.picklist(["session", "apiKey"])),
						null,
					),
				}),
			),
			createDefaultPublicOptions().seerr,
		),
		ui: v.fallback(UiOptionsSchema, createDefaultUiOptions()),
		debugLogging: v.fallback(v.boolean(), false),
	}),
);
