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
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([snapshot]);
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
		expect(getAllMovies).not.toHaveBeenCalled();
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
		expect(cache.value()).toEqual([toRadarrMovieSnapshot(movie)]);
	});

	it("force-verifies a TMDB hit and updates the snapshot cache", async () => {
		const movie = createRadarrMovie({
			rootFolderPath: "/movies",
			qualityProfileId: parseProviderQualityProfileId(99),
		});
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([]);
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
		expect(cache.value()).toEqual([toRadarrMovieSnapshot(movie)]);
		expect(onCacheChanged).toHaveBeenCalledTimes(1);
	});

	it("force-verifies a TMDB miss, removes stale cache, and returns lookup data", async () => {
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([
			createSnapshot({ title: "Stale" }),
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
		expect(cache.value()).toEqual([]);
		expect(onCacheChanged).toHaveBeenCalledTimes(1);
	});

	it("returns unknown status without deleting cache when force verification fails", async () => {
		const snapshot = createSnapshot({ title: "Cached" });
		const cache = createMemoryCache<RadarrMovieSnapshot[]>([snapshot]);
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
		expect(cache.value()).toEqual([snapshot]);
		expect(onCacheChanged).not.toHaveBeenCalled();
	});
});
