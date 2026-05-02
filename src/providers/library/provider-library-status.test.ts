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
	type RadarrMovie,
	type RadarrMovieSnapshot,
	type SonarrSeries,
	type SonarrSeriesSnapshot,
} from "@/providers";
import type { RadarrClient } from "@/providers/clients/radarr.client";
import type { SonarrClient } from "@/providers/clients/sonarr.client";
import type {
	CacheHit,
	TtlCache,
} from "@/shared/cache/ttl-cache";
import { PROVIDER_LIBRARY_CACHE_TTL } from "./cache";
import { RadarrLibrary } from "./radarr-library";
import { SonarrLibrary } from "./sonarr-library";
import type { ProviderLibraryCaches } from "./types";

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
	client: Partial<SonarrClient>,
	caches: ProviderLibraryCaches<SonarrSeriesSnapshot>,
): SonarrLibrary {
	return new SonarrLibrary({
		sonarrClient: client as SonarrClient,
		mappingService: createMappingService(),
		manualMappingService: createManualMappingService(),
		anibridgeMappingStore: createSonarrUpstreamStore(),
		caches,
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

describe("provider-target library status", () => {
	beforeEach(async () => {
		await configureProviders();
	});

	it("does not treat a cached same-title Sonarr item as an effective mapping", async () => {
		const mappingService = createMappingService();
		mappingService.resolveProviderId.mockResolvedValue(null);
		mappingService.getAutoMapping.mockResolvedValue(null);
		const client = {
			getAllSeries: vi.fn(),
			getSeriesByTvdbId: vi.fn(),
			lookupSeriesByTvdbId: vi.fn(),
		} as unknown as SonarrClient;
		const library = new SonarrLibrary({
			sonarrClient: client,
			mappingService,
			manualMappingService: createManualMappingService(),
			anibridgeMappingStore: createSonarrUpstreamStore(),
			caches: createCaches([createSonarrSnapshot({ title: "Known Series" })]),
		});

		const status = await library.getSeriesStatus({
			anilistId: parseAniListId(10),
			title: "Known Series",
		});

		expect(status).toMatchObject({
			providerId: null,
			providerMappingState: "unmapped",
			isInLibrary: null,
		});
		expect(client.getSeriesByTvdbId).not.toHaveBeenCalled();
	});
});

describe("provider library cache", () => {
	beforeEach(async () => {
		await configureProviders();
		vi.restoreAllMocks();
	});

	it("refreshes a missing Sonarr cache from the provider and writes lean snapshots", async () => {
		const series = createSonarrSeries();
		const client = { getAllSeries: vi.fn(async () => [series]) };
		const caches = createCaches<SonarrSeriesSnapshot>();
		const library = createSonarrLibrary(client, caches);

		await expect(library.getLeanSeriesList()).resolves.toEqual([
			createSonarrSnapshot(),
		]);

		expect(client.getAllSeries).toHaveBeenCalledWith(
			expect.objectContaining({ apiKey: "sonarr-key" }),
		);
		expect(caches.lean.write).toHaveBeenCalledWith(
			expect.any(String),
			[createSonarrSnapshot()],
			PROVIDER_LIBRARY_CACHE_TTL.normal,
		);
		const written = caches.lean.value()?.[0] as unknown as Record<
			string,
			unknown
		>;
		expect(written).not.toHaveProperty("alternateTitles");
		expect(written).not.toHaveProperty("status");
		expect(written).not.toHaveProperty("statistics");
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

	it("returns stale Sonarr data immediately while refreshing in the background", async () => {
		const stale = createSonarrSnapshot({ title: "Stale Series" });
		const fresh = createSonarrSeries({ title: "Fresh Series" });
		const client = { getAllSeries: vi.fn(async () => [fresh]) };
		const caches = createCaches([stale], "stale");
		const library = createSonarrLibrary(client, caches);

		await expect(library.getLeanSeriesList()).resolves.toEqual([stale]);

		await vi.waitFor(() => {
			expect(caches.lean.write).toHaveBeenCalledWith(
				expect.any(String),
				[createSonarrSnapshot({ title: "Fresh Series" })],
				PROVIDER_LIBRARY_CACHE_TTL.normal,
			);
		});
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

	it("returns fallback data and writes short error TTL when refresh fails", async () => {
		const fallback = createSonarrSnapshot();
		const client = {
			getAllSeries: vi.fn(async () => {
				throw new Error("provider unavailable");
			}),
		};
		const caches = createCaches([fallback], "fresh");
		const library = createSonarrLibrary(client, caches);

		await expect(library.refreshCache()).resolves.toEqual([fallback]);

		expect(caches.lean.write).toHaveBeenCalledWith(
			expect.any(String),
			[fallback],
			expect.objectContaining({
				staleMs: PROVIDER_LIBRARY_CACHE_TTL.error.staleMs,
				hardMs: PROVIDER_LIBRARY_CACHE_TTL.error.hardMs,
				meta: expect.objectContaining({ lastErrorCode: expect.any(String) }),
			}),
		);
	});

	it("clears provider caches when credentials are missing", async () => {
		await configureProviders(false);
		const sonarrClient = { getAllSeries: vi.fn() };
		const sonarrCaches = createCaches([createSonarrSnapshot()]);
		const sonarrLibrary = createSonarrLibrary(sonarrClient, sonarrCaches);
		const radarrClient = { getAllMovies: vi.fn() };
		const radarrCaches = createCaches([createRadarrSnapshot()]);
		const radarrLibrary = createRadarrLibrary(radarrClient, radarrCaches);

		await expect(sonarrLibrary.refreshCache()).resolves.toEqual([]);
		await expect(radarrLibrary.refreshCache()).resolves.toEqual([]);

		expect(sonarrCaches.lean.remove).toHaveBeenCalled();
		expect(radarrCaches.lean.remove).toHaveBeenCalled();
		expect(sonarrClient.getAllSeries).not.toHaveBeenCalled();
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
