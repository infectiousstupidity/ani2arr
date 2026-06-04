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

const parseProviderQualityProfileId = (value: number) =>
	value as ProviderQualityProfileId;
const parseSonarrSeriesId = (value: number) => value as SonarrSeriesId;

function createClient(): SonarrClient {
	return new SonarrClient({
		hasUrlPermission: () => Promise.resolve(true),
	});
}

function createMemoryCache<T>(
	initialValue: T | undefined,
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
		const cache = createMemoryCache<SonarrSeriesSnapshot[]>([snapshot]);
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
		expect(getAllSeries).not.toHaveBeenCalled();
	});

	it("force-verifies a TVDB hit and updates the snapshot cache", async () => {
		const series = createSonarrSeries();
		const cache = createMemoryCache<SonarrSeriesSnapshot[]>([]);
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
		expect(cache.value()).toEqual([toSonarrSeriesSnapshot(series)]);
		expect(onCacheChanged).toHaveBeenCalledTimes(1);
	});

	it("force-verifies a TVDB miss, removes stale cache, and returns lookup data", async () => {
		const cache = createMemoryCache<SonarrSeriesSnapshot[]>([
			createSnapshot({ title: "Stale" }),
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
		expect(cache.value()).toEqual([]);
		expect(onCacheChanged).toHaveBeenCalledTimes(1);
	});
});
