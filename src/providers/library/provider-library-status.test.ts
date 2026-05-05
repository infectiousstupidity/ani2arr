import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist";
import {
	createDefaultExtensionOptions,
	setExtensionOptionsSnapshot,
} from "@/options";
import { createLibraryHandlers } from "@/rpc/handlers/library.handlers";
import {
	parseProviderQualityProfileId,
	parseRadarrMovieId,
	parseSonarrSeriesId,
	parseTmdbId,
	parseTvdbId,
	type ProviderCredentials,
	type RadarrMovie,
	type RadarrMovieSnapshot,
	type SonarrSeries,
	type SonarrSeriesSnapshot,
	type TvdbId,
} from "@/providers";
import type { RadarrClient } from "@/providers/clients/radarr.client";
import { SonarrLibrary as SonarrSeriesLibrary } from "@/providers/sonarr/library";
import type { SonarrLookupSeries } from "@/providers/sonarr/types";
import type {
	CacheHit,
	TtlCache,
} from "@/shared/cache/ttl-cache";
import { PROVIDER_LIBRARY_CACHE_TTL } from "./cache";
import { RadarrLibrary } from "./radarr-library";
import { SonarrLibrary } from "./sonarr-library";
import type { ProviderLibraryCaches } from "./types";

type SonarrClientStub = {
	getSeries?: (credentials: ProviderCredentials) => Promise<unknown[]>;
	getSeriesByTvdbId?: (
		tvdbId: TvdbId,
		credentials: ProviderCredentials,
	) => Promise<unknown | null>;
	lookupSeries?: (
		term: string,
		credentials: ProviderCredentials,
	) => Promise<SonarrLookupSeries[]>;
};

type CacheMode = "miss" | "fresh" | "stale";

function createMemoryCache<T>(
	initialValue: T | undefined,
	mode: CacheMode = initialValue === undefined ? "miss" : "fresh",
): TtlCache<T> & { value: () => T | undefined } {
	let value = initialValue;
	let currentMode = mode;

	const cache = {
		read: vi.fn(async (): Promise<CacheHit<T> | null> => {
			if (currentMode === "miss" || value === undefined) return null;
			return {
				value,
				stale: currentMode === "stale",
				staleAt: Date.now() - (currentMode === "stale" ? 1 : -60_000),
				expiresAt: Date.now() + 120_000,
			};
		}),
		write: vi.fn(async (_key: string, nextValue: T) => {
			value = nextValue;
			currentMode = "fresh";
		}),
		remove: vi.fn(async () => {
			value = undefined;
			currentMode = "miss";
		}),
		clear: vi.fn(async () => {
			value = undefined;
			currentMode = "miss";
		}),
		value: () => value,
	};
	return cache;
}

function createCaches<T>(
	initialList?: T[],
	mode?: CacheMode,
): ProviderLibraryCaches<T> & {
	lean: TtlCache<T[]> & { value: () => T[] | undefined };
} {
	return { lean: createMemoryCache(initialList, mode) };
}

const createMappingService = () => ({
	resolveProviderId: vi.fn(),
	prioritizeAniListMedia: vi.fn(),
	getAutoMapping: vi.fn(),
});

const createManualMappingService = () => ({
	getLinkedAniListIds: vi.fn(() => []),
	has: vi.fn(() => false),
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
		monitored: true,
		path: "/tv/Known Series",
		rootFolderPath: "/tv",
		qualityProfileId: parseProviderQualityProfileId(1),
		seasonFolder: true,
		monitorNewItems: "all",
		seriesType: "anime",
		tags: [],
		...input,
	};
}

function createSonarrLookupSeries(
	input?: Partial<SonarrLookupSeries>,
): SonarrLookupSeries {
	return {
		title: "Lookup Series",
		tvdbId: parseTvdbId(123),
		folder: "Lookup Series",
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

function createRadarrMovie(input?: Partial<RadarrMovie>): RadarrMovie {
	return {
		id: parseRadarrMovieId(20),
		tmdbId: parseTmdbId(456),
		title: "Known Movie",
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

async function configureProviders(configured = true): Promise<void> {
	const options = createDefaultExtensionOptions();
	if (configured) {
		options.providers.sonarr.url = "http://sonarr.local";
		options.providers.sonarr.apiKey = "sonarr-key";
		options.providers.radarr.url = "http://radarr.local";
		options.providers.radarr.apiKey = "radarr-key";
	}
	await setExtensionOptionsSnapshot(options);
}

function createSonarrLibrary(
	client: SonarrClientStub,
	caches: ProviderLibraryCaches<SonarrSeriesSnapshot>,
): SonarrLibrary {
	const seriesLibrary = new SonarrSeriesLibrary({
		client: {
			getSeries: (credentials) =>
				(client.getSeries?.(credentials) ?? Promise.resolve([])) as never,
			getSeriesByTvdbId: (tvdbId, credentials) =>
				(client.getSeriesByTvdbId?.(tvdbId, credentials) ??
					Promise.resolve(null)) as never,
		},
		cache: caches.lean as never,
	});

	return new SonarrLibrary({
		seriesLibrary,
		lookupSeries: (term, credentials) =>
			client.lookupSeries?.(term, credentials) ?? Promise.resolve([]),
	});
}

function createRadarrLibrary(
	client: Partial<RadarrClient>,
	caches: ProviderLibraryCaches<RadarrMovieSnapshot>,
): RadarrLibrary {
	return new RadarrLibrary({
		radarrClient: client as RadarrClient,
		mappingService: createMappingService(),
		manualMappingService: createManualMappingService(),
		anibridgeMappingStore: createRadarrUpstreamStore(),
		caches,
	});
}

describe("series status orchestration", () => {
	beforeEach(async () => {
		await configureProviders();
	});

	it("returns unmapped status without checking Sonarr library", async () => {
		const mappingService = createMappingService();
		mappingService.resolveProviderId.mockResolvedValue(null);
		mappingService.getAutoMapping.mockResolvedValue(null);
		const getSeriesLibraryStatus = vi.fn();
		const handlers = createLibraryHandlers({
			RadarrClient: {},
			mappingService,
			manualMappingService: createManualMappingService(),
			anibridgeMappingStore: createSonarrUpstreamStore(),
			sonarrLibrary: { getSeriesLibraryStatus },
			radarrLibrary: {},
			manualMappingsReady: Promise.resolve(),
			providerConfig: {
				get: vi.fn(async () => ({
					url: "http://sonarr.local",
					apiKey: "sonarr-key",
				}) satisfies ProviderCredentials),
			},
		} as never);

		const status = await handlers.getSeriesStatus({
			anilistId: parseAniListId(10),
			title: "Known Series",
		});

		expect(status).toMatchObject({
			providerId: null,
			providerMappingState: "unmapped",
			isInLibrary: null,
		});
		expect(getSeriesLibraryStatus).not.toHaveBeenCalled();
	});
});

describe("provider library cache", () => {
	beforeEach(async () => {
		await configureProviders();
		vi.restoreAllMocks();
	});

	it("force-verifies a mapped Sonarr hit and updates the cache", async () => {
		const series = createSonarrSeries();
		const client = {
			getSeries: vi.fn(async () => []),
			getSeriesByTvdbId: vi.fn(async () => series),
			lookupSeries: vi.fn(),
		};
		const caches = createCaches<SonarrSeriesSnapshot>();
		const library = createSonarrLibrary(client, caches);

		await expect(
			library.getSeriesLibraryStatus({
				anilistId: parseAniListId(10),
				providerId: parseTvdbId(123),
				forceVerify: true,
			}),
		).resolves.toMatchObject({
			isInLibrary: true,
			series: createSonarrSnapshot(),
		});

		expect(client.getSeriesByTvdbId).toHaveBeenCalledWith(
			parseTvdbId(123),
			expect.objectContaining({ apiKey: "sonarr-key" }),
		);
		expect(caches.lean.value()).toEqual([createSonarrSnapshot()]);
		expect(client.lookupSeries).not.toHaveBeenCalled();
	});

	it("refreshes a missing Radarr cache from the provider and writes lean snapshots", async () => {
		const movie = createRadarrMovie();
		const client = { getAllMovies: vi.fn(async () => [movie]) };
		const caches = createCaches<RadarrMovieSnapshot>();
		const library = createRadarrLibrary(client, caches);

		await expect(library.getLeanMovieList()).resolves.toEqual([
			createRadarrSnapshot(),
		]);

		expect(client.getAllMovies).toHaveBeenCalledWith(
			expect.objectContaining({ apiKey: "radarr-key" }),
		);
		expect(caches.lean.write).toHaveBeenCalledWith(
			expect.any(String),
			[createRadarrSnapshot()],
			PROVIDER_LIBRARY_CACHE_TTL.normal,
		);
		const written = caches.lean.value()?.[0] as unknown as Record<
			string,
			unknown
		>;
		expect(written).not.toHaveProperty("titleSlug");
		expect(written).not.toHaveProperty("sortTitle");
		expect(written).not.toHaveProperty("movieFile");
	});

	it("force-verifies a mapped Sonarr miss, removes stale cache, and uses term lookup", async () => {
		const client = {
			getSeries: vi.fn(async () => []),
			getSeriesByTvdbId: vi.fn(async () => null),
			lookupSeries: vi.fn(async () => [createSonarrLookupSeries()]),
		};
		const caches = createCaches([createSonarrSnapshot({ title: "Stale" })]);
		const library = createSonarrLibrary(client, caches);

		await expect(
			library.getSeriesLibraryStatus({
				anilistId: parseAniListId(10),
				providerId: parseTvdbId(123),
				forceVerify: true,
			}),
		).resolves.toMatchObject({
			isInLibrary: false,
			series: { title: "Lookup Series", tvdbId: parseTvdbId(123) },
		});

		expect(client.lookupSeries).toHaveBeenCalledWith(
			"tvdb:123",
			expect.objectContaining({ apiKey: "sonarr-key" }),
		);
		expect(caches.lean.value()).toEqual([]);
	});

	it("returns stale Radarr data immediately while refreshing in the background", async () => {
		const stale = createRadarrSnapshot({ title: "Stale Movie" });
		const fresh = createRadarrMovie({ title: "Fresh Movie" });
		const client = { getAllMovies: vi.fn(async () => [fresh]) };
		const caches = createCaches([stale], "stale");
		const library = createRadarrLibrary(client, caches);

		await expect(library.getLeanMovieList()).resolves.toEqual([stale]);

		await vi.waitFor(() => {
			expect(caches.lean.write).toHaveBeenCalledWith(
				expect.any(String),
				[createRadarrSnapshot({ title: "Fresh Movie" })],
				PROVIDER_LIBRARY_CACHE_TTL.normal,
			);
		});
	});

	it("clears provider caches when credentials are missing", async () => {
		await configureProviders(false);
		const sonarrClient = { getSeries: vi.fn() };
		const sonarrCaches = createCaches([createSonarrSnapshot()]);
		const sonarrLibrary = createSonarrLibrary(sonarrClient, sonarrCaches);
		const radarrClient = { getAllMovies: vi.fn() };
		const radarrCaches = createCaches([createRadarrSnapshot()]);
		const radarrLibrary = createRadarrLibrary(radarrClient, radarrCaches);

		await expect(sonarrLibrary.refreshCache()).resolves.toEqual([]);
		await expect(radarrLibrary.refreshCache()).resolves.toEqual([]);

		expect(sonarrCaches.lean.remove).toHaveBeenCalled();
		expect(radarrCaches.lean.remove).toHaveBeenCalled();
		expect(sonarrClient.getSeries).not.toHaveBeenCalled();
		expect(radarrClient.getAllMovies).not.toHaveBeenCalled();
	});

	it("upserts and removes Sonarr cache entries by TVDB ID", async () => {
		const caches = createCaches([createSonarrSnapshot({ title: "Old" })]);
		const library = createSonarrLibrary({}, caches);

		await library.addSeriesToCache(createSonarrSeries({ title: "New" }));
		await library.addSeriesToCache(
			createSonarrSeries({ tvdbId: parseTvdbId(124), title: "Other" }),
		);
		await library.removeSeriesFromCache(parseTvdbId(123));

		expect(caches.lean.value()).toEqual([
			createSonarrSnapshot({ tvdbId: parseTvdbId(124), title: "Other" }),
		]);
	});

	it("upserts and removes Radarr cache entries by TMDB ID", async () => {
		const caches = createCaches([createRadarrSnapshot({ title: "Old" })]);
		const library = createRadarrLibrary({}, caches);

		await library.addMovieToCache(createRadarrMovie({ title: "New" }));
		await library.addMovieToCache(
			createRadarrMovie({ tmdbId: parseTmdbId(457), title: "Other" }),
		);
		await library.removeMovieFromCache(parseTmdbId(456));

		expect(caches.lean.value()).toEqual([
			createRadarrSnapshot({ tmdbId: parseTmdbId(457), title: "Other" }),
		]);
	});
});
