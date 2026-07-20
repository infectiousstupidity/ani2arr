/** Tests for Radarr TMDB library status checks and cache updates. */
// src/providers/radarr/library.test.ts

import { describe, expect, it, vi } from "vitest";

import { parseTmdbId } from "@/providers/schemas";
import type { ProviderCredentials } from "@/providers/types";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
	RadarrMovieId,
} from "@/providers/schemas";
import type { CacheHit, TtlCache } from "@/shared/cache/ttl-cache";

import { RadarrClient } from "./client";
import { RadarrLibrary, toRadarrMovieSnapshot } from "./library";
import type {
	RadarrLookupMovie,
	RadarrMovie,
	RadarrMovieSnapshot,
} from "./types";

const credentials: ProviderCredentials = {
	url: "https://radarr.example.test",
	apiKey: "secret",
};
const otherCredentials: ProviderCredentials = {
	url: "https://other-radarr.example.test/base",
	apiKey: "other-secret",
};
const movieCacheKey = "movies:https://radarr.example.test";
const otherMovieCacheKey = "movies:https://other-radarr.example.test/base";

const parseProviderQualityProfileId = (value: number) =>
	value as ProviderQualityProfileId;
const parseProviderTagId = (value: number) => value as ProviderTagId;
const parseRadarrMovieId = (value: number) => value as RadarrMovieId;

function createClient(): RadarrClient {
	return new RadarrClient({
		hasUrlPermission: () => Promise.resolve(true),
	});
}

function createMemoryCache<T>(
	initialEntries: ReadonlyArray<readonly [string, T]> = [],
): TtlCache<T> & {
	value: (key: string) => T | undefined;
	keys: () => string[];
} {
	const values = new Map<string, T>(initialEntries);

	return {
		read: vi.fn(async (key: string): Promise<CacheHit<T> | null> => {
			const value = values.get(key);
			if (value === undefined) return null;

			return {
				value,
				stale: false,
				staleAt: Date.now() + 60_000,
				expiresAt: Date.now() + 120_000,
			};
		}),
		write: vi.fn(async (key: string, nextValue: T) => {
			values.set(key, nextValue);
		}),
		remove: vi.fn(async (key: string) => {
			values.delete(key);
		}),
		clear: vi.fn(async () => {
			values.clear();
		}),
		value: (key: string) => values.get(key),
		keys: () => [...values.keys()],
	};
}

function createDeferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
} {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
}

function createRadarrMovie(input?: Partial<RadarrMovie>): RadarrMovie {
	return {
		id: parseRadarrMovieId(20),
		tmdbId: parseTmdbId(456),
		title: "Known Movie",
		path: "/movies/Known Movie",
		rootFolderPath: "/movies",
		qualityProfileId: parseProviderQualityProfileId(1),
		monitored: true,
		tags: [parseProviderTagId(1)],
		...input,
	};
}

function createLookupMovie(
	input?: Partial<RadarrLookupMovie>,
): RadarrLookupMovie {
	return {
		title: "Lookup Movie",
		tmdbId: parseTmdbId(456),
		folderName: "Lookup Movie",
		...input,
	};
}

function createSnapshot(
	input?: Partial<RadarrMovieSnapshot>,
): RadarrMovieSnapshot {
	return {
		id: parseRadarrMovieId(20),
		tmdbId: parseTmdbId(456),
		title: "Known Movie",
		monitored: true,
		...input,
	};
}

describe("RadarrLibrary movie snapshots", () => {
	it("uses memory after the first snapshot cache read", async () => {
		const snapshot = createSnapshot();
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([
			[movieCacheKey, [snapshot]],
		]);
		const client = createClient();
		const getAllMovies = vi.spyOn(client, "getAllMovies");
		const library = new RadarrLibrary(client, cache);

		await expect(library.getMovieSnapshots(credentials)).resolves.toEqual([
			snapshot,
		]);
		await expect(library.getMovieSnapshots(credentials)).resolves.toEqual([
			snapshot,
		]);

		expect(cache.read).toHaveBeenCalledTimes(1);
		expect(cache.read).toHaveBeenCalledWith(movieCacheKey);
		expect(getAllMovies).not.toHaveBeenCalled();
	});

	it("normalizes the server scope without including API keys", async () => {
		const snapshot = createSnapshot();
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([
			[movieCacheKey, [snapshot]],
		]);
		const client = createClient();
		const library = new RadarrLibrary(client, cache);
		const equivalentCredentials: ProviderCredentials = {
			url: "https://RADARR.example.test:443///",
			apiKey: "rotated-secret",
		};

		await expect(library.getMovieSnapshots(credentials)).resolves.toEqual([
			snapshot,
		]);
		await expect(
			library.getMovieSnapshots(equivalentCredentials),
		).resolves.toEqual([snapshot]);

		expect(cache.read).toHaveBeenCalledTimes(1);
		expect(cache.keys()).toEqual([movieCacheKey]);
		expect(JSON.stringify(cache.keys())).not.toContain(credentials.apiKey);
		expect(JSON.stringify(cache.keys())).not.toContain(
			equivalentCredentials.apiKey,
		);
	});

	it("keeps snapshots separate when the configured server changes", async () => {
		const firstSnapshot = createSnapshot({ title: "First Server" });
		const secondSnapshot = createSnapshot({
			id: parseRadarrMovieId(30),
			tmdbId: parseTmdbId(789),
			title: "Second Server",
		});
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([
			[movieCacheKey, [firstSnapshot]],
			[otherMovieCacheKey, [secondSnapshot]],
		]);
		const library = new RadarrLibrary(createClient(), cache);

		await expect(library.getMovieSnapshots(credentials)).resolves.toEqual([
			firstSnapshot,
		]);
		await expect(
			library.getMovieSnapshots(otherCredentials),
		).resolves.toEqual([secondSnapshot]);
		await expect(library.getMovieSnapshots(credentials)).resolves.toEqual([
			firstSnapshot,
		]);

		expect(cache.read).toHaveBeenCalledTimes(2);
		expect(cache.read).toHaveBeenCalledWith(movieCacheKey);
		expect(cache.read).toHaveBeenCalledWith(otherMovieCacheKey);
	});

	it("uses only the current server fallback when refresh fails", async () => {
		const firstSnapshot = createSnapshot({ title: "First Server" });
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([
			[movieCacheKey, [firstSnapshot]],
		]);
		const client = createClient();
		vi.spyOn(client, "getAllMovies").mockRejectedValue(
			new Error("Second Radarr unavailable"),
		);
		const library = new RadarrLibrary(client, cache);

		await expect(library.getMovieSnapshots(credentials)).resolves.toEqual([
			firstSnapshot,
		]);
		await expect(
			library.refreshMovieSnapshots(otherCredentials),
		).resolves.toEqual([]);

		expect(cache.value(movieCacheKey)).toEqual([firstSnapshot]);
		expect(cache.value(otherMovieCacheKey)).toEqual([]);
		expect(cache.write).toHaveBeenCalledWith(
			otherMovieCacheKey,
			[],
			expect.any(Object),
		);
	});

	it("coalesces refreshes per server without reusing another server request", async () => {
		const firstMovie = createRadarrMovie({ title: "First Server" });
		const secondMovie = createRadarrMovie({
			id: parseRadarrMovieId(30),
			tmdbId: parseTmdbId(789),
			title: "Second Server",
		});
		const firstRefresh = createDeferred<RadarrMovie[]>();
		const secondRefresh = createDeferred<RadarrMovie[]>();
		const cache = createMemoryCache<RadarrMovieSnapshot[]>();
		const client = createClient();
		const getAllMovies = vi
			.spyOn(client, "getAllMovies")
			.mockImplementation((input) =>
				input.url === credentials.url
					? firstRefresh.promise
					: secondRefresh.promise,
			);
		const library = new RadarrLibrary(client, cache);

		const firstRequest = library.refreshMovieSnapshots(credentials);
		const duplicateFirstRequest = library.refreshMovieSnapshots(credentials);
		const secondRequest = library.refreshMovieSnapshots(otherCredentials);
		await vi.waitFor(() => expect(getAllMovies).toHaveBeenCalledTimes(2));

		firstRefresh.resolve([firstMovie]);
		secondRefresh.resolve([secondMovie]);

		await expect(firstRequest).resolves.toEqual([
			toRadarrMovieSnapshot(firstMovie),
		]);
		await expect(duplicateFirstRequest).resolves.toEqual([
			toRadarrMovieSnapshot(firstMovie),
		]);
		await expect(secondRequest).resolves.toEqual([
			toRadarrMovieSnapshot(secondMovie),
		]);
		expect(getAllMovies).toHaveBeenCalledWith(credentials);
		expect(getAllMovies).toHaveBeenCalledWith(otherCredentials);
	});

	it("mutates only the cache for the supplied server", async () => {
		const firstSnapshot = createSnapshot({ title: "First Server" });
		const staleSecondSnapshot = createSnapshot({
			id: parseRadarrMovieId(30),
			tmdbId: parseTmdbId(789),
			title: "Stale Second Server",
		});
		const addedSecondSnapshot = createSnapshot({
			id: parseRadarrMovieId(40),
			tmdbId: parseTmdbId(987),
			title: "Added Second Server",
		});
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([
			[movieCacheKey, [firstSnapshot]],
			[otherMovieCacheKey, [staleSecondSnapshot]],
		]);
		const library = new RadarrLibrary(createClient(), cache);

		await library.upsertMovieSnapshot(addedSecondSnapshot, otherCredentials);
		await library.removeMovieSnapshot(
			staleSecondSnapshot.tmdbId,
			otherCredentials,
		);

		expect(cache.value(movieCacheKey)).toEqual([firstSnapshot]);
		expect(cache.value(otherMovieCacheKey)).toEqual([addedSecondSnapshot]);
	});

	it("clears memory and ignores a refresh completed after clear", async () => {
		const cachedSnapshot = createSnapshot({ title: "Cached Before Clear" });
		const staleMovie = createRadarrMovie({ title: "Stale Refresh" });
		const freshMovie = createRadarrMovie({ title: "Fresh Refresh" });
		const staleRefresh = createDeferred<RadarrMovie[]>();
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([
			[movieCacheKey, [cachedSnapshot]],
		]);
		const client = createClient();
		const getAllMovies = vi
			.spyOn(client, "getAllMovies")
			.mockReturnValueOnce(staleRefresh.promise)
			.mockResolvedValueOnce([freshMovie]);
		const library = new RadarrLibrary(client, cache);

		await expect(library.getMovieSnapshots(credentials)).resolves.toEqual([
			cachedSnapshot,
		]);
		const refreshRequest = library.refreshMovieSnapshots(credentials);
		await vi.waitFor(() => expect(getAllMovies).toHaveBeenCalledTimes(1));
		await library.clearMovieSnapshotCache();
		staleRefresh.resolve([staleMovie]);
		await refreshRequest;

		expect(cache.clear).toHaveBeenCalledTimes(1);
		expect(cache.keys()).toEqual([]);
		await expect(library.getMovieSnapshots(credentials)).resolves.toEqual([
			toRadarrMovieSnapshot(freshMovie),
		]);
		expect(getAllMovies).toHaveBeenCalledTimes(2);
	});

	it("refreshes a missing cache from Radarr and writes movie snapshots", async () => {
		const movie = createRadarrMovie();
		const cache = createMemoryCache<RadarrMovieSnapshot[]>();
		const client = createClient();
		const getAllMovies = vi
			.spyOn(client, "getAllMovies")
			.mockResolvedValue([movie]);
		const library = new RadarrLibrary(client, cache);

		await expect(library.getMovieSnapshots(credentials)).resolves.toEqual([
			createSnapshot(),
		]);

		expect(getAllMovies).toHaveBeenCalledWith(credentials);
		expect(cache.value(movieCacheKey)).toEqual([
			toRadarrMovieSnapshot(movie),
		]);
	});

	it("force-verifies a TMDB hit and updates the snapshot cache", async () => {
		const movie = createRadarrMovie({
			rootFolderPath: "/movies",
			qualityProfileId: parseProviderQualityProfileId(99),
		});
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([
			[movieCacheKey, []],
		]);
		const client = createClient();
		const findMovieByTmdbId = vi
			.spyOn(client, "findMovieByTmdbId")
			.mockResolvedValue(movie);
		const lookupMovieByTmdbId = vi.spyOn(client, "lookupMovieByTmdbId");
		const onCacheChanged = vi.fn();
		const library = new RadarrLibrary(client, cache);

		await expect(
			library.getMovieLibraryStatusByTmdbId({
				tmdbId: parseTmdbId(456),
				credentials,
				forceVerify: true,
				onCacheChanged,
			}),
		).resolves.toMatchObject({
			provider: "radarr",
			providerId: parseTmdbId(456),
			isInLibrary: true,
			movie: {
				...movie,
				rootFolderPath: "/movies",
				qualityProfileId: parseProviderQualityProfileId(99),
			},
		});

		expect(findMovieByTmdbId).toHaveBeenCalledWith(
			parseTmdbId(456),
			credentials,
		);
		expect(lookupMovieByTmdbId).not.toHaveBeenCalled();
		expect(cache.value(movieCacheKey)).toEqual([
			toRadarrMovieSnapshot(movie),
		]);
		expect(onCacheChanged).toHaveBeenCalledTimes(1);
	});

	it("force-verifies a TMDB miss, removes stale cache, and returns lookup data", async () => {
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([
			[movieCacheKey, [createSnapshot({ title: "Stale" })]],
		]);
		const client = createClient();
		vi.spyOn(client, "findMovieByTmdbId").mockResolvedValue(null);
		const lookupMovieByTmdbId = vi
			.spyOn(client, "lookupMovieByTmdbId")
			.mockResolvedValue(createLookupMovie());
		const onCacheChanged = vi.fn();
		const library = new RadarrLibrary(client, cache);

		await expect(
			library.getMovieLibraryStatusByTmdbId({
				tmdbId: parseTmdbId(456),
				credentials,
				forceVerify: true,
				onCacheChanged,
			}),
		).resolves.toMatchObject({
			provider: "radarr",
			providerId: parseTmdbId(456),
			isInLibrary: false,
			movie: {
				title: "Lookup Movie",
				tmdbId: parseTmdbId(456),
			},
		});

		expect(lookupMovieByTmdbId).toHaveBeenCalledWith(
			parseTmdbId(456),
			credentials,
		);
		expect(cache.value(movieCacheKey)).toEqual([]);
		expect(onCacheChanged).toHaveBeenCalledTimes(1);
	});

	it("returns unknown status without deleting cache when force verification fails", async () => {
		const snapshot = createSnapshot({ title: "Cached" });
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([
			[movieCacheKey, [snapshot]],
		]);
		const client = createClient();
		vi.spyOn(client, "findMovieByTmdbId").mockRejectedValue(
			new Error("Radarr unavailable"),
		);
		const lookupMovieByTmdbId = vi.spyOn(client, "lookupMovieByTmdbId");
		const onCacheChanged = vi.fn();
		const library = new RadarrLibrary(client, cache);

		await expect(
			library.getMovieLibraryStatusByTmdbId({
				tmdbId: parseTmdbId(456),
				credentials,
				forceVerify: true,
				onCacheChanged,
			}),
		).resolves.toMatchObject({
			provider: "radarr",
			providerId: parseTmdbId(456),
			isInLibrary: null,
			libraryUnknownReason: "library-check-failed",
		});

		expect(lookupMovieByTmdbId).not.toHaveBeenCalled();
		expect(cache.value(movieCacheKey)).toEqual([snapshot]);
		expect(onCacheChanged).not.toHaveBeenCalled();
	});
});
