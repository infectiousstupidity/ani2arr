/** Tests for Radarr TMDB library status checks and cache updates. */
// src/providers/radarr/library.test.ts

import { describe, expect, it, vi } from "vitest";
import {
	parseRadarrMovieId,
	parseTmdbId,
	type ProviderCredentials,
} from "@/providers";
import type { CacheHit, TtlCache } from "@/shared/cache/ttl-cache";
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

function createMemoryCache<T>(
	initialValue?: T,
): TtlCache<T> & { value: () => T | undefined } {
	let value = initialValue;

	return {
		read: vi.fn(async (): Promise<CacheHit<T> | null> => {
			if (value === undefined) return null;
			return {
				value,
				stale: false,
				staleAt: Date.now() + 60_000,
				expiresAt: Date.now() + 120_000,
			};
		}),
		write: vi.fn(async (_key: string, nextValue: T) => {
			value = nextValue;
		}),
		remove: vi.fn(async () => {
			value = undefined;
		}),
		clear: vi.fn(async () => {
			value = undefined;
		}),
		value: () => value,
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
		...input,
	};
}

describe("RadarrLibrary movie snapshots", () => {
	it("refreshes a missing cache from Radarr and writes movie snapshots", async () => {
		const movie = createRadarrMovie();
		const cache = createMemoryCache<RadarrMovieSnapshot[]>();
		const client = {
			getAllMovies: vi.fn(async () => [movie]),
			findMovieByTmdbId: vi.fn(),
			lookupMovieByTmdbId: vi.fn(),
		};
		const library = new RadarrLibrary({ client, cache });

		await expect(library.getMovieSnapshots(credentials)).resolves.toEqual([
			createSnapshot(),
		]);

		expect(client.getAllMovies).toHaveBeenCalledWith(credentials);
		expect(cache.value()).toEqual([toRadarrMovieSnapshot(movie)]);
	});
});

describe("RadarrLibrary library status", () => {
	it("force-verifies a TMDB hit and updates the snapshot cache", async () => {
		const movie = createRadarrMovie();
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([]);
		const client = {
			getAllMovies: vi.fn(async () => []),
			findMovieByTmdbId: vi.fn(async () => movie),
			lookupMovieByTmdbId: vi.fn(),
		};
		const onCacheChanged = vi.fn();
		const library = new RadarrLibrary({ client, cache });

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
			movie: createSnapshot(),
		});

		expect(client.findMovieByTmdbId).toHaveBeenCalledWith(
			parseTmdbId(456),
			credentials,
		);
		expect(client.lookupMovieByTmdbId).not.toHaveBeenCalled();
		expect(cache.value()).toEqual([toRadarrMovieSnapshot(movie)]);
		expect(onCacheChanged).toHaveBeenCalledTimes(1);
	});

	it("force-verifies a TMDB miss, removes stale cache, and returns lookup data", async () => {
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([
			createSnapshot({ title: "Stale" }),
		]);
		const client = {
			getAllMovies: vi.fn(async () => []),
			findMovieByTmdbId: vi.fn(async () => null),
			lookupMovieByTmdbId: vi.fn(async () => createLookupMovie()),
		};
		const onCacheChanged = vi.fn();
		const library = new RadarrLibrary({ client, cache });

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
			movie: { title: "Lookup Movie", tmdbId: parseTmdbId(456) },
		});

		expect(client.lookupMovieByTmdbId).toHaveBeenCalledWith(
			parseTmdbId(456),
			credentials,
		);
		expect(cache.value()).toEqual([]);
		expect(onCacheChanged).toHaveBeenCalledTimes(1);
	});

	it("returns unknown status without deleting cache when force verification fails", async () => {
		const snapshot = createSnapshot({ title: "Cached" });
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([snapshot]);
		const client = {
			getAllMovies: vi.fn(async () => []),
			findMovieByTmdbId: vi.fn(async () => {
				throw new Error("Radarr unavailable");
			}),
			lookupMovieByTmdbId: vi.fn(),
		};
		const onCacheChanged = vi.fn();
		const library = new RadarrLibrary({ client, cache });

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

		expect(client.lookupMovieByTmdbId).not.toHaveBeenCalled();
		expect(cache.value()).toEqual([snapshot]);
		expect(onCacheChanged).not.toHaveBeenCalled();
	});
});
