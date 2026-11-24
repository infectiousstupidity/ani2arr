/** Shared contract tests for Sonarr and Radarr library caches. */

import { describe, expect, it, vi } from "vitest";
import { createDeferred, createMemoryCache } from "./provider-test-helpers";
import { RadarrClient } from "./radarr/client";
import { RadarrLibrary, toRadarrMovieSnapshot } from "./radarr/library";
import type {
	RadarrLookupMovie,
	RadarrMovie,
	RadarrMovieSnapshot,
} from "./radarr/types";
import type {
	ProviderQualityProfileId,
	RadarrMovieId,
	SonarrSeriesId,
} from "./schemas";
import { parseTmdbId, parseTvdbId } from "./schemas";
import { SonarrClient } from "./sonarr/client";
import { SonarrLibrary, toSonarrSeriesSnapshot } from "./sonarr/library";
import type {
	SonarrLookupSeries,
	SonarrSeries,
	SonarrSeriesSnapshot,
} from "./sonarr/types";
import type { ProviderCredentials } from "./types";

const CACHE_TTL = {
	staleMs: 60_000,
	hardMs: 120_000,
};

type AnyMock = ReturnType<typeof vi.fn>;
type MemoryCache = ReturnType<typeof createMemoryCache<unknown[]>>;

type LibraryStatus = {
	providerId: number;
	isInLibrary: boolean | null;
	libraryUnknownReason?: string;
};

type LibraryHarness = {
	credentials: ProviderCredentials;
	equivalentCredentials: ProviderCredentials;
	otherCredentials: ProviderCredentials;
	cacheKey: string;
	otherCacheKey: string;
	providerId: number;
	snapshot: unknown;
	otherSnapshot: unknown;
	entity: unknown;
	otherEntity: unknown;
	lookupEntity: unknown;
	cache: MemoryCache;
	fetchAll: AnyMock;
	find: AnyMock;
	lookup: AnyMock;
	onChanged: AnyMock;
	getSnapshots(credentials: ProviderCredentials): Promise<unknown[]>;
	refresh(credentials: ProviderCredentials): Promise<unknown[]>;
	clear(): Promise<void>;
	nonForcedStatus(): Promise<LibraryStatus>;
	upsert(credentials?: ProviderCredentials): Promise<boolean>;
	upsertOther(): Promise<boolean>;
	remove(): Promise<boolean>;
	status(
		providerId: number,
		onCacheChanged: () => void,
	): Promise<LibraryStatus>;
};

const qualityProfileId = 1 as ProviderQualityProfileId;

function sonarrSeries(overrides: Partial<SonarrSeries> = {}): SonarrSeries {
	return {
		id: 10 as SonarrSeriesId,
		tvdbId: parseTvdbId(123),
		title: "Known Series",
		titleSlug: "known-series",
		qualityProfileId,
		rootFolderPath: "/series",
		path: "/series/Known Series",
		monitored: true,
		monitorNewItems: "all",
		seriesType: "anime",
		seasonFolder: true,
		tags: [],
		...overrides,
	};
}

function radarrMovie(overrides: Partial<RadarrMovie> = {}): RadarrMovie {
	return {
		id: 20 as RadarrMovieId,
		tmdbId: parseTmdbId(456),
		title: "Known Movie",
		qualityProfileId,
		rootFolderPath: "/movies",
		path: "/movies/Known Movie",
		monitored: true,
		tags: [],
		...overrides,
	};
}

function createSonarrHarness(): LibraryHarness {
	const credentials: ProviderCredentials = {
		url: "https://sonarr.example.test",
		apiKey: "secret",
	};
	const equivalentCredentials: ProviderCredentials = {
		url: "https://SONARR.example.test:443///",
		apiKey: "rotated-secret",
	};
	const otherCredentials: ProviderCredentials = {
		url: "https://other-sonarr.example.test/base",
		apiKey: "other-secret",
	};
	const entity = sonarrSeries();
	const otherEntity = sonarrSeries({
		id: 20 as SonarrSeriesId,
		tvdbId: parseTvdbId(789),
		title: "Other Series",
		titleSlug: "other-series",
	});
	const lookupEntity: SonarrLookupSeries = {
		title: "Lookup Series",
		tvdbId: entity.tvdbId,
		folder: "Lookup Series",
	};
	const cache = createMemoryCache<SonarrSeriesSnapshot[]>();
	const client = new SonarrClient({
		hasUrlPermission: async () => true,
	});
	const fetchAll = vi.spyOn(client, "getAllSeries");
	const find = vi.spyOn(client, "findSeriesByTvdbId");
	const lookup = vi.spyOn(client, "lookupSeriesByTvdbId");
	const onChanged = vi.fn();
	const library = new SonarrLibrary(client, cache, onChanged);

	return {
		credentials,
		equivalentCredentials,
		otherCredentials,
		cacheKey: "series:https://sonarr.example.test",
		otherCacheKey: "series:https://other-sonarr.example.test/base",
		providerId: entity.tvdbId,
		snapshot: toSonarrSeriesSnapshot(entity),
		otherSnapshot: toSonarrSeriesSnapshot(otherEntity),
		entity,
		otherEntity,
		lookupEntity,
		cache: cache as unknown as MemoryCache,
		fetchAll: fetchAll as unknown as AnyMock,
		find: find as unknown as AnyMock,
		lookup: lookup as unknown as AnyMock,
		onChanged,
		getSnapshots: (inputCredentials) =>
			library.getSeriesSnapshots(inputCredentials),
		refresh: (inputCredentials) =>
			library.refreshSeriesSnapshots(inputCredentials),
		clear: () => library.clearSeriesSnapshotCache(),
		nonForcedStatus: () =>
			library.getSeriesLibraryStatusByTvdbId({
				tvdbId: entity.tvdbId,
				credentials,
			}),
		upsert: (inputCredentials = credentials) =>
			library.upsertSeriesSnapshot(toSonarrSeriesSnapshot(entity), inputCredentials),
		upsertOther: () =>
			library.upsertSeriesSnapshot(toSonarrSeriesSnapshot(otherEntity), equivalentCredentials),
		remove: () => library.removeSeriesSnapshot(entity.tvdbId, credentials),
		status: (providerId, onCacheChanged) =>
			library.getSeriesLibraryStatusByTvdbId({
				tvdbId: parseTvdbId(providerId),
				credentials,
				forceVerify: true,
				onCacheChanged,
			}),
	};
}

function createRadarrHarness(): LibraryHarness {
	const credentials: ProviderCredentials = {
		url: "https://radarr.example.test",
		apiKey: "secret",
	};
	const equivalentCredentials: ProviderCredentials = {
		url: "https://RADARR.example.test:443///",
		apiKey: "rotated-secret",
	};
	const otherCredentials: ProviderCredentials = {
		url: "https://other-radarr.example.test/base",
		apiKey: "other-secret",
	};
	const entity = radarrMovie();
	const otherEntity = radarrMovie({
		id: 30 as RadarrMovieId,
		tmdbId: parseTmdbId(789),
		title: "Other Movie",
	});
	const lookupEntity: RadarrLookupMovie = {
		title: "Lookup Movie",
		tmdbId: entity.tmdbId,
		folderName: "Lookup Movie",
	};
	const cache = createMemoryCache<RadarrMovieSnapshot[]>();
	const client = new RadarrClient({
		hasUrlPermission: async () => true,
	});
	const fetchAll = vi.spyOn(client, "getAllMovies");
	const find = vi.spyOn(client, "findMovieByTmdbId");
	const lookup = vi.spyOn(client, "lookupMovieByTmdbId");
	const onChanged = vi.fn();
	const library = new RadarrLibrary(client, cache, onChanged);

	return {
		credentials,
		equivalentCredentials,
		otherCredentials,
		cacheKey: "movies:https://radarr.example.test",
		otherCacheKey: "movies:https://other-radarr.example.test/base",
		providerId: entity.tmdbId,
		snapshot: toRadarrMovieSnapshot(entity),
		otherSnapshot: toRadarrMovieSnapshot(otherEntity),
		entity,
		otherEntity,
		lookupEntity,
		cache: cache as unknown as MemoryCache,
		fetchAll: fetchAll as unknown as AnyMock,
		find: find as unknown as AnyMock,
		lookup: lookup as unknown as AnyMock,
		onChanged,
		getSnapshots: (inputCredentials) =>
			library.getMovieSnapshots(inputCredentials),
		refresh: (inputCredentials) =>
			library.refreshMovieSnapshots(inputCredentials),
		clear: () => library.clearMovieSnapshotCache(),
		nonForcedStatus: () =>
			library.getMovieLibraryStatusByTmdbId({
				tmdbId: entity.tmdbId,
				credentials,
			}),
		upsert: (inputCredentials = credentials) =>
			library.upsertMovieSnapshot(toRadarrMovieSnapshot(entity), inputCredentials),
		upsertOther: () =>
			library.upsertMovieSnapshot(toRadarrMovieSnapshot(otherEntity), equivalentCredentials),
		remove: () => library.removeMovieSnapshot(entity.tmdbId, credentials),
		status: (providerId, onCacheChanged) =>
			library.getMovieLibraryStatusByTmdbId({
				tmdbId: parseTmdbId(providerId),
				credentials,
				forceVerify: true,
				onCacheChanged,
			}),
	};
}

const libraryCases: ReadonlyArray<{
	name: string;
	create: () => LibraryHarness;
}> = [
	{ name: "Sonarr", create: createSonarrHarness },
	{ name: "Radarr", create: createRadarrHarness },
];

function pauseNextWrite(cache: MemoryCache) {
	const started = createDeferred<void>();
	const finish = createDeferred<void>();
	vi.mocked(cache.write).mockImplementationOnce(async (...args) => {
		started.resolve();
		await finish.promise;
		await cache.write(...args);
	});
	return { started: started.promise, resume: () => finish.resolve() };
}

describe("Arr library cache contract", () => {
	describe.each(libraryCases)("$name snapshot races", ({ create }) => {
		it("keeps both concurrent additions on a warm cache", async () => {
			const harness = create();
			await harness.cache.write(harness.cacheKey, [], CACHE_TTL);
			await harness.getSnapshots(harness.credentials);
			const write = pauseNextWrite(harness.cache);

			const first = harness.upsert();
			await write.started;
			const second = harness.upsertOther();
			write.resume();

			await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
			const expected = [harness.snapshot, harness.otherSnapshot];
			expect(harness.cache.value(harness.cacheKey)).toEqual(expected);
			await expect(harness.getSnapshots(harness.credentials)).resolves.toEqual(expected);
		});

		it("does not resurrect an entry removed during an upsert", async () => {
			const harness = create();
			await harness.cache.write(harness.cacheKey, [harness.snapshot], CACHE_TTL);
			await harness.getSnapshots(harness.credentials);
			const write = pauseNextWrite(harness.cache);

			const upsert = harness.upsertOther();
			await write.started;
			const remove = harness.remove();
			write.resume();

			await expect(Promise.all([upsert, remove])).resolves.toEqual([true, true]);
			expect(harness.cache.value(harness.cacheKey)).toEqual([harness.otherSnapshot]);
			await expect(harness.getSnapshots(harness.credentials)).resolves.toEqual([
				harness.otherSnapshot,
			]);
		});

		it.each(["successful", "failed"])(
			"keeps a newer upsert when a %s refresh finishes",
			async (outcome) => {
				const harness = create();
				await harness.cache.write(harness.cacheKey, [harness.snapshot], CACHE_TTL);
				await harness.getSnapshots(harness.credentials);
				const started = createDeferred<void>();
				const finish = createDeferred<void>();
				harness.fetchAll.mockImplementationOnce(async () => {
					started.resolve();
					await finish.promise;
					if (outcome === "failed") throw new Error("unavailable");
					return [harness.entity];
				});

				const refresh = harness.refresh(harness.credentials);
				await started.promise;
				await expect(harness.upsertOther()).resolves.toBe(true);
				finish.resolve();
				const expected = [harness.snapshot, harness.otherSnapshot];
				await expect(refresh).resolves.toEqual(expected);
				expect(harness.cache.value(harness.cacheKey)).toEqual(expected);
				await expect(harness.getSnapshots(harness.credentials)).resolves.toEqual(expected);
				expect(harness.cache.write).toHaveBeenCalledTimes(2);
			},
		);

		it("clears an in-flight write and discards a queued mutation", async () => {
			const harness = create();
			await harness.cache.write(harness.cacheKey, [], CACHE_TTL);
			const write = pauseNextWrite(harness.cache);

			const first = harness.upsert();
			await write.started;
			const second = harness.upsertOther();
			const clear = harness.clear();
			write.resume();

			await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
			await clear;
			expect(harness.cache.keys()).toEqual([]);
			harness.fetchAll.mockResolvedValue([]);
			await expect(harness.getSnapshots(harness.credentials)).resolves.toEqual([]);
			expect(harness.fetchAll).toHaveBeenCalledOnce();
		});

		it("recovers after a write failure without blocking another connection", async () => {
			const harness = create();
			await harness.cache.write(harness.cacheKey, [], CACHE_TTL);
			await harness.cache.write(harness.otherCacheKey, [], CACHE_TTL);
			const started = createDeferred<void>();
			const finish = createDeferred<void>();
			vi.mocked(harness.cache.write).mockImplementationOnce(async () => {
				started.resolve();
				await finish.promise;
				throw new Error("storage unavailable");
			});

			const failed = expect(harness.upsert()).rejects.toThrow("storage unavailable");
			await started.promise;
			const queued = harness.upsertOther();
			await expect(harness.upsert(harness.otherCredentials)).resolves.toBe(true);
			finish.resolve();

			await failed;
			await expect(queued).resolves.toBe(true);
			expect(harness.cache.value(harness.cacheKey)).toEqual([harness.otherSnapshot]);
			expect(harness.cache.value(harness.otherCacheKey)).toEqual([harness.snapshot]);
			await expect(harness.getSnapshots(harness.credentials)).resolves.toEqual([
				harness.otherSnapshot,
			]);
		});

		it("lets a refresh callback mutate and refresh the same connection", async () => {
			const harness = create();
			harness.fetchAll
				.mockResolvedValueOnce([harness.entity])
				.mockResolvedValueOnce([harness.entity, harness.otherEntity]);
			harness.onChanged.mockImplementationOnce(async () => {
				await harness.upsertOther();
				await harness.refresh(harness.credentials);
			});

			await harness.refresh(harness.credentials);
			const expected = [harness.snapshot, harness.otherSnapshot];
			expect(harness.cache.value(harness.cacheKey)).toEqual(expected);
			await expect(harness.getSnapshots(harness.credentials)).resolves.toEqual(expected);
			expect(harness.fetchAll).toHaveBeenCalledTimes(2);
		});
	});

	it.each(libraryCases)(
		"reports unknown after a cold $name refresh failure",
		async ({ create }) => {
			const harness = create();
			harness.fetchAll.mockRejectedValue(new Error("unavailable"));
			await expect(harness.nonForcedStatus()).resolves.toMatchObject({
				isInLibrary: null,
				libraryUnknownReason: "library-check-failed",
			});
			expect(harness.cache.keys()).toEqual([]);
			expect(harness.cache.write).not.toHaveBeenCalled();
			harness.fetchAll.mockResolvedValue([harness.entity]);
			await expect(harness.getSnapshots(harness.credentials)).resolves.toEqual([
				harness.snapshot,
			]);
			expect(harness.fetchAll).toHaveBeenCalled();
		},
	);

	it.each(libraryCases)(
		"verifies live after a cold $name refresh failure",
		async ({ create }) => {
			const harness = create();
			harness.fetchAll.mockRejectedValue(new Error("unavailable"));
			harness.find.mockResolvedValue(harness.entity);
			await expect(
				harness.status(harness.providerId, vi.fn()),
			).resolves.toMatchObject({ isInLibrary: true });
			expect(harness.cache.keys()).toEqual([]);
		},
	);

	it.each(libraryCases)(
		"preserves a confirmed $name live hit when cache reads fail",
		async ({ create }) => {
			const harness = create();
			vi.mocked(harness.cache.read).mockRejectedValue(
				new Error("cache unavailable"),
			);
			harness.find.mockResolvedValue(harness.entity);
			await expect(
				harness.status(harness.providerId, vi.fn()),
			).resolves.toMatchObject({ isInLibrary: true });
			expect(harness.cache.read).toHaveBeenCalledTimes(2);
		},
	);

	it.each(libraryCases)(
		"serves the cached $name list after refresh failure",
		async ({ create }) => {
			const harness = create();
			await harness.cache.write(
				harness.cacheKey,
				[harness.snapshot],
				CACHE_TTL,
			);
			harness.fetchAll.mockRejectedValue(new Error("unavailable"));
			await expect(harness.refresh(harness.credentials)).resolves.toEqual([
				harness.snapshot,
			]);
			await expect(harness.getSnapshots(harness.credentials)).resolves.toEqual([
				harness.snapshot,
			]);
		},
	);

	it.each(libraryCases)(
		"does not upsert a cold $name library",
		async ({ create }) => {
			const harness = create();
			await expect(harness.upsert()).resolves.toBe(false);
			expect(harness.cache.keys()).toEqual([]);
			expect(harness.cache.write).not.toHaveBeenCalled();
			harness.fetchAll.mockResolvedValue([harness.entity]);
			await expect(harness.getSnapshots(harness.credentials)).resolves.toEqual([
				harness.snapshot,
			]);
			expect(harness.fetchAll).toHaveBeenCalled();
		},
	);

	it.each(libraryCases)(
		"normalizes and isolates $name server cache scopes",
		async ({ create }) => {
			const harness = create();

			await harness.cache.write(
				harness.cacheKey,
				[harness.snapshot],
				CACHE_TTL,
			);
			await harness.cache.write(
				harness.otherCacheKey,
				[harness.otherSnapshot],
				CACHE_TTL,
			);
			vi.mocked(harness.cache.read).mockClear();

			await expect(harness.getSnapshots(harness.credentials)).resolves.toEqual([
				harness.snapshot,
			]);
			await expect(
				harness.getSnapshots(harness.equivalentCredentials),
			).resolves.toEqual([harness.snapshot]);
			await expect(
				harness.getSnapshots(harness.otherCredentials),
			).resolves.toEqual([harness.otherSnapshot]);

			expect(harness.cache.read).toHaveBeenCalledTimes(2);
			expect(harness.cache.keys()).toEqual([
				harness.cacheKey,
				harness.otherCacheKey,
			]);
			expect(harness.fetchAll).not.toHaveBeenCalled();
		},
	);

	it.each(libraryCases)(
		"coalesces $name refreshes per server",
		async ({ create }) => {
			const harness = create();
			const firstRefresh = createDeferred<unknown[]>();
			const secondRefresh = createDeferred<unknown[]>();

			harness.fetchAll.mockImplementation((input: ProviderCredentials) =>
				input.url === harness.credentials.url
					? firstRefresh.promise
					: secondRefresh.promise,
			);

			const first = harness.refresh(harness.credentials);
			const duplicate = harness.refresh(harness.credentials);
			const second = harness.refresh(harness.otherCredentials);

			await vi.waitFor(() => expect(harness.fetchAll).toHaveBeenCalledTimes(2));

			firstRefresh.resolve([harness.entity]);
			secondRefresh.resolve([harness.otherEntity]);

			await expect(first).resolves.toEqual([harness.snapshot]);
			await expect(duplicate).resolves.toEqual([harness.snapshot]);
			await expect(second).resolves.toEqual([harness.otherSnapshot]);
			expect(harness.onChanged).toHaveBeenCalledTimes(2);
		},
	);

	it.each(libraryCases)(
		"ignores a stale $name refresh completed after cache clear",
		async ({ create }) => {
			const harness = create();
			const staleRefresh = createDeferred<unknown[]>();

			await harness.cache.write(
				harness.cacheKey,
				[harness.snapshot],
				CACHE_TTL,
			);
			await harness.getSnapshots(harness.credentials);

			harness.fetchAll
				.mockReturnValueOnce(staleRefresh.promise)
				.mockResolvedValueOnce([harness.otherEntity]);

			const refresh = harness.refresh(harness.credentials);
			await vi.waitFor(() => expect(harness.fetchAll).toHaveBeenCalledOnce());

			await harness.clear();
			staleRefresh.resolve([harness.entity]);
			await refresh;

			expect(harness.cache.keys()).toEqual([]);
			await expect(harness.getSnapshots(harness.credentials)).resolves.toEqual([
				harness.otherSnapshot,
			]);
			expect(harness.fetchAll).toHaveBeenCalledTimes(2);
		},
	);

	it.each(libraryCases)(
		"updates stale $name cache state after live verification",
		async ({ create }) => {
			const harness = create();
			const onCacheChanged = vi.fn();

			await harness.cache.write(harness.cacheKey, [], CACHE_TTL);
			harness.find.mockResolvedValueOnce(harness.entity);

			await expect(
				harness.status(harness.providerId, onCacheChanged),
			).resolves.toMatchObject({
				providerId: harness.providerId,
				isInLibrary: true,
			});

			expect(harness.lookup).not.toHaveBeenCalled();
			expect(harness.cache.value(harness.cacheKey)).toEqual([harness.snapshot]);

			harness.find.mockResolvedValueOnce(null);
			harness.lookup.mockResolvedValueOnce(harness.lookupEntity);

			await expect(
				harness.status(harness.providerId, onCacheChanged),
			).resolves.toMatchObject({
				providerId: harness.providerId,
				isInLibrary: false,
			});

			expect(harness.cache.value(harness.cacheKey)).toEqual([]);
			expect(onCacheChanged).toHaveBeenCalledTimes(2);
		},
	);

	it.each(libraryCases)(
		"returns unknown when the live $name check fails",
		async ({ create }) => {
			const harness = create();

			await harness.cache.write(harness.cacheKey, [], CACHE_TTL);
			harness.find.mockRejectedValueOnce(new Error("Provider unavailable"));

			await expect(
				harness.status(harness.providerId, vi.fn()),
			).resolves.toMatchObject({
				providerId: harness.providerId,
				isInLibrary: null,
				libraryUnknownReason: "library-check-failed",
			});
		},
	);

	it("projects only provider fields used by cached status views", () => {
		expect(
			toSonarrSeriesSnapshot(
				sonarrSeries({
					alternateTitles: [{ title: " Alternate " }, { title: " " }],
					status: "continuing",
					statistics: {
						episodeCount: 12,
						episodeFileCount: 8,
						totalEpisodeCount: 24,
					},
				}),
			),
		).toMatchObject({
			tvdbId: parseTvdbId(123),
			title: "Known Series",
			alternateTitles: ["Alternate"],
			status: "continuing",
			statistics: {
				episodeCount: 12,
				episodeFileCount: 8,
				totalEpisodeCount: 24,
			},
		});

		expect(
			toRadarrMovieSnapshot(
				radarrMovie({
					titleSlug: "known-movie",
					originalTitle: "Original Movie",
					year: 2025,
					alternateTitles: [{ title: " Alternate " }],
					hasFile: true,
					sizeOnDisk: 1024,
					status: "released",
				}),
			),
		).toMatchObject({
			tmdbId: parseTmdbId(456),
			title: "Known Movie",
			titleSlug: "known-movie",
			originalTitle: "Original Movie",
			year: 2025,
			alternateTitles: ["Alternate"],
			hasFile: true,
			sizeOnDisk: 1024,
			status: "released",
		});
	});
});
