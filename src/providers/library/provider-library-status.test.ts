/** LEGACY: Radarr provider-library status tests retained until Radarr moves into src/providers/radarr. */
// src/providers/library/provider-library-status.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist";
import {
	createDefaultExtensionOptions,
	setExtensionOptionsSnapshot,
} from "@/options";
import { createLibraryHandlers } from "@/rpc/handlers/library.handlers";
import {
	parseRadarrMovieId,
	parseTmdbId,
	type ProviderCredentials,
	type RadarrMovie,
	type RadarrMovieSnapshot,
} from "@/providers";
import type { RadarrClient } from "@/providers/clients/radarr.client";
import type { CacheHit, TtlCache } from "@/shared/cache/ttl-cache";
import { PROVIDER_LIBRARY_CACHE_TTL } from "./cache";
import { RadarrLibrary } from "./radarr-library";
import type { ProviderLibraryCaches } from "./types";

type CacheMode = "miss" | "fresh";

function createMemoryCache<T>(
	initialValue: T | undefined,
	mode: CacheMode = initialValue === undefined ? "miss" : "fresh",
): TtlCache<T> & { value: () => T | undefined } {
	let value = initialValue;
	let currentMode = mode;

	return {
		read: vi.fn(async (): Promise<CacheHit<T> | null> => {
			if (currentMode === "miss" || value === undefined) return null;
			return {
				value,
				stale: false,
				staleAt: Date.now() + 60_000,
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
			sonarrLibrary: { getSeriesLibraryStatusByTvdbId: getSeriesLibraryStatus },
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

describe("legacy Radarr provider library", () => {
	beforeEach(async () => {
		await configureProviders();
		vi.restoreAllMocks();
	});

	it("refreshes a missing cache from Radarr and writes lean snapshots", async () => {
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
	});

	it("force-verifies a mapped movie and updates the lean cache", async () => {
		const movie = createRadarrMovie();
		const client = {
			getMovieByTmdbId: vi.fn(async () => movie),
		};
		const caches = createCaches<RadarrMovieSnapshot>([]);
		const library = createRadarrLibrary(client, caches);

		await expect(
			library.getMovieLibraryStatus({
				tmdbId: parseTmdbId(456),
				forceVerify: true,
			}),
		).resolves.toMatchObject({
			provider: "radarr",
			providerId: parseTmdbId(456),
			isInLibrary: true,
			movie,
		});
		expect(caches.lean.value()).toEqual([createRadarrSnapshot()]);
	});

	it("clears provider caches when credentials are missing", async () => {
		await configureProviders(false);
		const radarrClient = { getAllMovies: vi.fn() };
		const radarrCaches = createCaches([createRadarrSnapshot()]);
		const radarrLibrary = createRadarrLibrary(radarrClient, radarrCaches);

		await expect(radarrLibrary.refreshCache()).resolves.toEqual([]);

		expect(radarrCaches.lean.remove).toHaveBeenCalled();
		expect(radarrClient.getAllMovies).not.toHaveBeenCalled();
	});
});
