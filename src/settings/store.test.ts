/** Focused tests for options parsing and public snapshot shaping. */
// src/settings/store.test.ts

import { describe, expect, it } from "vitest";
import { browser } from "wxt/browser";
import {
	PUBLIC_OPTIONS_CHANGE_KEY,
	createDefaultExtensionOptions,
	getExtensionOptionsSnapshot,
	getPublicOptionsSnapshot,
	parseExtensionOptions,
	resetAllSettingsSnapshot,
	saveProviderConnectionSnapshot,
	savePublicOptionsSnapshot,
	toPublicOptions,
	watchPublicOptionsSnapshot,
} from "@/settings";
import type { PublicOptions } from "@/settings";

const PUBLIC_OPTIONS_STORAGE_KEY = "publicOptions";
const SONARR_SECRETS_STORAGE_KEY = "sonarrSecrets";
const RADARR_SECRETS_STORAGE_KEY = "radarrSecrets";

describe("options store helpers", () => {
	it("falls back to default settings for missing input", () => {
		expect(parseExtensionOptions({})).toEqual(createDefaultExtensionOptions());
	});

	it("omits secrets and computes provider configuration in public options", () => {
		const settings = createDefaultExtensionOptions();
		settings.providers.sonarr.url = "https://sonarr.example";
		settings.providers.sonarr.apiKey = "sonarr-key";
		settings.providers.radarr.url = "https://radarr.example";
		settings.providers.radarr.apiKey = "";

		expect(toPublicOptions(settings)).toEqual({
			providers: {
				sonarr: {
					defaults: settings.providers.sonarr.defaults,
					isConfigured: true,
				},
				radarr: {
					defaults: settings.providers.radarr.defaults,
					isConfigured: false,
				},
			},
			ui: settings.ui,
			debugLogging: false,
		});
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

	it("falls back to empty credentials for malformed private connection records", async () => {
		await browser.storage.local.set({
			[PUBLIC_OPTIONS_STORAGE_KEY]: toPublicOptions(createDefaultExtensionOptions()),
			[SONARR_SECRETS_STORAGE_KEY]: { apiKey: 123 } as unknown as {
				apiKey: string;
			},
			[RADARR_SECRETS_STORAGE_KEY]: null as unknown as { apiKey: string },
		});

		const snapshot = await getExtensionOptionsSnapshot();

		expect(snapshot.providers.sonarr.url).toBe("");
		expect(snapshot.providers.sonarr.apiKey).toBe("");
		expect(snapshot.providers.radarr.url).toBe("");
		expect(snapshot.providers.radarr.apiKey).toBe("");
	});

	it("composes extension options from private provider connections and public options", async () => {
		const publicOptions = toPublicOptions(createDefaultExtensionOptions());
		publicOptions.providers.sonarr.isConfigured = true;

		await browser.storage.local.set({
			[PUBLIC_OPTIONS_STORAGE_KEY]: publicOptions,
			[SONARR_SECRETS_STORAGE_KEY]: {
				url: "https://sonarr.example",
				apiKey: "sonarr-key",
			},
		});

		const snapshot = await getExtensionOptionsSnapshot();

		expect(snapshot.providers.sonarr.url).toBe("https://sonarr.example");
		expect(snapshot.providers.sonarr.apiKey).toBe("sonarr-key");
		expect(snapshot.providers.radarr.url).toBe("");
		expect(snapshot.providers.radarr.apiKey).toBe("");
	});

	it("saving public options cannot clear private provider credentials", async () => {
		await saveProviderConnectionSnapshot("sonarr", {
			url: "https://sonarr.example",
			apiKey: "sonarr-key",
		});

		const publicOptions = await getPublicOptionsSnapshot();
		await savePublicOptionsSnapshot({
			...publicOptions,
			debugLogging: true,
		});

		const snapshot = await getExtensionOptionsSnapshot();

		expect(snapshot.debugLogging).toBe(true);
		expect(snapshot.providers.sonarr.url).toBe("https://sonarr.example");
		expect(snapshot.providers.sonarr.apiKey).toBe("sonarr-key");
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

	it("reset clears public options and private provider credentials", async () => {
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
	});

	it("reads public options from the public snapshot only", async () => {
		await browser.storage.local.set({
			[PUBLIC_OPTIONS_STORAGE_KEY]: {
				...toPublicOptions(createDefaultExtensionOptions()),
				debugLogging: true,
				providers: {
					sonarr: {
						...toPublicOptions(createDefaultExtensionOptions()).providers
							.sonarr,
						isConfigured: true,
					},
					radarr: toPublicOptions(createDefaultExtensionOptions()).providers
						.radarr,
				},
			},
			[SONARR_SECRETS_STORAGE_KEY]: { url: "", apiKey: "" },
		});

		const snapshot = await getPublicOptionsSnapshot();

		expect(snapshot.debugLogging).toBe(true);
		expect(snapshot.providers.sonarr.isConfigured).toBe(true);
	});

	it("watches only public options for public snapshot updates", async () => {
		const snapshots: PublicOptions[] = [];
		const unsubscribe = watchPublicOptionsSnapshot((snapshot) => {
			snapshots.push(snapshot);
		});

		await browser.storage.local.set({
			[SONARR_SECRETS_STORAGE_KEY]: {
				url: "https://sonarr.example",
				apiKey: "secret-only-change",
			},
		});
		await browser.storage.local.set({
			[PUBLIC_OPTIONS_STORAGE_KEY]: {
				...toPublicOptions(createDefaultExtensionOptions()),
				debugLogging: true,
			},
		});

		unsubscribe();

		expect(PUBLIC_OPTIONS_CHANGE_KEY).toBe(PUBLIC_OPTIONS_STORAGE_KEY);
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]?.debugLogging).toBe(true);
	});
});
