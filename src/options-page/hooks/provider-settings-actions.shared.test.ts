import { describe, expect, it } from "vitest";
import { createDefaultExtensionOptions } from "@/options";
import { parseProviderQualityProfileId } from "@/providers";
import {
	credentialsMatchSaved,
	hasUnsavedSettingsChanges,
	mergeProviderSettingsIntoForm,
	shouldEnableProviderMetadata,
	shouldResetSettingsFormFromSavedSnapshot,
} from "./provider-settings-actions.shared";

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
			shouldEnableProviderMetadata({
				savedCredentials,
				formCredentials: savedCredentials,
				isEditingConnection: false,
			}),
		).toBe(true);
		expect(
			shouldEnableProviderMetadata({
				savedCredentials,
				formCredentials: savedCredentials,
				isEditingConnection: true,
			}),
		).toBe(true);
		expect(
			shouldEnableProviderMetadata({
				savedCredentials,
				formCredentials: {
					url: savedCredentials.url,
					apiKey: "changed",
				},
				isEditingConnection: true,
			}),
		).toBe(false);
		expect(
			shouldEnableProviderMetadata({
				savedCredentials: null,
				formCredentials: savedCredentials,
				isEditingConnection: false,
			}),
		).toBe(false);
	});
});
