/** Focused tests for provider credential extraction and configured-state derivation. */
// src/options/provider-config.test.ts

import { describe, expect, it } from "vitest";
import { createDefaultExtensionOptions } from "@/options";
import {
	getProviderConnectionDraft,
	getProviderCredentials,
	hasConfiguredProviderCredentials,
	normalizeProviderConnectionSettings,
} from "./provider-config";

describe("getProviderCredentials", () => {
	it("returns trimmed credentials when both fields present", () => {
		const settings = createDefaultExtensionOptions();
		settings.providers.sonarr.url = "  https://sonarr.example  ";
		settings.providers.sonarr.apiKey = "  abc123  ";

		expect(getProviderCredentials(settings, "sonarr")).toEqual({
			url: "https://sonarr.example",
			apiKey: "abc123",
		});
	});

	it("returns null when url is missing", () => {
		const settings = createDefaultExtensionOptions();
		settings.providers.sonarr.url = "";
		settings.providers.sonarr.apiKey = "abc123";

		expect(getProviderCredentials(settings, "sonarr")).toBeNull();
	});

	it("returns null when apiKey is missing", () => {
		const settings = createDefaultExtensionOptions();
		settings.providers.radarr.url = "https://radarr.example";
		settings.providers.radarr.apiKey = "";

		expect(getProviderCredentials(settings, "radarr")).toBeNull();
	});

	it("returns null when both fields missing", () => {
		const settings = createDefaultExtensionOptions();
		expect(getProviderCredentials(settings, "sonarr")).toBeNull();
	});

	it("treats whitespace-only values as unconfigured", () => {
		const settings = createDefaultExtensionOptions();
		settings.providers.sonarr.url = "   ";
		settings.providers.sonarr.apiKey = "  ";

		expect(getProviderCredentials(settings, "sonarr")).toBeNull();
	});

	it("returns null for undefined settings", () => {
		expect(getProviderCredentials(undefined, "sonarr")).toBeNull();
	});
});

describe("getProviderConnectionDraft", () => {
	it("returns trimmed draft values even when incomplete", () => {
		const settings = createDefaultExtensionOptions();
		settings.providers.sonarr.url = "  https://sonarr.example/  ";
		settings.providers.sonarr.apiKey = "  ";

		expect(getProviderConnectionDraft(settings, "sonarr")).toEqual({
			url: "https://sonarr.example/",
			apiKey: "",
		});
	});
});

describe("normalizeProviderConnectionSettings", () => {
	it("returns null when both fields are blank", () => {
		const settings = createDefaultExtensionOptions();

		expect(normalizeProviderConnectionSettings(settings, "sonarr")).toBeNull();
	});

	it("normalizes configured credentials and derives the permission pattern", () => {
		const settings = createDefaultExtensionOptions();
		settings.providers.radarr.url = " https://RADARR.example:443/api/// ";
		settings.providers.radarr.apiKey = "  key-123  ";

		expect(normalizeProviderConnectionSettings(settings, "radarr")).toEqual({
			url: "https://radarr.example/api",
			apiKey: "key-123",
			permissionPattern: "https://radarr.example/*",
		});
	});

	it("throws on partial credentials", () => {
		const settings = createDefaultExtensionOptions();
		settings.providers.sonarr.url = "https://sonarr.example";

		expect(() =>
			normalizeProviderConnectionSettings(settings, "sonarr"),
		).toThrow("Sonarr: enter both URL and API key, or leave both blank.");
	});
});

describe("hasConfiguredProviderCredentials", () => {
	it("returns true when both fields present", () => {
		const settings = createDefaultExtensionOptions();
		settings.providers.radarr.url = "https://radarr.example";
		settings.providers.radarr.apiKey = "key";

		expect(hasConfiguredProviderCredentials(settings, "radarr")).toBe(true);
	});

	it("returns false when a field is missing", () => {
		const settings = createDefaultExtensionOptions();
		settings.providers.radarr.url = "https://radarr.example";
		settings.providers.radarr.apiKey = "";

		expect(hasConfiguredProviderCredentials(settings, "radarr")).toBe(false);
	});

	it("returns false for undefined settings", () => {
		expect(hasConfiguredProviderCredentials(undefined, "sonarr")).toBe(false);
	});
});
