/** Settings persistence and public/private snapshot helpers owned by the options domain. */
// src/settings/store.ts

import { storage } from "@wxt-dev/storage";
import * as v from "valibot";
import {
	normalizeSonarrDefaults,
	stripSonarrFormStateForDefaults,
} from "@/providers/sonarr/form-state";
import {
	normalizeRadarrDefaults,
	stripRadarrFormStateForDefaults,
} from "@/providers/radarr/form-state";
import type {
	Provider,
	ProviderCredentials,
} from "@/providers/types";
import { logger } from "@/shared/utils/logger";
import {
	hasConfiguredConnectionCredentials,
	normalizeConnectionInput,
	normalizeConnectionSettings,
} from "./connection-config";
import {
	ExtensionOptionsSchema,
	createDefaultExtensionOptions,
} from "./schema";
import { UiOptionsSchema } from "./ui-schema";
import type { ExtensionOptions, PublicOptions } from "./types";

const PUBLIC_OPTIONS_STORAGE_KEY = "local:publicOptions";
const PRIVATE_CONNECTIONS_STORAGE_KEY = "local:privateConnections";
const SONARR_SECRETS_STORAGE_KEY = "local:sonarrSecrets";
const RADARR_SECRETS_STORAGE_KEY = "local:radarrSecrets";
const SEERR_SECRETS_STORAGE_KEY = "local:seerrSecrets";

interface PrivateConnections {
	sonarr: ProviderCredentials;
	radarr: ProviderCredentials;
	seerr: ProviderCredentials;
}

export const PUBLIC_OPTIONS_CHANGE_KEY = PUBLIC_OPTIONS_STORAGE_KEY.replace(
	/^local:/,
	"",
);

const createDefaultProviderConnection = (): ProviderCredentials => ({
	url: "",
	apiKey: "",
});

const createDefaultPrivateConnections = (): PrivateConnections => ({
	sonarr: createDefaultProviderConnection(),
	radarr: createDefaultProviderConnection(),
	seerr: createDefaultProviderConnection(),
});

export function toPublicOptions(settings: ExtensionOptions): PublicOptions {
	return {
		providers: {
			sonarr: {
				defaults: normalizeSonarrDefaults(settings.providers.sonarr.defaults),
				isConfigured: hasConfiguredConnectionCredentials(settings, "sonarr"),
			},
			radarr: {
				defaults: normalizeRadarrDefaults(settings.providers.radarr.defaults),
				isConfigured: hasConfiguredConnectionCredentials(settings, "radarr"),
			},
		},
		seerr: {
			isConfigured: hasConfiguredConnectionCredentials(settings, "seerr"),
		},
		ui: settings.ui,
		debugLogging: settings.debugLogging,
	};
}

function createDefaultPublicOptions(): PublicOptions {
	return toPublicOptions(createDefaultExtensionOptions());
}

const publicOptions = storage.defineItem<PublicOptions>(
	PUBLIC_OPTIONS_STORAGE_KEY,
	{
		fallback: createDefaultPublicOptions(),
		version: 1,
	},
);

const privateConnectionsStorage = storage.defineItem<PrivateConnections>(
	PRIVATE_CONNECTIONS_STORAGE_KEY,
	{
		fallback: createDefaultPrivateConnections(),
		version: 1,
	},
);

// LEGACY: Remove after Task 12 deletes migrated per-service secret records.
const legacySonarrConnectionStorage = storage.defineItem<ProviderCredentials>(
	SONARR_SECRETS_STORAGE_KEY,
	{
		fallback: createDefaultProviderConnection(),
		version: 1,
	},
);

// LEGACY: Remove after Task 12 deletes migrated per-service secret records.
const legacyRadarrConnectionStorage = storage.defineItem<ProviderCredentials>(
	RADARR_SECRETS_STORAGE_KEY,
	{
		fallback: createDefaultProviderConnection(),
		version: 1,
	},
);

// LEGACY: Remove after Task 12 deletes migrated per-service secret records.
const legacySeerrConnectionStorage = storage.defineItem<ProviderCredentials>(
	SEERR_SECRETS_STORAGE_KEY,
	{
		fallback: createDefaultProviderConnection(),
		version: 1,
	},
);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordProperty(
	record: Record<string, unknown> | undefined,
	key: string,
): Record<string, unknown> | undefined {
	const value = record?.[key];
	return isRecord(value) ? value : undefined;
}

export const parseExtensionOptions = (raw: unknown): ExtensionOptions => {
	const result = v.safeParse(ExtensionOptionsSchema, raw);
	if (result.success) {
		return {
			...result.output,
			providers: {
				...result.output.providers,
				sonarr: {
					...result.output.providers.sonarr,
					defaults: normalizeSonarrDefaults(
						result.output.providers.sonarr.defaults,
					),
				},
				radarr: {
					...result.output.providers.radarr,
					defaults: normalizeRadarrDefaults(
						result.output.providers.radarr.defaults,
					),
				},
			},
		};
	}
	logger.warn("Storage mismatch, applying defaults", result.issues);
	return parseExtensionOptions(v.parse(ExtensionOptionsSchema, raw ?? {}));
};

function getPersistedApiKey(record: unknown): string {
	return isRecord(record) && typeof record.apiKey === "string"
		? record.apiKey
		: "";
}

function getPersistedUrl(record: unknown): string {
	return isRecord(record) && typeof record.url === "string" ? record.url : "";
}

function parsePersistedConnection(record: unknown): ProviderCredentials {
	return {
		url: getPersistedUrl(record),
		apiKey: getPersistedApiKey(record),
	};
}

function parsePrivateConnection(record: unknown): ProviderCredentials {
	if (
		!isRecord(record) ||
		typeof record.url !== "string" ||
		typeof record.apiKey !== "string"
	) {
		return createDefaultProviderConnection();
	}

	return { url: record.url, apiKey: record.apiKey };
}

function parsePrivateConnections(raw: unknown): PrivateConnections {
	const record = isRecord(raw) ? raw : undefined;
	return {
		sonarr: parsePrivateConnection(record?.sonarr),
		radarr: parsePrivateConnection(record?.radarr),
		seerr: parsePrivateConnection(record?.seerr),
	};
}

function isCompletePrivateConnections(raw: unknown): raw is PrivateConnections {
	if (!isRecord(raw)) return false;

	return [raw.sonarr, raw.radarr, raw.seerr].every(
		(connection) =>
			isRecord(connection) &&
			typeof connection.url === "string" &&
			typeof connection.apiKey === "string",
	);
}

function safeNormalizeSonarrDefaults(
	input: unknown,
): PublicOptions["providers"]["sonarr"]["defaults"] {
	try {
		return normalizeSonarrDefaults(input as never);
	} catch {
		return createDefaultPublicOptions().providers.sonarr.defaults;
	}
}

function safeNormalizeRadarrDefaults(
	input: unknown,
): PublicOptions["providers"]["radarr"]["defaults"] {
	try {
		return normalizeRadarrDefaults(input as never);
	} catch {
		return createDefaultPublicOptions().providers.radarr.defaults;
	}
}

function parsePublicOptions(raw: unknown): PublicOptions {
	const fallback = createDefaultPublicOptions();
	const record = isRecord(raw) ? raw : {};
	const providers = getRecordProperty(record, "providers");
	const sonarr = getRecordProperty(providers, "sonarr");
	const radarr = getRecordProperty(providers, "radarr");
	const seerr = getRecordProperty(record, "seerr");
	const uiResult = v.safeParse(UiOptionsSchema, record.ui);
	const ui = uiResult.success ? uiResult.output : fallback.ui;

	return {
		providers: {
			sonarr: {
				defaults: safeNormalizeSonarrDefaults(sonarr?.defaults),
				isConfigured:
					typeof sonarr?.isConfigured === "boolean"
						? sonarr.isConfigured
						: fallback.providers.sonarr.isConfigured,
			},
			radarr: {
				defaults: safeNormalizeRadarrDefaults(radarr?.defaults),
				isConfigured:
					typeof radarr?.isConfigured === "boolean"
						? radarr.isConfigured
						: fallback.providers.radarr.isConfigured,
			},
		},
		seerr: {
			isConfigured:
				typeof seerr?.isConfigured === "boolean"
					? seerr.isConfigured
					: fallback.seerr.isConfigured,
		},
		ui,
		debugLogging:
			typeof record.debugLogging === "boolean"
				? record.debugLogging
				: fallback.debugLogging,
	};
}

async function readPersistedOptionRecords() {
	return Promise.all([
		publicOptions.getValue(),
		privateConnectionsStorage.getValue(),
	]);
}

function buildRawExtensionOptionsCandidate(
	pub: unknown,
	privateConnections: unknown,
): unknown {
	const publicRecord = isRecord(pub) ? pub : undefined;
	const providersRecord = getRecordProperty(publicRecord, "providers");
	const sonarrPublic = getRecordProperty(providersRecord, "sonarr") ?? {};
	const radarrPublic = getRecordProperty(providersRecord, "radarr") ?? {};
	const connections = parsePrivateConnections(privateConnections);

	return {
		providers: {
			sonarr: {
				...sonarrPublic,
				...connections.sonarr,
			},
			radarr: {
				...radarrPublic,
				...connections.radarr,
			},
		},
		seerr: connections.seerr,
		ui: publicRecord?.ui,
		debugLogging: publicRecord?.debugLogging,
	};
}

const getRawOptions = async () => {
	const [pub, privateConnections] = await readPersistedOptionRecords();
	return buildRawExtensionOptionsCandidate(pub, privateConnections);
};

let privateConnectionWrites: Promise<void> = Promise.resolve();

async function updatePrivateConnections(
	update: (connections: PrivateConnections) => PrivateConnections,
): Promise<void> {
	const next = privateConnectionWrites
		.catch(() => {})
		.then(async () => {
			const current = parsePrivateConnections(
				await privateConnectionsStorage.getValue(),
			);
			await privateConnectionsStorage.setValue(update(current));
		});

	privateConnectionWrites = next.then(
		() => {},
		() => {},
	);

	await next;
}

async function setPrivateConnections(
	connections: PrivateConnections,
): Promise<void> {
	await updatePrivateConnections(() => connections);
}

export async function initializeSettingsStorage(): Promise<void> {
	const storedConnections = await storage.getItem<unknown>(
		PRIVATE_CONNECTIONS_STORAGE_KEY,
	);
	if (isCompletePrivateConnections(storedConnections)) return;

	const [sonarr, radarr, seerr] = await Promise.all([
		legacySonarrConnectionStorage.getValue(),
		legacyRadarrConnectionStorage.getValue(),
		legacySeerrConnectionStorage.getValue(),
	]);

	await setPrivateConnections({
		sonarr: parsePersistedConnection(sonarr),
		radarr: parsePersistedConnection(radarr),
		seerr: parsePersistedConnection(seerr),
	});
}

function connectionOrDefault(
	connection: ProviderCredentials | null,
): ProviderCredentials {
	return {
		url: connection?.url ?? "",
		apiKey: connection?.apiKey ?? "",
	};
}

export async function getExtensionOptionsSnapshot(): Promise<ExtensionOptions> {
	return parseExtensionOptions(await getRawOptions());
}

async function writeExtensionOptionsSnapshot(
	options: ExtensionOptions,
): Promise<void> {
	const strippedInput = {
		...options,
		providers: {
			...options.providers,
			sonarr: {
				...options.providers.sonarr,
				defaults: stripSonarrFormStateForDefaults(
					options.providers.sonarr.defaults,
				),
			},
			radarr: {
				...options.providers.radarr,
				defaults: stripRadarrFormStateForDefaults(
					options.providers.radarr.defaults,
				),
			},
		},
	};
	const parsed = parseExtensionOptions(strippedInput);

	const sonarrConnection = normalizeConnectionSettings(
		parsed,
		"sonarr",
	);
	const radarrConnection = normalizeConnectionSettings(
		parsed,
		"radarr",
	);
	const seerrConnection = normalizeConnectionSettings(parsed, "seerr");
	const sonarrCredentials = connectionOrDefault(sonarrConnection);
	const radarrCredentials = connectionOrDefault(radarrConnection);
	const seerrCredentials = connectionOrDefault(seerrConnection);

	const sanitized: ExtensionOptions = {
		...parsed,
		providers: {
			sonarr: {
				...parsed.providers.sonarr,
				...sonarrCredentials,
			},
			radarr: {
				...parsed.providers.radarr,
				...radarrCredentials,
			},
		},
		seerr: seerrCredentials,
	};

	const nextPublicOptions = toPublicOptions(sanitized);
	const persistedPublicOptions = {
		...nextPublicOptions,
		providers: {
			...nextPublicOptions.providers,
			sonarr: {
				...nextPublicOptions.providers.sonarr,
				defaults: stripSonarrFormStateForDefaults(
					nextPublicOptions.providers.sonarr.defaults,
				),
			},
			radarr: {
				...nextPublicOptions.providers.radarr,
				defaults: stripRadarrFormStateForDefaults(
					nextPublicOptions.providers.radarr.defaults,
				),
			},
		},
	} as PublicOptions;

	await setPrivateConnections({
		sonarr: sonarrCredentials,
		radarr: radarrCredentials,
		seerr: seerrCredentials,
	});
	await publicOptions.setValue(persistedPublicOptions);
}

export async function savePublicOptionsSnapshot(
	options: PublicOptions,
): Promise<void> {
	const current = await getExtensionOptionsSnapshot();
	const nextPublicOptions = toPublicOptions({
		...current,
		providers: {
			sonarr: {
				...current.providers.sonarr,
				defaults: options.providers.sonarr.defaults,
			},
			radarr: {
				...current.providers.radarr,
				defaults: options.providers.radarr.defaults,
			},
		},
		ui: options.ui,
		debugLogging: options.debugLogging,
	});
	await publicOptions.setValue({
		...nextPublicOptions,
		providers: {
			sonarr: {
				...nextPublicOptions.providers.sonarr,
				defaults: stripSonarrFormStateForDefaults(
					nextPublicOptions.providers.sonarr.defaults,
				),
			},
			radarr: {
				...nextPublicOptions.providers.radarr,
				defaults: stripRadarrFormStateForDefaults(
					nextPublicOptions.providers.radarr.defaults,
				),
			},
		},
	});
}

export async function saveProviderConnectionSnapshot(
	provider: Provider,
	credentials: ProviderCredentials | null,
): Promise<ExtensionOptions> {
	const normalized = credentials
		? normalizeConnectionInput(credentials, provider)
		: null;
	const connection = {
		url: normalized?.url ?? "",
		apiKey: normalized?.apiKey ?? "",
	};
	await updatePrivateConnections((current) => ({
		...current,
		[provider]: connection,
	}));

	const currentPublicOptions = await getPublicOptionsSnapshot();
	await publicOptions.setValue({
		...currentPublicOptions,
		providers: {
			...currentPublicOptions.providers,
			[provider]: {
				...currentPublicOptions.providers[provider],
				isConfigured: normalized !== null,
			},
		},
	});
	return getExtensionOptionsSnapshot();
}

export async function saveSeerrConnectionSnapshot(
	credentials: ProviderCredentials | null,
): Promise<ExtensionOptions> {
	const normalized = credentials
		? normalizeConnectionInput(credentials, "seerr")
		: null;
	const connection = {
		url: normalized?.url ?? "",
		apiKey: normalized?.apiKey ?? "",
	};
	await updatePrivateConnections((current) => ({
		...current,
		seerr: connection,
	}));

	const currentPublicOptions = await getPublicOptionsSnapshot();
	await publicOptions.setValue({
		...currentPublicOptions,
		seerr: {
			isConfigured: normalized !== null,
		},
	});
	return getExtensionOptionsSnapshot();
}

export async function resetAllSettingsSnapshot(): Promise<void> {
	await writeExtensionOptionsSnapshot(createDefaultExtensionOptions());
}

export async function getPublicOptionsSnapshot(): Promise<PublicOptions> {
	return parsePublicOptions(await publicOptions.getValue());
}

export function watchExtensionOptionsSnapshot(
	callback: (snapshot: ExtensionOptions) => void | Promise<void>,
): () => void {
	const refresh = () => {
		void getExtensionOptionsSnapshot().then(callback);
	};
	const unsubscribes = [
		publicOptions.watch(refresh),
		privateConnectionsStorage.watch(refresh),
	];
	return () => {
		for (const unsubscribe of unsubscribes) unsubscribe();
	};
}

export function watchPublicOptionsSnapshot(
	callback: (snapshot: PublicOptions) => void | Promise<void>,
): () => void {
	return publicOptions.watch(() => {
		void getPublicOptionsSnapshot().then(callback);
	});
}
