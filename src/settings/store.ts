/** Settings persistence and public/private snapshot helpers owned by the options domain. */
// src/settings/store.ts

import { storage } from "@wxt-dev/storage";
import * as v from "valibot";
import { stripSonarrFormStateForDefaults } from "@/providers/sonarr/form-state";
import { stripRadarrFormStateForDefaults } from "@/providers/radarr/form-state";
import type {
	Provider,
	ProviderCredentials,
} from "@/providers/types";
import {
	type ConnectionKind,
	normalizeConnectionInput,
} from "./connection-config";
import {
	LegacyProviderCredentialsSchema,
	PrivateConnectionsSchema,
	PublicOptionsSchema,
	StoredPrivateConnectionsSchema,
	createDefaultPrivateConnections,
	createDefaultProviderConnection,
	createDefaultPublicOptions,
} from "./schema";
import type {
	ExtensionOptions,
	PrivateConnections,
	PublicOptions,
} from "./types";

const PUBLIC_OPTIONS_STORAGE_KEY = "local:publicOptions";
const PRIVATE_CONNECTIONS_STORAGE_KEY = "local:privateConnections";

// LEGACY: Remove after upgrades from per-provider secret records are unsupported.
const LEGACY_CONNECTION_STORAGE_KEYS = [
	"local:sonarrSecrets",
	"local:radarrSecrets",
	"local:seerrSecrets",
] as const;

export const PUBLIC_OPTIONS_CHANGE_KEY = PUBLIC_OPTIONS_STORAGE_KEY.replace(
	/^local:/,
	"",
);

function hasConfiguredCredentials(credentials: ProviderCredentials): boolean {
	return Boolean(credentials.url.trim() && credentials.apiKey.trim());
}

function withConnectionStatus(
	options: PublicOptions,
	connections: PrivateConnections,
): PublicOptions {
	return {
		...options,
		providers: {
			sonarr: {
				...options.providers.sonarr,
				isConfigured: hasConfiguredCredentials(connections.sonarr),
			},
			radarr: {
				...options.providers.radarr,
				isConfigured: hasConfiguredCredentials(connections.radarr),
			},
		},
		seerr: {
			isConfigured: hasConfiguredCredentials(connections.seerr),
		},
	};
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

function parsePublicOptions(raw: unknown): PublicOptions {
	return v.parse(PublicOptionsSchema, raw);
}

function parsePrivateConnections(raw: unknown): PrivateConnections {
	return v.parse(StoredPrivateConnectionsSchema, raw);
}

function combineExtensionOptions(
	publicSettings: PublicOptions,
	privateConnections: PrivateConnections,
): ExtensionOptions {
	return {
		providers: {
			sonarr: {
				...privateConnections.sonarr,
				defaults: publicSettings.providers.sonarr.defaults,
			},
			radarr: {
				...privateConnections.radarr,
				defaults: publicSettings.providers.radarr.defaults,
			},
		},
		seerr: privateConnections.seerr,
		ui: publicSettings.ui,
		debugLogging: publicSettings.debugLogging,
	};
}

function preparePublicOptionsForStorage(
	options: PublicOptions,
): PublicOptions {
	return {
		...options,
		providers: {
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
}

async function writePublicOptions(options: PublicOptions): Promise<void> {
	await publicOptions.setValue(preparePublicOptionsForStorage(options));
}

function hasMatchingConnectionStatus(
	left: PublicOptions,
	right: PublicOptions,
): boolean {
	return (
		left.providers.sonarr.isConfigured ===
			right.providers.sonarr.isConfigured &&
		left.providers.radarr.isConfigured ===
			right.providers.radarr.isConfigured &&
		left.seerr.isConfigured === right.seerr.isConfigured
	);
}

async function syncPublicConnectionStatus(
	connections: PrivateConnections,
): Promise<void> {
	const current = parsePublicOptions(await publicOptions.getValue());
	const projected = withConnectionStatus(current, connections);
	if (!hasMatchingConnectionStatus(current, projected)) {
		await writePublicOptions(projected);
	}
}

async function writeConnectionState(
	connections: PrivateConnections,
): Promise<void> {
	await privateConnectionsStorage.setValue(connections);
	await syncPublicConnectionStatus(connections);
}

let connectionWrites: Promise<void> = Promise.resolve();

async function enqueueConnectionWrite(
	write: () => Promise<void>,
): Promise<void> {
	const next = connectionWrites
		.catch(() => {})
		.then(write);

	connectionWrites = next.then(
		() => {},
		() => {},
	);

	await next;
}

async function updateConnection(
	kind: ConnectionKind,
	credentials: ProviderCredentials,
): Promise<void> {
	await enqueueConnectionWrite(async () => {
		const current = parsePrivateConnections(
			await privateConnectionsStorage.getValue(),
		);
		await writeConnectionState({
			...current,
			[kind]: credentials,
		});
	});
}

function chooseMigratedConnection(
	newValue: unknown,
	legacyValue: unknown,
): ProviderCredentials {
	const next = v.parse(LegacyProviderCredentialsSchema, newValue);
	if (next.url && next.apiKey) return next;
	return v.parse(LegacyProviderCredentialsSchema, legacyValue);
}

async function removeLegacyConnectionStorage(): Promise<void> {
	const [values, metas] = await Promise.all([
		storage.getItems([...LEGACY_CONNECTION_STORAGE_KEYS]),
		storage.getMetas([...LEGACY_CONNECTION_STORAGE_KEYS]),
	]);
	const keysToRemove = LEGACY_CONNECTION_STORAGE_KEYS.flatMap((key, index) => {
		const hasValue = values[index]?.value != null;
		const meta = metas[index]?.meta;
		const hasMeta = meta && Object.keys(meta).length > 0;
		return hasValue || hasMeta
			? [{ key, options: { removeMeta: true } }]
			: [];
	});
	if (keysToRemove.length > 0) {
		await storage.removeItems(keysToRemove);
	}
}

export async function initializeSettingsStorage(): Promise<void> {
	const [storedConnections, legacySonarr, legacyRadarr, legacySeerr] =
		await Promise.all([
			storage.getItem<unknown>(PRIVATE_CONNECTIONS_STORAGE_KEY),
			...LEGACY_CONNECTION_STORAGE_KEYS.map((key) =>
				storage.getItem<unknown>(key),
			),
		]);
	const current = parsePrivateConnections(storedConnections);
	const migrated = {
		sonarr: chooseMigratedConnection(current.sonarr, legacySonarr),
		radarr: chooseMigratedConnection(current.radarr, legacyRadarr),
		seerr: chooseMigratedConnection(current.seerr, legacySeerr),
	};
	const hasCompleteStoredRecord = v.safeParse(
		PrivateConnectionsSchema,
		storedConnections,
	).success;
	const migrationChangedConnections = (
		Object.keys(migrated) as Array<keyof PrivateConnections>
	).some(
		(kind) =>
			migrated[kind].url !== current[kind].url ||
			migrated[kind].apiKey !== current[kind].apiKey,
	);
	await (!hasCompleteStoredRecord || migrationChangedConnections
		? enqueueConnectionWrite(() => writeConnectionState(migrated))
		: syncPublicConnectionStatus(migrated));

	await removeLegacyConnectionStorage();
}

export async function getExtensionOptionsSnapshot(): Promise<ExtensionOptions> {
	const [storedPublicOptions, storedPrivateConnections] = await Promise.all([
		publicOptions.getValue(),
		privateConnectionsStorage.getValue(),
	]);

	return combineExtensionOptions(
		parsePublicOptions(storedPublicOptions),
		parsePrivateConnections(storedPrivateConnections),
	);
}

export async function savePublicOptionsSnapshot(
	options: PublicOptions,
): Promise<void> {
	const connections = parsePrivateConnections(
		await privateConnectionsStorage.getValue(),
	);
	await writePublicOptions(
		withConnectionStatus(parsePublicOptions(options), connections),
	);
}

export async function saveProviderConnectionSnapshot(
	provider: Provider,
	credentials: ProviderCredentials | null,
): Promise<ExtensionOptions> {
	const normalized = credentials
		? normalizeConnectionInput(credentials, provider)
		: null;
	const connection = normalized
		? { url: normalized.url, apiKey: normalized.apiKey }
		: createDefaultProviderConnection();
	await updateConnection(provider, connection);
	return getExtensionOptionsSnapshot();
}

export async function saveSeerrConnectionSnapshot(
	credentials: ProviderCredentials | null,
): Promise<ExtensionOptions> {
	const normalized = credentials
		? normalizeConnectionInput(credentials, "seerr")
		: null;
	const connection = normalized
		? { url: normalized.url, apiKey: normalized.apiKey }
		: createDefaultProviderConnection();
	await updateConnection("seerr", connection);
	return getExtensionOptionsSnapshot();
}

export async function resetAllSettingsSnapshot(): Promise<void> {
	await writePublicOptions(createDefaultPublicOptions());
	await enqueueConnectionWrite(() =>
		writeConnectionState(createDefaultPrivateConnections()),
	);
	await removeLegacyConnectionStorage();
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
