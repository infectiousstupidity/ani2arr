/** Focused tests for provider identity branding boundaries. */
// src/providers/provider-id.test.ts

import { describe, expect, it } from "vitest";
import {
	parseProviderIdentity,
	type ProviderIdFor,
	type ProviderIdentity,
} from "./provider-id";

describe("provider ID helpers", () => {
	it("keeps provider identity types provider-discriminated", () => {
		const sonarrIdentity = {
			provider: "sonarr",
			providerId: parseProviderIdentity("sonarr", 100).providerId,
		} satisfies ProviderIdentity;

		const radarrIdentity = {
			provider: "radarr",
			providerId: parseProviderIdentity("radarr", 200).providerId,
		} satisfies ProviderIdentity;

		const typedTvdbId: ProviderIdFor<"sonarr"> = sonarrIdentity.providerId;
		const typedTmdbId: ProviderIdFor<"radarr"> = radarrIdentity.providerId;

		expect(typedTvdbId).toBe(100);
		expect(typedTmdbId).toBe(200);
	});

	it("parses provider identities by provider kind", () => {
		expect(parseProviderIdentity("sonarr", 100)).toEqual({
			provider: "sonarr",
			providerId: 100,
		});
		expect(parseProviderIdentity("radarr", 200)).toEqual({
			provider: "radarr",
			providerId: 200,
		});
		expect(() => parseProviderIdentity("sonarr", "100")).toThrow(
			/Invalid TVDB ID/,
		);
		expect(() => parseProviderIdentity("radarr", 0)).toThrow(/Invalid TMDB ID/);
		expect(() => parseProviderIdentity("sonarr", 1.5)).toThrow(
			/Invalid TVDB ID/,
		);
	});
});
