/** Focused tests for options parsing and public snapshot shaping. */
// src/settings/store.test.ts

import { describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import {
	PUBLIC_OPTIONS_CHANGE_KEY,
	getExtensionOptionsSnapshot,
	getPublicOptionsSnapshot,
	initializeSettingsStorage,
	resetAllSettingsSnapshot,
	saveProviderConnectionSnapshot,
	savePublicOptionsSnapshot,
	saveSeerrConnectionSnapshot,
	watchExtensionOptionsSnapshot,
	watchPublicOptionsSnapshot,
} from "@/settings/store";
import {
	createDefaultExtensionOptions,
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

const EMPTY_PRIVATE_CONNECTIONS = {
	sonarr: { url: "", apiKey: "" },
	radarr: { url: "", apiKey: "" },
	seerr: { url: "", apiKey: "" },
};

async function expectLegacyStorageRemoved(): Promise<void> {
	await expect(
		browser.storage.local.get(LEGACY_STORAGE_AND_META_KEYS),
	).resolves.toEqual({});
}

describe("options store helpers", () => {
	it("falls back to default settings for missing input", async () => {
		await expect(getExtensionOptionsSnapshot()).resolves.toEqual(
			createDefaultExtensionOptions(),
		);
	});

	it("falls back from malformed public options without healing storage on read", async () => {
		const malformedPublicOptions = {
			debugLogging: true,
		} as unknown as PublicOptions;

		await browser.storage.local.set({
			[PUBLIC_OPTIONS_STORAGE_KEY]: malformedPublicOptions,
		});

		const snapshot = await getExtensionOptionsSnapshot();

		expect(snapshot).toEqual({
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

		expect(snapshot.providers.sonarr.url).toBe("");
		expect(snapshot.providers.sonarr.apiKey).toBe("");
		expect(snapshot.providers.radarr.url).toBe("https://radarr.example");
		expect(snapshot.providers.radarr.apiKey).toBe("radarr-key");
		expect(snapshot.seerr.url).toBe("");
		expect(snapshot.seerr.apiKey).toBe("");
	});

	it("does not migrate legacy connections during ordinary snapshot reads", async () => {
		await browser.storage.local.set({
			[SONARR_SECRETS_STORAGE_KEY]: {
				url: "https://sonarr.example",
				apiKey: "legacy-sonarr-key",
			},
		});

		const snapshot = await getExtensionOptionsSnapshot();

		expect(snapshot.providers.sonarr).toMatchObject({ url: "", apiKey: "" });
		await expect(
			browser.storage.local.get(PRIVATE_CONNECTIONS_STORAGE_KEY),
		).resolves.toEqual({});
		await expect(
			browser.storage.local.get(SONARR_SECRETS_STORAGE_KEY),
		).resolves.toEqual({
			[SONARR_SECRETS_STORAGE_KEY]: {
				url: "https://sonarr.example",
				apiKey: "legacy-sonarr-key",
			},
		});
	});

	it("composes extension options from private provider connections and public options", async () => {
		const publicOptions = createDefaultPublicOptions();
		publicOptions.providers.sonarr.isConfigured = true;

		await browser.storage.local.set({
			[PUBLIC_OPTIONS_STORAGE_KEY]: publicOptions,
			[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
				sonarr: {
					url: "https://sonarr.example",
					apiKey: "sonarr-key",
				},
				radarr: { url: "", apiKey: "" },
				seerr: {
					url: "https://seerr.example",
					apiKey: "seerr-key",
				},
			},
		});

		const snapshot = await getExtensionOptionsSnapshot();

		expect(snapshot.providers.sonarr.url).toBe("https://sonarr.example");
		expect(snapshot.providers.sonarr.apiKey).toBe("sonarr-key");
		expect(snapshot.providers.radarr.url).toBe("");
		expect(snapshot.providers.radarr.apiKey).toBe("");
		expect(snapshot.seerr.url).toBe("https://seerr.example");
		expect(snapshot.seerr.apiKey).toBe("seerr-key");
	});

	describe("settings storage initialization", () => {
		it("migrates legacy-only connections into one private record", async () => {
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
						apiKey: "seerr-key",
					},
				},
			});
			await expectLegacyStorageRemoved();
		});

		it("preserves an existing complete private record", async () => {
			const privateConnections = {
				sonarr: { url: "https://new-sonarr.example", apiKey: "new-sonarr" },
				radarr: { url: "https://new-radarr.example", apiKey: "new-radarr" },
				seerr: { url: "https://new-seerr.example", apiKey: "new-seerr" },
			};
			await browser.storage.local.set({
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: privateConnections,
			});

			await initializeSettingsStorage();

			await expect(
				browser.storage.local.get(PRIVATE_CONNECTIONS_STORAGE_KEY),
			).resolves.toEqual({
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: privateConnections,
			});
			await expectLegacyStorageRemoved();
		});

		it("keeps complete new connections when legacy records also exist", async () => {
			const privateConnections = {
				sonarr: { url: "https://new-sonarr.example", apiKey: "new-key" },
				radarr: { url: "", apiKey: "" },
				seerr: { url: "", apiKey: "" },
			};
			await browser.storage.local.set({
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: privateConnections,
				[SONARR_SECRETS_STORAGE_KEY]: {
					url: "https://legacy-sonarr.example",
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

		it("uses meaningful legacy connections when the new record is entirely empty", async () => {
			await browser.storage.local.set({
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: EMPTY_PRIVATE_CONNECTIONS,
				[SONARR_SECRETS_STORAGE_KEY]: {
					url: "https://legacy-sonarr.example",
					apiKey: "legacy-key",
				},
			});

			await initializeSettingsStorage();

			await expect(
				browser.storage.local.get(PRIVATE_CONNECTIONS_STORAGE_KEY),
			).resolves.toEqual({
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
					...EMPTY_PRIVATE_CONNECTIONS,
					sonarr: {
						url: "https://legacy-sonarr.example",
						apiKey: "legacy-key",
					},
				},
			});
			await expectLegacyStorageRemoved();
		});

		it("chooses meaningful new and legacy connections per provider", async () => {
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
					seerr: { url: "", apiKey: "" },
				},
			});
			await expectLegacyStorageRemoved();
		});

		it("preserves valid fields from partial legacy records", async () => {
			await browser.storage.local.set({
				[SONARR_SECRETS_STORAGE_KEY]: {
					url: "https://sonarr.example",
				},
				[RADARR_SECRETS_STORAGE_KEY]: {
					url: 123,
					apiKey: "radarr-key",
				},
			});

			await initializeSettingsStorage();

			await expect(
				browser.storage.local.get(PRIVATE_CONNECTIONS_STORAGE_KEY),
			).resolves.toEqual({
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
					sonarr: { url: "https://sonarr.example", apiKey: "" },
					radarr: { url: "", apiKey: "radarr-key" },
					seerr: { url: "", apiKey: "" },
				},
			});
			await expectLegacyStorageRemoved();
		});

		it("replaces corrupt legacy records with empty connections", async () => {
			await browser.storage.local.set({
				[SONARR_SECRETS_STORAGE_KEY]: null,
				[RADARR_SECRETS_STORAGE_KEY]: ["bad"],
				[SEERR_SECRETS_STORAGE_KEY]: "bad",
			});

			await initializeSettingsStorage();

			await expect(
				browser.storage.local.get(PRIVATE_CONNECTIONS_STORAGE_KEY),
			).resolves.toEqual({
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: EMPTY_PRIVATE_CONNECTIONS,
			});
			await expectLegacyStorageRemoved();
		});

		it("repairs stale public connection status from private connections", async () => {
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
					seerr: { isConfigured: true },
				},
				[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
					...EMPTY_PRIVATE_CONNECTIONS,
					sonarr: {
						url: "https://sonarr.example",
						apiKey: "sonarr-key",
					},
				},
			});

			await initializeSettingsStorage();

			await expect(getPublicOptionsSnapshot()).resolves.toMatchObject({
				providers: {
					sonarr: { isConfigured: true },
					radarr: { isConfigured: false },
				},
				seerr: { isConfigured: false },
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
			await expectLegacyStorageRemoved();
			const onChanged = vi.fn();
			browser.storage.onChanged.addListener(onChanged);

			await initializeSettingsStorage();

			expect(onChanged).not.toHaveBeenCalled();
			browser.storage.onChanged.removeListener(onChanged);
		});
	});

	it("derives public connection status instead of accepting UI flags", async () => {
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
			seerr: { isConfigured: true },
			debugLogging: true,
		});

		const snapshot = await getExtensionOptionsSnapshot();
		const savedPublicOptions = await getPublicOptionsSnapshot();

		expect(snapshot.debugLogging).toBe(true);
		expect(snapshot.providers.sonarr.url).toBe("https://sonarr.example");
		expect(snapshot.providers.sonarr.apiKey).toBe("sonarr-key");
		expect(savedPublicOptions.providers.sonarr.isConfigured).toBe(true);
		expect(savedPublicOptions.providers.radarr.isConfigured).toBe(false);
		expect(savedPublicOptions.seerr.isConfigured).toBe(false);
	});

	it("saving provider credentials does not change public defaults", async () => {
		const publicOptions = await getPublicOptionsSnapshot();
		await savePublicOptionsSnapshot({
			...publicOptions,
			providers: {
				...publicOptions.providers,
				sonarr: {
					...publicOptions.providers.sonarr,
					defaults: {
						...publicOptions.providers.sonarr.defaults,
						rootFolderPath: "/anime",
					},
				},
			},
		});

		await saveProviderConnectionSnapshot("sonarr", {
			url: "https://sonarr.example",
			apiKey: "sonarr-key",
		});

		const snapshot = await getExtensionOptionsSnapshot();

		expect(snapshot.providers.sonarr.defaults.rootFolderPath).toBe("/anime");
		expect(snapshot.providers.sonarr.url).toBe("https://sonarr.example");
		expect(snapshot.providers.sonarr.apiKey).toBe("sonarr-key");
	});

	it("saving one provider connection preserves the other private connections", async () => {
		await browser.storage.local.set({
			[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
				sonarr: { url: "", apiKey: "" },
				radarr: {
					url: "https://radarr.example",
					apiKey: "radarr-key",
				},
				seerr: {
					url: "https://seerr.example",
					apiKey: "seerr-key",
				},
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
				seerr: {
					url: "https://seerr.example",
					apiKey: "seerr-key",
				},
			},
		});
	});

	it("saving Seerr credentials stores only configured state in public options", async () => {
		await saveSeerrConnectionSnapshot({
			url: "https://seerr.example",
			apiKey: "seerr-key",
		});

		const extensionSnapshot = await getExtensionOptionsSnapshot();
		const publicSnapshot = await getPublicOptionsSnapshot();

		expect(extensionSnapshot.seerr).toEqual({
			url: "https://seerr.example",
			apiKey: "seerr-key",
		});
		expect(publicSnapshot.seerr).toEqual({ isConfigured: true });
		expect(publicSnapshot).not.toHaveProperty("seerr.apiKey");
	});

	it("reset clears public options and private provider credentials", async () => {
		const legacySonarr = {
			url: "https://legacy-sonarr.example",
			apiKey: "legacy-key",
		};
		await browser.storage.local.set({
			[SONARR_SECRETS_STORAGE_KEY]: legacySonarr,
			[`${SONARR_SECRETS_STORAGE_KEY}$`]: { v: 1 },
		});
		await saveProviderConnectionSnapshot("sonarr", {
			url: "https://sonarr.example",
			apiKey: "sonarr-key",
		});
		const publicOptions = await getPublicOptionsSnapshot();
		await savePublicOptionsSnapshot({
			...publicOptions,
			debugLogging: true,
		});

		await resetAllSettingsSnapshot();

		const snapshot = await getExtensionOptionsSnapshot();

		expect(snapshot).toEqual(createDefaultExtensionOptions());
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

	it("reads public options from the public snapshot only", async () => {
		const defaultPublicOptions = createDefaultPublicOptions();
		await browser.storage.local.set({
			[PUBLIC_OPTIONS_STORAGE_KEY]: {
				...defaultPublicOptions,
				debugLogging: true,
				providers: {
					sonarr: {
						...defaultPublicOptions.providers.sonarr,
						isConfigured: true,
					},
					radarr: defaultPublicOptions.providers.radarr,
				},
			},
			[SONARR_SECRETS_STORAGE_KEY]: { url: "", apiKey: "" },
		});

		const snapshot = await getPublicOptionsSnapshot();

		expect(snapshot.debugLogging).toBe(true);
		expect(snapshot.providers.sonarr.isConfigured).toBe(true);
	});

	it("heals stale provider add defaults while reading settings snapshots", async () => {
		const currentPublicOptions = createDefaultPublicOptions();
		await browser.storage.local.set({
			[PUBLIC_OPTIONS_STORAGE_KEY]: {
				...currentPublicOptions,
				providers: {
					sonarr: {
						...currentPublicOptions.providers.sonarr,
						defaults: {
							seriesType: "anime",
							seasonFolder: true,
							freeformTags: [],
							addOptions: {
								monitor: "future",
							},
						},
					},
					radarr: {
						...currentPublicOptions.providers.radarr,
						defaults: {
							minimumAvailability: "released",
							freeformTags: [],
							addOptions: {
								monitor: "movieOnly",
							},
						},
					},
				},
			},
		});

		const publicSnapshot = await getPublicOptionsSnapshot();
		const extensionSnapshot = await getExtensionOptionsSnapshot();

		expect(publicSnapshot.providers.sonarr.defaults.addOptions).toEqual({
			monitor: "future",
			searchForMissingEpisodes: true,
			searchForCutoffUnmetEpisodes: false,
		});
		expect(publicSnapshot.providers.radarr.defaults.addOptions).toEqual({
			monitor: "movieOnly",
			searchForMovie: true,
		});
		expect(extensionSnapshot.providers.sonarr.defaults.addOptions).toEqual(
			publicSnapshot.providers.sonarr.defaults.addOptions,
		);
		expect(extensionSnapshot.providers.radarr.defaults.addOptions).toEqual(
			publicSnapshot.providers.radarr.defaults.addOptions,
		);
	});

	it("watches only public options for public snapshot updates", async () => {
		const snapshots: PublicOptions[] = [];
		const unsubscribe = watchPublicOptionsSnapshot((snapshot) => {
			snapshots.push(snapshot);
		});

		await browser.storage.local.set({
			[PRIVATE_CONNECTIONS_STORAGE_KEY]: {
				...EMPTY_PRIVATE_CONNECTIONS,
				sonarr: {
					url: "https://sonarr.example",
					apiKey: "secret-only-change",
				},
			},
		});
		await browser.storage.local.set({
			[PUBLIC_OPTIONS_STORAGE_KEY]: {
				...createDefaultPublicOptions(),
				debugLogging: true,
			},
		});

		unsubscribe();

		expect(PUBLIC_OPTIONS_CHANGE_KEY).toBe(PUBLIC_OPTIONS_STORAGE_KEY);
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]?.debugLogging).toBe(true);
	});

	it("watches public options and the new private record but ignores legacy records", async () => {
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
