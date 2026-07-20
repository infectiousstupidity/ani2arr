/** Tests for Sonarr TVDB library status checks and cache updates. */
// src/providers/sonarr/library.test.ts

import { describe, expect, it, vi } from "vitest";

import { parseTvdbId } from "@/providers/schemas";
import type { ProviderCredentials } from "@/providers/types";
import type {
	ProviderQualityProfileId,
	SonarrSeriesId,
} from "@/providers/schemas";
import type { CacheHit, TtlCache } from "@/shared/cache/ttl-cache";

import { SonarrClient } from "./client";
import { SonarrLibrary, toSonarrSeriesSnapshot } from "./library";
import type {
	SonarrLookupSeries,
	SonarrSeries,
	SonarrSeriesSnapshot,
} from "./types";

const credentials: ProviderCredentials = {
	url: "https://sonarr.example.test",
	apiKey: "secret",
};
const otherCredentials: ProviderCredentials = {
	url: "https://other-sonarr.example.test/base",
	apiKey: "other-secret",
};
const seriesCacheKey = "series:https://sonarr.example.test";
const otherSeriesCacheKey =
	"series:https://other-sonarr.example.test/base";

const parseProviderQualityProfileId = (value: number) =>
	value as ProviderQualityProfileId;
const parseSonarrSeriesId = (value: number) => value as SonarrSeriesId;

function createClient(): SonarrClient {
	return new SonarrClient({
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

function createLookupSeries(
	input?: Partial<SonarrLookupSeries>,
): SonarrLookupSeries {
	return {
		title: "Lookup Series",
		tvdbId: parseTvdbId(123),
		folder: "Lookup Series",
		...input,
	};
}

function createSnapshot(
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

describe("SonarrLibrary library status", () => {
	it("uses memory after the first snapshot cache read", async () => {
		const snapshot = createSnapshot();
		const cache = createMemoryCache<SonarrSeriesSnapshot[]>([
			[seriesCacheKey, [snapshot]],
		]);
		const client = createClient();
		const getAllSeries = vi.spyOn(client, "getAllSeries");
		const library = new SonarrLibrary(client, cache);

		await expect(library.getSeriesSnapshots(credentials)).resolves.toEqual([
			snapshot,
		]);
		await expect(library.getSeriesSnapshots(credentials)).resolves.toEqual([
			snapshot,
		]);

		expect(cache.read).toHaveBeenCalledTimes(1);
		expect(cache.read).toHaveBeenCalledWith(seriesCacheKey);
		expect(getAllSeries).not.toHaveBeenCalled();
	});

	it("normalizes the server scope without including API keys", async () => {
		const snapshot = createSnapshot();
		const cache = createMemoryCache<SonarrSeriesSnapshot[]>([
			[seriesCacheKey, [snapshot]],
		]);
		const client = createClient();
		const library = new SonarrLibrary(client, cache);
		const equivalentCredentials: ProviderCredentials = {
			url: "https://SONARR.example.test:443///",
			apiKey: "rotated-secret",
		};

		await expect(library.getSeriesSnapshots(credentials)).resolves.toEqual([
			snapshot,
		]);
		await expect(
			library.getSeriesSnapshots(equivalentCredentials),
		).resolves.toEqual([snapshot]);

		expect(cache.read).toHaveBeenCalledTimes(1);
		expect(cache.keys()).toEqual([seriesCacheKey]);
		expect(JSON.stringify(cache.keys())).not.toContain(credentials.apiKey);
		expect(JSON.stringify(cache.keys())).not.toContain(
			equivalentCredentials.apiKey,
		);
	});

	it("keeps snapshots separate when the configured server changes", async () => {
		const firstSnapshot = createSnapshot({ title: "First Server" });
		const secondSnapshot = createSnapshot({
			id: parseSonarrSeriesId(20),
			tvdbId: parseTvdbId(456),
			title: "Second Server",
		});
		const cache = createMemoryCache<SonarrSeriesSnapshot[]>([
			[seriesCacheKey, [firstSnapshot]],
			[otherSeriesCacheKey, [secondSnapshot]],
		]);
		const library = new SonarrLibrary(createClient(), cache);

		await expect(library.getSeriesSnapshots(credentials)).resolves.toEqual([
			firstSnapshot,
		]);
		await expect(
			library.getSeriesSnapshots(otherCredentials),
		).resolves.toEqual([secondSnapshot]);
		await expect(library.getSeriesSnapshots(credentials)).resolves.toEqual([
			firstSnapshot,
		]);

		expect(cache.read).toHaveBeenCalledTimes(2);
		expect(cache.read).toHaveBeenCalledWith(seriesCacheKey);
		expect(cache.read).toHaveBeenCalledWith(otherSeriesCacheKey);
	});

	it("uses only the current server fallback when refresh fails", async () => {
		const firstSnapshot = createSnapshot({ title: "First Server" });
		const cache = createMemoryCache<SonarrSeriesSnapshot[]>([
			[seriesCacheKey, [firstSnapshot]],
		]);
		const client = createClient();
		vi.spyOn(client, "getAllSeries").mockRejectedValue(
			new Error("Second Sonarr unavailable"),
		);
		const onSnapshotsChanged = vi.fn();
		const library = new SonarrLibrary(client, cache, onSnapshotsChanged);

		await expect(library.getSeriesSnapshots(credentials)).resolves.toEqual([
			firstSnapshot,
		]);
		await expect(
			library.refreshSeriesSnapshots(otherCredentials),
		).resolves.toEqual([]);

		expect(cache.value(seriesCacheKey)).toEqual([firstSnapshot]);
		expect(cache.value(otherSeriesCacheKey)).toEqual([]);
		expect(cache.write).toHaveBeenCalledWith(
			otherSeriesCacheKey,
			[],
			expect.any(Object),
		);
		expect(onSnapshotsChanged).not.toHaveBeenCalled();
	});

	it("coalesces refreshes per server without reusing another server request", async () => {
		const firstSeries = createSonarrSeries({ title: "First Server" });
		const secondSeries = createSonarrSeries({
			id: parseSonarrSeriesId(20),
			tvdbId: parseTvdbId(456),
			title: "Second Server",
		});
		const firstRefresh = createDeferred<SonarrSeries[]>();
		const secondRefresh = createDeferred<SonarrSeries[]>();
		const cache = createMemoryCache<SonarrSeriesSnapshot[]>();
		const client = createClient();
		const getAllSeries = vi
			.spyOn(client, "getAllSeries")
			.mockImplementation((input) =>
				input.url === credentials.url
					? firstRefresh.promise
					: secondRefresh.promise,
			);
		const onSnapshotsChanged = vi.fn();
		const library = new SonarrLibrary(client, cache, onSnapshotsChanged);

		const firstRequest = library.refreshSeriesSnapshots(credentials);
		const duplicateFirstRequest = library.refreshSeriesSnapshots(credentials);
		const secondRequest = library.refreshSeriesSnapshots(otherCredentials);
		await vi.waitFor(() => expect(getAllSeries).toHaveBeenCalledTimes(2));

		firstRefresh.resolve([firstSeries]);
		secondRefresh.resolve([secondSeries]);

		await expect(firstRequest).resolves.toEqual([
			toSonarrSeriesSnapshot(firstSeries),
		]);
		await expect(duplicateFirstRequest).resolves.toEqual([
			toSonarrSeriesSnapshot(firstSeries),
		]);
		await expect(secondRequest).resolves.toEqual([
			toSonarrSeriesSnapshot(secondSeries),
		]);
		expect(getAllSeries).toHaveBeenCalledWith(credentials);
		expect(getAllSeries).toHaveBeenCalledWith(otherCredentials);
		expect(onSnapshotsChanged).toHaveBeenCalledTimes(2);

		await library.refreshSeriesSnapshots(credentials);
		expect(onSnapshotsChanged).toHaveBeenCalledTimes(2);
	});

	it("mutates only the cache for the supplied server", async () => {
		const firstSnapshot = createSnapshot({ title: "First Server" });
		const staleSecondSnapshot = createSnapshot({
			id: parseSonarrSeriesId(20),
			tvdbId: parseTvdbId(456),
			title: "Stale Second Server",
		});
		const addedSecondSnapshot = createSnapshot({
			id: parseSonarrSeriesId(30),
			tvdbId: parseTvdbId(789),
			title: "Added Second Server",
		});
		const cache = createMemoryCache<SonarrSeriesSnapshot[]>([
			[seriesCacheKey, [firstSnapshot]],
			[otherSeriesCacheKey, [staleSecondSnapshot]],
		]);
		const library = new SonarrLibrary(createClient(), cache);

		await expect(
			library.upsertSeriesSnapshot(addedSecondSnapshot, otherCredentials),
		).resolves.toBe(true);
		await expect(
			library.upsertSeriesSnapshot(addedSecondSnapshot, otherCredentials),
		).resolves.toBe(false);
		await expect(
			library.removeSeriesSnapshot(
				staleSecondSnapshot.tvdbId,
				otherCredentials,
			),
		).resolves.toBe(true);

		expect(cache.value(seriesCacheKey)).toEqual([firstSnapshot]);
		expect(cache.value(otherSeriesCacheKey)).toEqual([addedSecondSnapshot]);
	});

	it("clears memory and ignores a refresh completed after clear", async () => {
		const cachedSnapshot = createSnapshot({ title: "Cached Before Clear" });
		const staleSeries = createSonarrSeries({ title: "Stale Refresh" });
		const freshSeries = createSonarrSeries({ title: "Fresh Refresh" });
		const staleRefresh = createDeferred<SonarrSeries[]>();
		const cache = createMemoryCache<SonarrSeriesSnapshot[]>([
			[seriesCacheKey, [cachedSnapshot]],
		]);
		const client = createClient();
		const getAllSeries = vi
			.spyOn(client, "getAllSeries")
			.mockReturnValueOnce(staleRefresh.promise)
			.mockResolvedValueOnce([freshSeries]);
		const library = new SonarrLibrary(client, cache);

		await expect(library.getSeriesSnapshots(credentials)).resolves.toEqual([
			cachedSnapshot,
		]);
		const refreshRequest = library.refreshSeriesSnapshots(credentials);
		await vi.waitFor(() => expect(getAllSeries).toHaveBeenCalledTimes(1));
		await library.clearSeriesSnapshotCache();
		staleRefresh.resolve([staleSeries]);
		await refreshRequest;

		expect(cache.clear).toHaveBeenCalledTimes(1);
		expect(cache.keys()).toEqual([]);
		await expect(library.getSeriesSnapshots(credentials)).resolves.toEqual([
			toSonarrSeriesSnapshot(freshSeries),
		]);
		expect(getAllSeries).toHaveBeenCalledTimes(2);
	});

	it("force-verifies a TVDB hit and updates the snapshot cache", async () => {
		const series = createSonarrSeries();
		const cache = createMemoryCache<SonarrSeriesSnapshot[]>([
			[seriesCacheKey, []],
		]);
		const client = createClient();
		const findSeriesByTvdbId = vi
			.spyOn(client, "findSeriesByTvdbId")
			.mockResolvedValue(series);
		const lookupSeriesByTvdbId = vi.spyOn(client, "lookupSeriesByTvdbId");
		const onCacheChanged = vi.fn();
		const library = new SonarrLibrary(client, cache);

		await expect(
			library.getSeriesLibraryStatusByTvdbId({
				tvdbId: parseTvdbId(123),
				credentials,
				forceVerify: true,
				onCacheChanged,
			}),
		).resolves.toMatchObject({
			provider: "sonarr",
			providerId: parseTvdbId(123),
			isInLibrary: true,
			series,
		});

		expect(findSeriesByTvdbId).toHaveBeenCalledWith(
			parseTvdbId(123),
			credentials,
		);
		expect(lookupSeriesByTvdbId).not.toHaveBeenCalled();
		expect(cache.value(seriesCacheKey)).toEqual([
			toSonarrSeriesSnapshot(series),
		]);
		expect(onCacheChanged).toHaveBeenCalledTimes(1);
	});

	it("force-verifies a TVDB miss, removes stale cache, and returns lookup data", async () => {
		const cache = createMemoryCache<SonarrSeriesSnapshot[]>([
			[seriesCacheKey, [createSnapshot({ title: "Stale" })]],
		]);
		const client = createClient();
		vi.spyOn(client, "findSeriesByTvdbId").mockResolvedValue(null);
		const lookupSeriesByTvdbId = vi
			.spyOn(client, "lookupSeriesByTvdbId")
			.mockResolvedValue(createLookupSeries());
		const onCacheChanged = vi.fn();
		const library = new SonarrLibrary(client, cache);

		await expect(
			library.getSeriesLibraryStatusByTvdbId({
				tvdbId: parseTvdbId(123),
				credentials,
				forceVerify: true,
				onCacheChanged,
			}),
		).resolves.toMatchObject({
			provider: "sonarr",
			providerId: parseTvdbId(123),
			isInLibrary: false,
			series: {
				title: "Lookup Series",
				tvdbId: parseTvdbId(123),
			},
		});

		expect(lookupSeriesByTvdbId).toHaveBeenCalledWith(
			parseTvdbId(123),
			credentials,
		);
		expect(cache.value(seriesCacheKey)).toEqual([]);
		expect(onCacheChanged).toHaveBeenCalledTimes(1);
	});
});
