/** Focused tests for public/private settings composition and migration. */

import { describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import {
	getExtensionOptionsSnapshot,
	getPublicOptionsSnapshot,
	initializeSettingsStorage,
	resetAllSettingsSnapshot,
	saveProviderConnectionSnapshot,
	savePublicOptionsSnapshot,
	saveSeerrConnectionSnapshot,
	watchExtensionOptionsSnapshot,
} from "@/settings/store";
import {
	createDefaultExtensionOptions,
	createDefaultPrivateConnections,
	createDefaultPublicOptions,
} from "@/settings/schema";
import type { ExtensionOptions, PublicOptions } from "@/settings/types";

const PUBLIC_OPTIONS_STORAGE_KEY = "publicOptions";
const PRIVATE_CONNECTIONS_STORAGE_KEY = "privateConnections";
const SONARR_SECRETS_STORAGE_KEY = "sonarrSecrets";
const RADARR_SECRETS_STORAGE_KEY = "radarrSecrets";
const SEERR_SECRETS_STORAGE_KEY = "seerrSecrets";
const LEGACY_STORAGE_KEYS = [
	SONARR_SECRETS_STORAGE_KEY,
	RADARR_SECRETS_STORAGE_KEY,
	SEERR_SECRETS_STORAGE_KEY,
] as const;
const LEGACY_STORAGE_AND_META_KEYS = LEGACY_STORAGE_KEYS.flatMap((key) => [
	key,
	`${key}$`,
]);

const EMPTY_PRIVATE_CONNECTIONS = createDefaultPrivateConnections();

async function expectLegacyStorageRemoved(): Promise<void> {
	await expect(
		browser.storage.local.get(LEGACY_STORAGE_AND_META_KEYS),
	).resolves.toEqual({});
}

describe("options store helpers", () => {
	it("falls back from malformed public options without healing on read", async () => {
		const malformedPublicOptions = {
			debugLogging: true,
		} as unknown as PublicOptions;

		await browser.storage.local.set({
			[PUBLIC_OPTIONS_STORAGE_KEY]: malformedPublicOptions,
		});

		await expect(getExtensionOptionsSnapshot()).resolves.toEqual({
			...createDefaultExtensionOptions(),
			debugLogging: true,
		});
		await expect(
			browser.storage.local.get(PUBLIC_OPTIONS_STORAGE_KEY),
		).resolves.toEqual({
			[PUBLIC_OPTIONS_STORAGE_KEY]: malformedPublicOptions,
		});
	});

	it("defaults malformed private connections without discarding valid siblings", async () => {
		await browser.storage.local.set({
			[PUBLIC_OPTIONS_STORAGE_KEY]: createDefaultPublicOptions(),
			[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
				sonarr: { url: 123, apiKey: "sonarr-key" },
				radarr: {
					url: "https://radarr.example",
					apiKey: "radarr-key",
				},
				seerr: { url: "https://seerr.example", apiKey: 123 },
			},
		});

		const snapshot = await getExtensionOptionsSnapshot();

		expect(snapshot.providers.sonarr).toMatchObject({ url: "", apiKey: "" });
		expect(snapshot.providers.radarr).toMatchObject({
			url: "https://radarr.example",
			apiKey: "radarr-key",
		});
		expect(snapshot.seerr).toEqual({
			url: "",
			auth: { mode: "session" },
		});
	});

	it("does not migrate legacy connections during ordinary reads", async () => {
		const legacySonarr = {
			url: "https://sonarr.example",
			apiKey: "legacy-key",
		};
		await browser.storage.local.set({
			[SONARR_SECRETS_STORAGE_KEY]: legacySonarr,
		});

		const snapshot = await getExtensionOptionsSnapshot();

		expect(snapshot.providers.sonarr).toMatchObject({ url: "", apiKey: "" });
		await expect(
			browser.storage.local.get(PRIVATE_CONNECTIONS_STORAGE_KEY),
		).resolves.toEqual({});
		await expect(
			browser.storage.local.get(SONARR_SECRETS_STORAGE_KEY),
		).resolves.toEqual({
			[SONARR_SECRETS_STORAGE_KEY]: legacySonarr,
		});
	});

	describe("settings storage initialization", () => {
		it("migrates legacy provider records into one private record", async () => {
			await browser.storage.local.set({
				[SONARR_SECRETS_STORAGE_KEY]: {
					url: "https://sonarr.example",
					apiKey: "sonarr-key",
				},
				[RADARR_SECRETS_STORAGE_KEY]: {
					url: "https://radarr.example",
					apiKey: "radarr-key",
				},
				[SEERR_SECRETS_STORAGE_KEY]: {
					url: "https://seerr.example",
					apiKey: "seerr-key",
				},
				[`${SONARR_SECRETS_STORAGE_KEY}$`]: { v: 1 },
				[`${RADARR_SECRETS_STORAGE_KEY}$`]: { v: 1 },
				[`${SEERR_SECRETS_STORAGE_KEY}$`]: { v: 1 },
			});

			await initializeSettingsStorage();

			await expect(
				browser.storage.local.get(PRIVATE_CONNECTIONS_STORAGE_KEY),
			).resolves.toEqual({
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
					sonarr: {
						url: "https://sonarr.example",
						apiKey: "sonarr-key",
					},
					radarr: {
						url: "https://radarr.example",
						apiKey: "radarr-key",
					},
					seerr: {
						url: "https://seerr.example",
						auth: { mode: "apiKey", apiKey: "seerr-key" },
					},
				},
			});
			await expectLegacyStorageRemoved();
		});

		it("migrates an embedded API-key Seerr record", async () => {
			await browser.storage.local.set({
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
					...EMPTY_PRIVATE_CONNECTIONS,
					seerr: {
						url: "https://seerr.example/base",
						apiKey: "legacy-key",
					},
				},
			});

			await initializeSettingsStorage();

			await expect(getExtensionOptionsSnapshot()).resolves.toMatchObject({
				seerr: {
					url: "https://seerr.example/base",
					auth: { mode: "apiKey", apiKey: "legacy-key" },
				},
			});
		});

		it("keeps a configured private session over a legacy API key", async () => {
			const privateConnections = {
				...EMPTY_PRIVATE_CONNECTIONS,
				seerr: {
					url: "https://new-seerr.example",
					auth: { mode: "session" as const },
					account: { id: 7, displayName: "Friend" },
				},
			};
			await browser.storage.local.set({
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: privateConnections,
				[SEERR_SECRETS_STORAGE_KEY]: {
					url: "https://legacy-seerr.example",
					apiKey: "legacy-key",
				},
			});

			await initializeSettingsStorage();

			await expect(
				browser.storage.local.get(PRIVATE_CONNECTIONS_STORAGE_KEY),
			).resolves.toEqual({
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: privateConnections,
			});
			await expectLegacyStorageRemoved();
		});

		it("uses meaningful legacy Arr connections per provider", async () => {
			await browser.storage.local.set({
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
					...EMPTY_PRIVATE_CONNECTIONS,
					sonarr: {
						url: "https://new-sonarr.example",
						apiKey: "new-key",
					},
				},
				[SONARR_SECRETS_STORAGE_KEY]: {
					url: "https://legacy-sonarr.example",
					apiKey: "legacy-sonarr-key",
				},
				[RADARR_SECRETS_STORAGE_KEY]: {
					url: "https://legacy-radarr.example",
					apiKey: "legacy-radarr-key",
				},
			});

			await initializeSettingsStorage();

			await expect(
				browser.storage.local.get(PRIVATE_CONNECTIONS_STORAGE_KEY),
			).resolves.toEqual({
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
					sonarr: {
						url: "https://new-sonarr.example",
						apiKey: "new-key",
					},
					radarr: {
						url: "https://legacy-radarr.example",
						apiKey: "legacy-radarr-key",
					},
					seerr: EMPTY_PRIVATE_CONNECTIONS.seerr,
				},
			});
			await expectLegacyStorageRemoved();
		});

		it("repairs public configured state and Seerr auth mode", async () => {
			const publicOptions = createDefaultPublicOptions();
			await browser.storage.local.set({
				[PUBLIC_OPTIONS_STORAGE_KEY]: {
					...publicOptions,
					providers: {
						sonarr: {
							...publicOptions.providers.sonarr,
							isConfigured: false,
						},
						radarr: {
							...publicOptions.providers.radarr,
							isConfigured: true,
						},
					},
					seerr: { isConfigured: false, authMode: null },
				},
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
					...EMPTY_PRIVATE_CONNECTIONS,
					sonarr: {
						url: "https://sonarr.example",
						apiKey: "sonarr-key",
					},
					seerr: {
						url: "https://seerr.example",
						auth: { mode: "apiKey", apiKey: "seerr-key" },
					},
				},
			});

			await initializeSettingsStorage();

			await expect(getPublicOptionsSnapshot()).resolves.toMatchObject({
				providers: {
					sonarr: { isConfigured: true },
					radarr: { isConfigured: false },
				},
				seerr: { isConfigured: true, authMode: "apiKey" },
			});
		});

		it("does not rewrite a completed migration", async () => {
			await browser.storage.local.set({
				[SONARR_SECRETS_STORAGE_KEY]: {
					url: "https://sonarr.example",
					apiKey: "sonarr-key",
				},
			});
			await initializeSettingsStorage();
			const onChanged = vi.fn();
			browser.storage.onChanged.addListener(onChanged);

			await initializeSettingsStorage();

			expect(onChanged).not.toHaveBeenCalled();
			browser.storage.onChanged.removeListener(onChanged);
		});
	});

	it("derives public connection state instead of accepting UI flags", async () => {
		await saveProviderConnectionSnapshot("sonarr", {
			url: "https://sonarr.example",
			apiKey: "sonarr-key",
		});

		const publicOptions = await getPublicOptionsSnapshot();
		await savePublicOptionsSnapshot({
			...publicOptions,
			providers: {
				...publicOptions.providers,
				sonarr: {
					...publicOptions.providers.sonarr,
					isConfigured: false,
				},
				radarr: {
					...publicOptions.providers.radarr,
					isConfigured: true,
				},
			},
			seerr: { isConfigured: true, authMode: "apiKey" },
			debugLogging: true,
		});

		const snapshot = await getExtensionOptionsSnapshot();
		const savedPublicOptions = await getPublicOptionsSnapshot();

		expect(snapshot.debugLogging).toBe(true);
		expect(snapshot.providers.sonarr.apiKey).toBe("sonarr-key");
		expect(savedPublicOptions.providers.sonarr.isConfigured).toBe(true);
		expect(savedPublicOptions.providers.radarr.isConfigured).toBe(false);
		expect(savedPublicOptions.seerr).toEqual({
			isConfigured: false,
			authMode: null,
		});
	});

	it("saving one Arr provider preserves the other private connections", async () => {
		const seerrConnection = {
			url: "https://seerr.example",
			auth: { mode: "session" as const },
			account: { id: 3, displayName: "User" },
		};
		await browser.storage.local.set({
			[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
				sonarr: { url: "", apiKey: "" },
				radarr: {
					url: "https://radarr.example",
					apiKey: "radarr-key",
				},
				seerr: seerrConnection,
			},
		});

		await saveProviderConnectionSnapshot("sonarr", {
			url: "https://sonarr.example",
			apiKey: "sonarr-key",
		});

		await expect(
			browser.storage.local.get(PRIVATE_CONNECTIONS_STORAGE_KEY),
		).resolves.toEqual({
			[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
				sonarr: {
					url: "https://sonarr.example",
					apiKey: "sonarr-key",
				},
				radarr: {
					url: "https://radarr.example",
					apiKey: "radarr-key",
				},
				seerr: seerrConnection,
			},
		});
	});

	it("stores a normalized Seerr session without exposing account data", async () => {
		await saveSeerrConnectionSnapshot({
			url: "https://seerr.example",
			auth: { mode: "session" },
			account: {
				id: 7,
				displayName: " Friend ",
				avatar: " /avatar.png ",
			},
		});

		await expect(getExtensionOptionsSnapshot()).resolves.toMatchObject({
			seerr: {
				url: "https://seerr.example",
				auth: { mode: "session" },
				account: {
					id: 7,
					displayName: "Friend",
					avatar: "/avatar.png",
				},
			},
		});
		await expect(getPublicOptionsSnapshot()).resolves.toMatchObject({
			seerr: { isConfigured: true, authMode: "session" },
		});
		expect(JSON.stringify(await getPublicOptionsSnapshot())).not.toContain(
			"Friend",
		);
	});

	it("stores API-key mode without exposing the key publicly", async () => {
		await saveSeerrConnectionSnapshot({
			url: "https://seerr.example",
			auth: { mode: "apiKey", apiKey: "seerr-key" },
		});

		await expect(getExtensionOptionsSnapshot()).resolves.toMatchObject({
			seerr: {
				url: "https://seerr.example",
				auth: { mode: "apiKey", apiKey: "seerr-key" },
			},
		});
		const publicOptions = await getPublicOptionsSnapshot();
		expect(publicOptions.seerr).toEqual({
			isConfigured: true,
			authMode: "apiKey",
		});
		expect(JSON.stringify(publicOptions)).not.toContain("seerr-key");
	});

	it("reset clears public options, private connections, and legacy keys", async () => {
		await browser.storage.local.set({
			[SONARR_SECRETS_STORAGE_KEY]: {
				url: "https://legacy-sonarr.example",
				apiKey: "legacy-key",
			},
			[`${SONARR_SECRETS_STORAGE_KEY}$`]: { v: 1 },
		});
		await saveProviderConnectionSnapshot("sonarr", {
			url: "https://sonarr.example",
			apiKey: "sonarr-key",
		});

		await resetAllSettingsSnapshot();

		await expect(getExtensionOptionsSnapshot()).resolves.toEqual(
			createDefaultExtensionOptions(),
		);
		await expect(
			browser.storage.local.get([
				PUBLIC_OPTIONS_STORAGE_KEY,
				PRIVATE_CONNECTIONS_STORAGE_KEY,
			]),
		).resolves.toEqual({
			[PUBLIC_OPTIONS_STORAGE_KEY]: createDefaultPublicOptions(),
			[PRIVATE_CONNECTIONS_STORAGE_KEY]: EMPTY_PRIVATE_CONNECTIONS,
		});
		await expectLegacyStorageRemoved();
	});

	it("watches public options and the private record but ignores legacy keys", async () => {
		const snapshots: ExtensionOptions[] = [];
		const unsubscribe = watchExtensionOptionsSnapshot((snapshot) => {
			snapshots.push(snapshot);
		});

		await browser.storage.local.set({
			[SONARR_SECRETS_STORAGE_KEY]: {
				url: "https://legacy-sonarr.example",
				apiKey: "legacy-key",
			},
		});
		await browser.storage.local.set({
			[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
				...EMPTY_PRIVATE_CONNECTIONS,
				sonarr: {
					url: "https://sonarr.example",
					apiKey: "sonarr-key",
				},
			},
		});
		await vi.waitFor(() => expect(snapshots).toHaveLength(1));
		await browser.storage.local.set({
			[PUBLIC_OPTIONS_STORAGE_KEY]: {
				...createDefaultPublicOptions(),
				debugLogging: true,
			},
		});
		await vi.waitFor(() => expect(snapshots).toHaveLength(2));

		unsubscribe();

		expect(snapshots[0]?.providers.sonarr.apiKey).toBe("sonarr-key");
		expect(snapshots[1]?.debugLogging).toBe(true);
	});
});
