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
import type { SeerrConnection } from "@/providers/seerr/types";
import { logger } from "@/shared/utils/logger";
import {
	ExtensionOptionsSchema,
	createDefaultExtensionOptions,
	createDefaultSeerrConnection,
	migrateLegacySeerrConnection,
} from "./schema";
import { UiOptionsSchema } from "./ui-schema";
import type { ExtensionOptions, PublicOptions } from "./types";
import {
	hasConfiguredProviderCredentials,
	normalizeProviderConnectionInput,
	normalizeProviderConnectionSettings,
} from "./provider-config";
import {
	getSeerrConnection,
	hasConfiguredSeerrConnection,
	normalizeSeerrConnectionInput,
	normalizeSeerrConnectionSettings,
} from "./seerr-config";

const PUBLIC_OPTIONS_STORAGE_KEY = "local:publicOptions";
const SONARR_SECRETS_STORAGE_KEY = "local:sonarrSecrets";
const RADARR_SECRETS_STORAGE_KEY = "local:radarrSecrets";
const SEERR_SECRETS_STORAGE_KEY = "local:seerrSecrets";

export const PUBLIC_OPTIONS_CHANGE_KEY = PUBLIC_OPTIONS_STORAGE_KEY.replace(
	/^local:/,
	"",
);

const createDefaultProviderConnection = (): ProviderCredentials => ({
	url: "",
	apiKey: "",
});

export function toPublicOptions(settings: ExtensionOptions): PublicOptions {
	return {
		providers: {
			sonarr: {
				defaults: normalizeSonarrDefaults(settings.providers.sonarr.defaults),
				isConfigured: hasConfiguredProviderCredentials(settings, "sonarr"),
			},
			radarr: {
				defaults: normalizeRadarrDefaults(settings.providers.radarr.defaults),
				isConfigured: hasConfiguredProviderCredentials(settings, "radarr"),
			},
		},
		seerr: {
			isConfigured: hasConfiguredSeerrConnection(settings),
			authMode: getSeerrConnection(settings)?.auth.mode ?? null,
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

const sonarrConnectionStorage = storage.defineItem<ProviderCredentials>(
	SONARR_SECRETS_STORAGE_KEY,
	{
		fallback: createDefaultProviderConnection(),
		version: 1,
	},
);

const radarrConnectionStorage = storage.defineItem<ProviderCredentials>(
	RADARR_SECRETS_STORAGE_KEY,
	{
		fallback: createDefaultProviderConnection(),
		version: 1,
	},
);

const seerrConnectionStorage = storage.defineItem<SeerrConnection>(
	SEERR_SECRETS_STORAGE_KEY,
	{
		fallback: createDefaultSeerrConnection(),
		version: 2,
		migrations: {
			2: migrateLegacySeerrConnection,
		},
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
	const candidate = isRecord(raw)
		? {
				...raw,
				seerr: migrateLegacySeerrConnection(raw.seerr),
			}
		: raw;
	const result = v.safeParse(ExtensionOptionsSchema, candidate);
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
			authMode:
				seerr?.authMode === "session" || seerr?.authMode === "apiKey"
					? seerr.authMode
					: fallback.seerr.authMode,
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
		sonarrConnectionStorage.getValue(),
		radarrConnectionStorage.getValue(),
		seerrConnectionStorage.getValue(),
	]);
}

function buildRawExtensionOptionsCandidate(
	pub: unknown,
	sonarr: unknown,
	radarr: unknown,
	seerr: unknown,
): unknown {
	const publicRecord = isRecord(pub) ? pub : undefined;
	const providersRecord = getRecordProperty(publicRecord, "providers");
	const sonarrPublic = getRecordProperty(providersRecord, "sonarr") ?? {};
	const radarrPublic = getRecordProperty(providersRecord, "radarr") ?? {};

	return {
		providers: {
			sonarr: {
				...sonarrPublic,
				url: getPersistedUrl(sonarr),
				apiKey: getPersistedApiKey(sonarr),
			},
			radarr: {
				...radarrPublic,
				url: getPersistedUrl(radarr),
				apiKey: getPersistedApiKey(radarr),
			},
		},
		seerr: migrateLegacySeerrConnection(seerr),
		ui: publicRecord?.ui,
		debugLogging: publicRecord?.debugLogging,
	};
}

const getRawOptions = async () => {
	const [pub, sonarr, radarr, seerr] = await readPersistedOptionRecords();
	return buildRawExtensionOptionsCandidate(pub, sonarr, radarr, seerr);
};

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

	const sonarrConnection = normalizeProviderConnectionSettings(
		parsed,
		"sonarr",
	);
	const radarrConnection = normalizeProviderConnectionSettings(
		parsed,
		"radarr",
	);
	const seerrConnection = normalizeSeerrConnectionSettings(parsed);
	const sonarrCredentials = connectionOrDefault(sonarrConnection);
	const radarrCredentials = connectionOrDefault(radarrConnection);
	const normalizedSeerrConnection = seerrConnection
		? {
				url: seerrConnection.url,
				auth: seerrConnection.auth,
				...(seerrConnection.account
					? { account: seerrConnection.account }
					: {}),
			}
		: createDefaultSeerrConnection();

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
		seerr: normalizedSeerrConnection,
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

	await Promise.all([
		sonarrConnectionStorage.setValue(sonarrCredentials),
		radarrConnectionStorage.setValue(radarrCredentials),
		seerrConnectionStorage.setValue(normalizedSeerrConnection),
	]);
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
		? normalizeProviderConnectionInput(credentials, provider)
		: null;
	const connection = {
		url: normalized?.url ?? "",
		apiKey: normalized?.apiKey ?? "",
	};
	const storageItem =
		provider === "sonarr" ? sonarrConnectionStorage : radarrConnectionStorage;
	await storageItem.setValue(connection);

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
	connection: SeerrConnection | null,
): Promise<ExtensionOptions> {
	const normalized = connection
		? normalizeSeerrConnectionInput(connection)
		: null;
	const storedConnection = normalized
		? {
				url: normalized.url,
				auth: normalized.auth,
				...(normalized.account ? { account: normalized.account } : {}),
			}
		: createDefaultSeerrConnection();
	await seerrConnectionStorage.setValue(storedConnection);

	const currentPublicOptions = await getPublicOptionsSnapshot();
	await publicOptions.setValue({
		...currentPublicOptions,
		seerr: {
			isConfigured: normalized !== null,
			authMode: normalized?.auth.mode ?? null,
		},
	});
	return getExtensionOptionsSnapshot();
}

export async function resetAllSettingsSnapshot(): Promise<void> {
	await writeExtensionOptionsSnapshot(createDefaultExtensionOptions());
}

export async function getPublicOptionsSnapshot(): Promise<PublicOptions> {
	const [storedPublicOptions, storedSeerrConnection] = await Promise.all([
		publicOptions.getValue(),
		seerrConnectionStorage.getValue(),
	]);
	const parsed = parsePublicOptions(storedPublicOptions);
	const seerr = migrateLegacySeerrConnection(storedSeerrConnection);
	const settings = {
		...createDefaultExtensionOptions(),
		seerr,
	};

	return {
		...parsed,
		seerr: {
			isConfigured: hasConfiguredSeerrConnection(settings),
			authMode: getSeerrConnection(settings)?.auth.mode ?? null,
		},
	};
}

export function watchExtensionOptionsSnapshot(
	callback: (snapshot: ExtensionOptions) => void | Promise<void>,
): () => void {
	const refresh = () => {
		void getExtensionOptionsSnapshot().then(callback);
	};
	const unsubscribes = [
		publicOptions.watch(refresh),
		sonarrConnectionStorage.watch(refresh),
		radarrConnectionStorage.watch(refresh),
		seerrConnectionStorage.watch(refresh),
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
