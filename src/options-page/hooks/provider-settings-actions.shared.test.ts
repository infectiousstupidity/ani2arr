/** Tests for shared provider settings state and permission cleanup helpers. */
// src/options-page/hooks/provider-settings-actions.shared.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createDefaultExtensionOptions,
	normalizeProviderConnectionSettings,
} from "@/options";
import { parseProviderQualityProfileId } from "@/providers";
import { removeProviderHostPermission } from "@/providers/settings/host-permissions";
import {
	cleanupPreviousPermission,
	credentialsMatchSaved,
	hasUnsavedSettingsChanges,
	mergeProviderSettingsIntoForm,
	shouldEnableProviderFormOptions,
	shouldResetSettingsFormFromSavedSnapshot,
} from "./provider-settings-actions.shared";

vi.mock("@/providers/settings/host-permissions", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/providers/settings/host-permissions")>();

	return {
		...actual,
		removeProviderHostPermission: vi.fn(),
		requestProviderHostPermission: vi.fn(),
	};
});

const removeProviderHostPermissionMock = vi.mocked(removeProviderHostPermission);

beforeEach(() => {
	removeProviderHostPermissionMock.mockReset();
	removeProviderHostPermissionMock.mockResolvedValue({
		ok: true,
		value: { pattern: "unused", removed: true },
	});
});

describe("provider settings state helpers", () => {
	it("merges a saved provider slice into the live form without dropping unrelated edits", () => {
		const savedBaseline = createDefaultExtensionOptions();
		const currentForm = {
			...savedBaseline,
			debugLogging: !savedBaseline.debugLogging,
		};
		const savedSonarrSettings = {
			...savedBaseline.providers.sonarr,
			url: "https://sonarr.example",
			apiKey: "api-key",
			defaults: {
				...savedBaseline.providers.sonarr.defaults,
				rootFolderPath: "/tv",
				qualityProfileId: parseProviderQualityProfileId(12),
			},
		};

		const mergedForm = mergeProviderSettingsIntoForm(
			currentForm,
			"sonarr",
			savedSonarrSettings,
		);
		const nextSavedBaseline = mergeProviderSettingsIntoForm(
			savedBaseline,
			"sonarr",
			savedSonarrSettings,
		);

		expect(mergedForm.providers.sonarr).toEqual(savedSonarrSettings);
		expect(mergedForm.debugLogging).toBe(currentForm.debugLogging);
		expect(hasUnsavedSettingsChanges(mergedForm, nextSavedBaseline)).toBe(true);
	});

	it("detects when the current form still matches the previous saved snapshot", () => {
		const savedSettings = createDefaultExtensionOptions();

		expect(
			shouldResetSettingsFormFromSavedSnapshot(savedSettings, savedSettings),
		).toBe(true);

		expect(
			shouldResetSettingsFormFromSavedSnapshot(
				{
					...savedSettings,
					debugLogging: !savedSettings.debugLogging,
				},
				savedSettings,
			),
		).toBe(false);
	});

	it("treats matching credentials as equal only when both sides are configured", () => {
		expect(
			credentialsMatchSaved(
				{ url: "https://radarr.example", apiKey: "key" },
				{ url: "https://radarr.example", apiKey: "key" },
			),
		).toBe(true);
		expect(
			credentialsMatchSaved(
				{ url: "https://radarr.example", apiKey: "key" },
				{ url: "https://radarr.example", apiKey: "other" },
			),
		).toBe(false);
		expect(
			credentialsMatchSaved(null, {
				url: "https://radarr.example",
				apiKey: "key",
			}),
		).toBe(false);
	});

	it("enables metadata immediately after connect and suppresses it only for divergent edits", () => {
		const savedCredentials = {
			url: "https://sonarr.example",
			apiKey: "key",
		};

		expect(
			shouldEnableProviderFormOptions({
				savedCredentials,
				formCredentials: savedCredentials,
				isEditingConnection: false,
			}),
		).toBe(true);
		expect(
			shouldEnableProviderFormOptions({
				savedCredentials,
				formCredentials: savedCredentials,
				isEditingConnection: true,
			}),
		).toBe(true);
		expect(
			shouldEnableProviderFormOptions({
				savedCredentials,
				formCredentials: {
					url: savedCredentials.url,
					apiKey: "changed",
				},
				isEditingConnection: true,
			}),
		).toBe(false);
		expect(
			shouldEnableProviderFormOptions({
				savedCredentials: null,
				formCredentials: savedCredentials,
				isEditingConnection: false,
			}),
		).toBe(false);
	});
});

describe("cleanupPreviousPermission", () => {
	it("keeps a shared same-origin permission when another provider still uses it", async () => {
		const previousSettings = createDefaultExtensionOptions();
		previousSettings.providers.sonarr.url = "https://arr.example/sonarr";
		previousSettings.providers.sonarr.apiKey = "sonarr-key";

		const currentSettings = createDefaultExtensionOptions();
		currentSettings.providers.radarr.url = "https://arr.example/radarr";
		currentSettings.providers.radarr.apiKey = "radarr-key";

		await cleanupPreviousPermission(
			"sonarr",
			normalizeProviderConnectionSettings(previousSettings, "sonarr"),
			currentSettings,
			"disconnect",
		);

		expect(removeProviderHostPermissionMock).not.toHaveBeenCalled();
	});

	it("removes a permission when the remaining provider uses a different port", async () => {
		const previousSettings = createDefaultExtensionOptions();
		previousSettings.providers.sonarr.url = "http://192.168.50.166:8181";
		previousSettings.providers.sonarr.apiKey = "sonarr-key";

		const currentSettings = createDefaultExtensionOptions();
		currentSettings.providers.radarr.url = "http://192.168.50.166:8282";
		currentSettings.providers.radarr.apiKey = "radarr-key";

		await cleanupPreviousPermission(
			"sonarr",
			normalizeProviderConnectionSettings(previousSettings, "sonarr"),
			currentSettings,
			"disconnect",
		);

		expect(removeProviderHostPermissionMock).toHaveBeenCalledWith(
			"http://192.168.50.166:8181",
		);
	});

	it("removes a permission when the remaining provider uses a different subdomain", async () => {
		const previousSettings = createDefaultExtensionOptions();
		previousSettings.providers.sonarr.url = "https://sonarr.example.com";
		previousSettings.providers.sonarr.apiKey = "sonarr-key";

		const currentSettings = createDefaultExtensionOptions();
		currentSettings.providers.radarr.url = "https://radarr.example.com";
		currentSettings.providers.radarr.apiKey = "radarr-key";

		await cleanupPreviousPermission(
			"sonarr",
			normalizeProviderConnectionSettings(previousSettings, "sonarr"),
			currentSettings,
			"disconnect",
		);

		expect(removeProviderHostPermissionMock).toHaveBeenCalledWith(
			"https://sonarr.example.com",
		);
	});

	it("keeps a permission when only the provider URL path changed", async () => {
		const previousSettings = createDefaultExtensionOptions();
		previousSettings.providers.sonarr.url = "https://arr.example/sonarr";
		previousSettings.providers.sonarr.apiKey = "sonarr-key";

		const currentSettings = createDefaultExtensionOptions();
		currentSettings.providers.sonarr.url = "https://arr.example/tv";
		currentSettings.providers.sonarr.apiKey = "sonarr-key";

		await cleanupPreviousPermission(
			"sonarr",
			normalizeProviderConnectionSettings(previousSettings, "sonarr"),
			currentSettings,
			"save",
		);

		expect(removeProviderHostPermissionMock).not.toHaveBeenCalled();
	});
});
