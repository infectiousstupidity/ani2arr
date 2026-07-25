/** Tests background-owned provider lookup and candidate conversion. */
// src/background/provider-candidate-search.test.ts

import { describe, expect, it, vi } from "vitest";
import type { RadarrClient } from "@/providers/radarr/client";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import type { SonarrClient } from "@/providers/sonarr/client";
import { fetchProviderCandidates } from "./provider-candidate-search";

const credentials = {
	url: "https://provider.example.test",
	apiKey: "secret",
};

function createDependencies() {
	const getCredentials = vi.fn(async () => credentials);
	const sonarr = { lookupSeries: vi.fn() };
	const radarr = { lookupMovies: vi.fn() };

	return {
		dependencies: {
			getCredentials,
			sonarr: sonarr as unknown as SonarrClient,
			radarr: radarr as unknown as RadarrClient,
		},
		getCredentials,
		sonarr,
		radarr,
	};
}

describe("fetchProviderCandidates", () => {
	it("preserves aliases from a representative Frieren Sonarr lookup", async () => {
		const deps = createDependencies();
		const tvdbId = parseTvdbId(424_536);
		deps.sonarr.lookupSeries.mockResolvedValue([
			{
				tvdbId,
				title: "Frieren: Beyond Journey's End",
				sortTitle: "frieren beyond journeys end",
				titleSlug: "frieren-beyond-journeys-end",
				folder: "Frieren Beyond Journey's End",
				year: 2023,
				genres: ["Adventure", "Animation", "Anime", "Drama", "Fantasy"],
				alternateTitles: [
					{ title: "Frieren of the Funeral" },
					{ title: "Frieren" },
				],
			},
			{
				tvdbId,
				title: "Duplicate",
				folder: "Duplicate",
			},
		]);

		await expect(
			fetchProviderCandidates(
				"sonarr",
				"Frieren at the Funeral",
				deps.dependencies,
			),
		).resolves.toEqual([
			{
				providerId: tvdbId,
				title: "Frieren: Beyond Journey's End",
				sortTitle: "frieren beyond journeys end",
				titleSlug: "frieren-beyond-journeys-end",
				alternateTitles: ["Frieren of the Funeral", "Frieren"],
				year: 2023,
				genres: ["Adventure", "Animation", "Anime", "Drama", "Fantasy"],
			},
		]);
		expect(deps.getCredentials).toHaveBeenCalledWith("sonarr");
		expect(deps.sonarr.lookupSeries).toHaveBeenCalledWith(
			"Frieren at the Funeral",
			credentials,
		);
		expect(deps.radarr.lookupMovies).not.toHaveBeenCalled();
	});

	it("fetches and converts deduplicated Radarr candidates", async () => {
		const deps = createDependencies();
		const tmdbId = parseTmdbId(550_000);
		deps.radarr.lookupMovies.mockResolvedValue([
			{
				tmdbId,
				title: "Example Movie",
				originalTitle: " Original Movie ",
				titleSlug: "example-movie",
				folderName: "Example Movie (2026)",
				year: 2026,
				alternateTitles: [
					{ title: " Alternate Movie " },
					{ title: " " },
					{ title: null },
				],
			},
			{
				tmdbId,
				title: "Duplicate",
			},
		]);

		await expect(
			fetchProviderCandidates("radarr", "Example Movie", deps.dependencies),
		).resolves.toEqual([
			{
				providerId: tmdbId,
				title: "Example Movie",
				originalTitle: " Original Movie ",
				titleSlug: "example-movie",
				folderName: "Example Movie (2026)",
				alternateTitles: ["Original Movie", "Alternate Movie"],
				year: 2026,
			},
		]);
		expect(deps.getCredentials).toHaveBeenCalledWith("radarr");
		expect(deps.radarr.lookupMovies).toHaveBeenCalledWith(
			"Example Movie",
			credentials,
		);
		expect(deps.sonarr.lookupSeries).not.toHaveBeenCalled();
	});

	it("propagates credential errors without calling a provider", async () => {
		const deps = createDependencies();
		const error = new Error("Provider not configured");
		deps.getCredentials.mockRejectedValue(error);

		await expect(
			fetchProviderCandidates("sonarr", "Example", deps.dependencies),
		).rejects.toBe(error);
		expect(deps.sonarr.lookupSeries).not.toHaveBeenCalled();
		expect(deps.radarr.lookupMovies).not.toHaveBeenCalled();
	});

	it("propagates provider client errors", async () => {
		const deps = createDependencies();
		const error = new Error("Lookup failed");
		deps.radarr.lookupMovies.mockRejectedValue(error);

		await expect(
			fetchProviderCandidates("radarr", "Example", deps.dependencies),
		).rejects.toBe(error);
	});
});
