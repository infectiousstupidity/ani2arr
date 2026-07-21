/** Focused tests for Arr provider credential normalization. */

import { describe, expect, it } from "vitest";
import { createDefaultExtensionOptions } from "./schema";
import {
	getProviderConnectionDraft,
	getProviderCredentials,
	hasConfiguredProviderCredentials,
	normalizeProviderConnectionInput,
	normalizeProviderConnectionSettings,
} from "./provider-config";

describe.each([
	{ provider: "sonarr" as const, label: "Sonarr" },
	{ provider: "radarr" as const, label: "Radarr" },
])("$label connection config", ({ provider, label }) => {
	it("normalizes configured credentials", () => {
		expect(
			normalizeProviderConnectionInput(
				{
					url: ` https://${provider.toUpperCase()}.example:443/api/// `,
					apiKey: " key-123 ",
				},
				provider,
			),
		).toEqual({
			url: `https://${provider}.example/api`,
			apiKey: "key-123",
		});
	});

	it("rejects partial credentials", () => {
		expect(() =>
			normalizeProviderConnectionInput(
				{ url: `https://${provider}.example`, apiKey: "" },
				provider,
			),
		).toThrow(`${label}: enter both URL and API key, or leave both blank.`);
	});

	it("reads the provider without crossing into Seerr settings", () => {
		const settings = createDefaultExtensionOptions();
		settings.providers[provider].url = ` https://${provider}.example/base/ `;
		settings.providers[provider].apiKey = " key-123 ";

		expect(getProviderConnectionDraft(settings, provider)).toEqual({
			url: `https://${provider}.example/base/`,
			apiKey: "key-123",
		});
		expect(getProviderCredentials(settings, provider)).toEqual({
			url: `https://${provider}.example/base/`,
			apiKey: "key-123",
		});
		expect(hasConfiguredProviderCredentials(settings, provider)).toBe(true);
		expect(normalizeProviderConnectionSettings(settings, provider)).toEqual({
			url: `https://${provider}.example/base`,
			apiKey: "key-123",
		});
	});

	it("returns empty unconfigured values for undefined settings", () => {
		expect(getProviderConnectionDraft(undefined, provider)).toEqual({
			url: "",
			apiKey: "",
		});
		expect(getProviderCredentials(undefined, provider)).toBeNull();
		expect(normalizeProviderConnectionSettings(undefined, provider)).toBeNull();
		expect(hasConfiguredProviderCredentials(undefined, provider)).toBe(false);
	});
});
