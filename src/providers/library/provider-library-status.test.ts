import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist";
import {
	createDefaultExtensionOptions,
	setExtensionOptionsSnapshot,
} from "@/options";
import {
	parseRadarrMovieId,
	parseSonarrSeriesId,
	parseTmdbId,
	parseTvdbId,
	type RadarrMovieSnapshot,
	type SonarrSeries,
	type SonarrSeriesSnapshot,
} from "@/providers";
import type { RadarrClient } from "@/providers/clients/radarr.client";
import type { SonarrClient } from "@/providers/clients/sonarr.client";
import type { TtlCache } from "@/shared/cache/ttl-cache";
import { RadarrLibrary } from "./radarr-library";
import { SonarrLibrary } from "./sonarr-library";
import type { ProviderLibraryCaches } from "./types";

function createMemoryCache<T>(initialValue: T): TtlCache<T> {
	let value: T | undefined = initialValue;
	return {
		read: vi.fn(async () =>
			value === undefined
				? null
				: {
						value,
						stale: false,
						staleAt: Date.now() + 60_000,
						expiresAt: Date.now() + 120_000,
					},
		),
		write: vi.fn(async (_key, nextValue) => {
			value = nextValue;
		}),
		remove: vi.fn(async () => {
			value = undefined;
		}),
		clear: vi.fn(async () => {
			value = undefined;
		}),
	};
}

function createCaches<T>(initialList: T[]): ProviderLibraryCaches<T> {
	return { lean: createMemoryCache(initialList) };
}

const createMappingService = () => ({
	resolveProviderId: vi.fn(),
	prioritizeAniListMedia: vi.fn(),
	getAutoMapping: vi.fn(),
});

const createManualMappingService = () => ({
	getLinkedAniListIds: vi.fn(() => []),
});

const createSonarrUpstreamStore = () => ({
	getAniListIdsForTvdb: vi.fn(() => []),
});

const createRadarrUpstreamStore = () => ({
	getAniListIdsForTmdb: vi.fn(() => []),
});

function createSonarrSeries(input?: Partial<SonarrSeries>): SonarrSeries {
	return {
		id: parseSonarrSeriesId(10),
		tvdbId: parseTvdbId(123),
		title: "Known Series",
		titleSlug: "known-series",
		...input,
	};
}

function createSonarrSnapshot(
	input?: Partial<SonarrSeriesSnapshot>,
): SonarrSeriesSnapshot {
	return {
		id: parseSonarrSeriesId(10),
		tvdbId: parseTvdbId(123),
		title: "Known Series",
		titleSlug: "known-series",
		...input,
	};
}

function createRadarrSnapshot(
	input?: Partial<RadarrMovieSnapshot>,
): RadarrMovieSnapshot {
	return {
		id: parseRadarrMovieId(20),
		tmdbId: parseTmdbId(456),
		title: "Known Movie",
		...input,
	};
}

async function configureProviders(): Promise<void> {
	const options = createDefaultExtensionOptions();
	options.providers.sonarr.url = "http://sonarr.local";
	options.providers.sonarr.apiKey = "sonarr-key";
	options.providers.radarr.url = "http://radarr.local";
	options.providers.radarr.apiKey = "radarr-key";
	await setExtensionOptionsSnapshot(options);
}

describe("provider-target library status", () => {
	beforeEach(async () => {
		await configureProviders();
	});

	it("does not treat a cached Sonarr same-title library item as an effective mapping", async () => {
		const mappingService = createMappingService();
		mappingService.resolveProviderId.mockResolvedValue(null);
		mappingService.getAutoMapping.mockResolvedValue(null);
		const series = createSonarrSnapshot({ title: "Known Series" });
		const client = {
			getAllSeries: vi.fn(),
			getSeriesByTvdbId: vi.fn(),
			lookupSeriesByTvdbId: vi.fn(),
		} as unknown as SonarrClient;
		const library = new SonarrLibrary(
			client,
			mappingService,
			createManualMappingService(),
			createSonarrUpstreamStore(),
			createCaches([series]),
		);

		const status = await library.getSeriesStatus({
			anilistId: parseAniListId(10),
			title: "Known Series",
		});

		expect(status).toMatchObject({
			providerId: null,
			providerMappingState: "unmapped",
			isInLibrary: null,
		});
		expect(mappingService.resolveProviderId).toHaveBeenCalledWith(
			"sonarr",
			parseAniListId(10),
			expect.objectContaining({
				hints: expect.objectContaining({ primaryTitle: "Known Series" }),
			}),
		);
		expect(client.getSeriesByTvdbId).not.toHaveBeenCalled();
	});

	it("does not treat a cached Radarr same-title library item as an effective mapping", async () => {
		const mappingService = createMappingService();
		mappingService.resolveProviderId.mockResolvedValue(null);
		mappingService.getAutoMapping.mockResolvedValue(null);
		const movie = createRadarrSnapshot({ title: "Known Movie" });
		const client = {
			getAllMovies: vi.fn(),
			getMovieByTmdbId: vi.fn(),
			lookupMovieByTmdbId: vi.fn(),
		} as unknown as RadarrClient;
		const library = new RadarrLibrary(
			client,
			mappingService,
			createManualMappingService(),
			createRadarrUpstreamStore(),
			createCaches([movie]),
		);

		const status = await library.getMovieStatus({
			anilistId: parseAniListId(11),
			title: "Known Movie",
		});

		expect(status).toMatchObject({
			providerId: null,
			providerMappingState: "unmapped",
			isInLibrary: null,
		});
		expect(mappingService.resolveProviderId).toHaveBeenCalledWith(
			"radarr",
			parseAniListId(11),
			expect.objectContaining({
				hints: expect.objectContaining({ primaryTitle: "Known Movie" }),
			}),
		);
		expect(client.getMovieByTmdbId).not.toHaveBeenCalled();
	});

	it("returns in-library for a known Sonarr TVDB ID from the lean cache without resolving mapping", async () => {
		const mappingService = createMappingService();
		const series = createSonarrSnapshot();
		const client = {
			getAllSeries: vi.fn(),
			getSeriesByTvdbId: vi.fn(),
			lookupSeriesByTvdbId: vi.fn(),
		} as unknown as SonarrClient;
		const library = new SonarrLibrary(
			client,
			mappingService,
			createManualMappingService(),
			createSonarrUpstreamStore(),
			createCaches([series]),
		);

		const status = await library.getSeriesLibraryStatus({
			anilistId: parseAniListId(1),
			providerId: series.tvdbId,
		});

		expect(status).toMatchObject({
			anilistId: 1,
			provider: "sonarr",
			providerId: series.tvdbId,
			isInLibrary: true,
			series,
		});
		expect(mappingService.resolveProviderId).not.toHaveBeenCalled();
		expect(client.getSeriesByTvdbId).not.toHaveBeenCalled();
	});

	it("returns not-in-library for a known Sonarr TVDB ID missing from the lean cache", async () => {
		const mappingService = createMappingService();
		const tvdbId = parseTvdbId(124);
		const client = {
			getAllSeries: vi.fn(),
			getSeriesByTvdbId: vi.fn(),
			lookupSeriesByTvdbId: vi.fn(),
		} as unknown as SonarrClient;
		const library = new SonarrLibrary(
			client,
			mappingService,
			createManualMappingService(),
			createSonarrUpstreamStore(),
			createCaches<SonarrSeriesSnapshot>([]),
		);

		const status = await library.getSeriesLibraryStatus({
			anilistId: parseAniListId(2),
			providerId: tvdbId,
		});

		expect(status).toEqual({
			anilistId: 2,
			provider: "sonarr",
			providerId: tvdbId,
			isInLibrary: false,
		});
		expect(mappingService.resolveProviderId).not.toHaveBeenCalled();
		expect(client.getSeriesByTvdbId).not.toHaveBeenCalled();
	});

	it("force-verifies Sonarr by exact TVDB ID and updates the cache when found live", async () => {
		const mappingService = createMappingService();
		const liveSeries = createSonarrSeries({ tvdbId: parseTvdbId(125) });
		const client = {
			getAllSeries: vi.fn(),
			getSeriesByTvdbId: vi.fn(async () => liveSeries),
			lookupSeriesByTvdbId: vi.fn(),
		} as unknown as SonarrClient;
		const caches = createCaches<SonarrSeriesSnapshot>([]);
		const library = new SonarrLibrary(
			client,
			mappingService,
			createManualMappingService(),
			createSonarrUpstreamStore(),
			caches,
		);

		const status = await library.getSeriesLibraryStatus({
			anilistId: parseAniListId(3),
			providerId: liveSeries.tvdbId,
			forceVerify: true,
		});

		expect(client.getSeriesByTvdbId).toHaveBeenCalledWith(
			liveSeries.tvdbId,
			expect.objectContaining({ apiKey: "sonarr-key" }),
		);
		expect(caches.lean.write).toHaveBeenCalled();
		expect(status).toMatchObject({
			anilistId: 3,
			provider: "sonarr",
			providerId: liveSeries.tvdbId,
			isInLibrary: true,
			series: liveSeries,
		});
		expect(mappingService.resolveProviderId).not.toHaveBeenCalled();
	});

	it("returns in-library for a known Radarr TMDB ID from the lean cache without resolving mapping", async () => {
		const mappingService = createMappingService();
		const movie = createRadarrSnapshot();
		const client = {
			getAllMovies: vi.fn(),
			getMovieByTmdbId: vi.fn(),
			lookupMovieByTmdbId: vi.fn(),
		} as unknown as RadarrClient;
		const library = new RadarrLibrary(
			client,
			mappingService,
			createManualMappingService(),
			createRadarrUpstreamStore(),
			createCaches([movie]),
		);

		const status = await library.getMovieLibraryStatus({
			anilistId: parseAniListId(4),
			providerId: movie.tmdbId,
		});

		expect(status).toMatchObject({
			anilistId: 4,
			provider: "radarr",
			providerId: movie.tmdbId,
			isInLibrary: true,
			movie,
		});
		expect(mappingService.resolveProviderId).not.toHaveBeenCalled();
		expect(client.getMovieByTmdbId).not.toHaveBeenCalled();
	});

	it("returns not-in-library for a known Radarr TMDB ID missing from the lean cache", async () => {
		const mappingService = createMappingService();
		const tmdbId = parseTmdbId(457);
		const client = {
			getAllMovies: vi.fn(),
			getMovieByTmdbId: vi.fn(),
			lookupMovieByTmdbId: vi.fn(),
		} as unknown as RadarrClient;
		const library = new RadarrLibrary(
			client,
			mappingService,
			createManualMappingService(),
			createRadarrUpstreamStore(),
			createCaches<RadarrMovieSnapshot>([]),
		);

		const status = await library.getMovieLibraryStatus({
			anilistId: parseAniListId(5),
			providerId: tmdbId,
		});

		expect(status).toEqual({
			anilistId: 5,
			provider: "radarr",
			providerId: tmdbId,
			isInLibrary: false,
		});
		expect(mappingService.resolveProviderId).not.toHaveBeenCalled();
		expect(client.getMovieByTmdbId).not.toHaveBeenCalled();
	});

	it("force-verifies Radarr by exact TMDB ID and removes stale cache entries when missing live", async () => {
		const mappingService = createMappingService();
		const cachedMovie = createRadarrSnapshot({ tmdbId: parseTmdbId(458) });
		const client = {
			getAllMovies: vi.fn(),
			getMovieByTmdbId: vi.fn(async () => null),
			lookupMovieByTmdbId: vi.fn(async () => null),
		} as unknown as RadarrClient;
		const caches = createCaches([cachedMovie]);
		const library = new RadarrLibrary(
			client,
			mappingService,
			createManualMappingService(),
			createRadarrUpstreamStore(),
			caches,
		);

		const status = await library.getMovieLibraryStatus({
			anilistId: parseAniListId(6),
			providerId: cachedMovie.tmdbId,
			forceVerify: true,
		});

		expect(client.getMovieByTmdbId).toHaveBeenCalledWith(
			cachedMovie.tmdbId,
			expect.objectContaining({ apiKey: "radarr-key" }),
		);
		expect(caches.lean.write).toHaveBeenCalledWith(
			expect.any(String),
			[],
			expect.any(Object),
		);
		expect(status).toEqual({
			anilistId: 6,
			provider: "radarr",
			providerId: cachedMovie.tmdbId,
			isInLibrary: false,
		});
		expect(mappingService.resolveProviderId).not.toHaveBeenCalled();
	});
});
