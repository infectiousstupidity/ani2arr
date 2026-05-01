/** Tests for provider-aware Anibridge mapping normalization and lookup behavior. */
// src/mapping/upstream-mapping/anibridge-mapping.store.test.ts

import { describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist";
import type {
	TtlCache,
	CacheHit,
	CacheWriteOptions,
} from "@/shared/cache/ttl-cache";
import { parseTmdbId, parseTvdbId } from "@/providers";
import {
	buildProviderMappingsFromAnibridgePayload,
	AnibridgeMappingStore,
	type AnibridgeMappingPayload,
} from "./anibridge-mapping.store";

type MemoryCache<T> = TtlCache<T> & {
	peek(key: string): CacheHit<T> | null;
};

const createMemoryCache = <T>(): MemoryCache<T> => {
	const entries = new Map<string, CacheHit<T>>();

	return {
		async read(key: string): Promise<CacheHit<T> | null> {
			return entries.get(key) ?? null;
		},
		async write(
			key: string,
			value: T,
			options: CacheWriteOptions,
		): Promise<void> {
			const now = Date.now();
			entries.set(key, {
				value,
				stale: false,
				staleAt: now + options.staleMs,
				expiresAt: now + (options.hardMs ?? options.staleMs * 4),
				...(options.meta ? { meta: options.meta } : {}),
			});
		},
		async remove(key: string): Promise<void> {
			entries.delete(key);
		},
		async clear(): Promise<void> {
			entries.clear();
		},
		peek(key: string): CacheHit<T> | null {
			return entries.get(key) ?? null;
		},
	};
};

const createResponse = (payload: unknown): Response =>
	({
		ok: true,
		status: 200,
		json: async () => payload,
		headers: new Headers(),
	}) as Response;

const notModifiedResponse = (): Response =>
	({
		ok: false,
		status: 304,
		json: async () => ({}),
		headers: new Headers(),
	}) as Response;

const aid = parseAniListId;

const createStore = (payload: unknown) => {
	const cache = createMemoryCache<AnibridgeMappingPayload>();
	const fetchImpl: typeof fetch = async () => createResponse(payload);

	return {
		store: new AnibridgeMappingStore(cache, { fetch: fetchImpl }),
		cache,
	};
};

describe("AnibridgeMappingStore", () => {
	it("hydrates provider-aware cache payloads into forward and reverse indexes", async () => {
		const cache = createMemoryCache<AnibridgeMappingPayload>();
		await cache.write(
			"upstream",
			{
				sonarr: {
					154_587: [424_536],
					170_068: [424_536],
					182_255: [424_536, 424_537],
				},
				radarr: {
					1001: [12_345],
					1002: [12_345],
				},
			},
			{ staleMs: 60_000, hardMs: 120_000 },
		);

		const store = new AnibridgeMappingStore(cache, {
			fetch: async () => notModifiedResponse(),
		});
		await store.init();

		expect(store.getSonarrCandidates(aid(182_255))).toEqual([424_536, 424_537]);
		expect(store.getRadarrCandidates(aid(1001))).toEqual([12_345]);
		expect(
			store
				.getAniListIdsForTvdb(parseTvdbId(424_536))
				.toSorted((left, right) => left - right),
		).toEqual([154_587, 170_068, 182_255]);
		expect(
			store
				.getAniListIdsForTmdb(parseTmdbId(12_345))
				.toSorted((left, right) => left - right),
		).toEqual([1001, 1002]);
		expect(
			store
				.listAllProviderPairs()
				.toSorted((left, right) => left.anilistId - right.anilistId),
		).toEqual([
			{ provider: "radarr", anilistId: 1001, providerId: 12_345 },
			{ provider: "radarr", anilistId: 1002, providerId: 12_345 },
			{ provider: "sonarr", anilistId: 154_587, providerId: 424_536 },
			{ provider: "sonarr", anilistId: 170_068, providerId: 424_536 },
			{ provider: "sonarr", anilistId: 182_255, providerId: 424_536 },
			{ provider: "sonarr", anilistId: 182_255, providerId: 424_537 },
		]);
	});

	it("deduplicates cached IDs during hydration", async () => {
		const cache = createMemoryCache<AnibridgeMappingPayload>();
		await cache.write(
			"upstream",
			{
				sonarr: {
					154_587: [424_536, 424_536],
				},
				radarr: {
					170_068: [12_345, 12_345],
				},
			},
			{ staleMs: 60_000, hardMs: 120_000 },
		);

		const store = new AnibridgeMappingStore(cache, {
			fetch: async () => notModifiedResponse(),
		});
		await store.init();

		expect(store.getSonarrCandidates(aid(154_587))).toEqual([424_536]);
		expect(store.getRadarrCandidates(aid(170_068))).toEqual([12_345]);
		expect(store.getAniListIdsForTvdb(parseTvdbId(424_536))).toEqual([154_587]);
		expect(store.getAniListIdsForTmdb(parseTmdbId(12_345))).toEqual([170_068]);
	});

	it("refreshes before returning on cold-cache init", async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			createResponse({
				"anilist:154587": {
					"tvdb_show:424536": {},
				},
				"anilist:170068": {
					"tmdb_movie:12345": {},
				},
			}),
		);
		const cache = createMemoryCache<AnibridgeMappingPayload>();
		const store = new AnibridgeMappingStore(cache, { fetch: fetchImpl });

		await store.init();

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(store.getSonarrCandidates(aid(154_587))).toEqual([424_536]);
		expect(store.getRadarrCandidates(aid(170_068))).toEqual([12_345]);
		expect(cache.peek("upstream")?.value).toEqual({
			sonarr: {
				154_587: [424_536],
			},
			radarr: {
				170_068: [12_345],
			},
		});
	});

	it("queues only one init-triggered refresh for warm cache", async () => {
		const cache = createMemoryCache<AnibridgeMappingPayload>();
		await cache.write(
			"upstream",
			{
				sonarr: {
					154_587: [424_536],
				},
				radarr: {
					170_068: [12_345],
				},
			},
			{ staleMs: 60_000, hardMs: 120_000 },
		);
		const fetchImpl = vi.fn<typeof fetch>(async () => notModifiedResponse());
		const store = new AnibridgeMappingStore(cache, { fetch: fetchImpl });

		await store.init();
		await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
		await store.init();

		expect(store.getSonarrCandidates(aid(154_587))).toEqual([424_536]);
		expect(store.getRadarrCandidates(aid(170_068))).toEqual([12_345]);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("persists normalized provider payloads from anibridge descriptor records", async () => {
		const { store, cache } = createStore({
			$meta: { version: 3 },
			"anilist:154587": {
				"tvdb_show:424536": {},
			},
			"anilist:170068": {
				"tvdb_show:424536:s1": {},
				"tmdb_movie:12345": {},
			},
			"anilist:182255": {
				"tvdb_show:424537": {},
				"tvdb_show:424537:s1": {},
			},
		});

		await store.refresh();

		expect(store.getSonarrCandidates(aid(170_068))).toEqual([424_536]);
		expect(store.getRadarrCandidates(aid(170_068))).toEqual([12_345]);
		expect(cache.peek("upstream")?.value).toEqual({
			sonarr: {
				154_587: [424_536],
				170_068: [424_536],
				182_255: [424_537],
			},
			radarr: {
				170_068: [12_345],
			},
		});
	});

	it("normalizes only relevant anibridge descriptor targets", () => {
		expect(
			buildProviderMappingsFromAnibridgePayload({
				$meta: { ignored: true },
				"anilist:1001": {
					"tvdb_show:2001": {},
				},
				"anilist:1002": {
					"tmdb_movie:3001": {},
				},
				"anilist:1003": {
					"tvdb_show:2002": {},
					"tvdb_show:2003": {},
				},
				"anilist:1004": {
					"tvdb_episode:4001": {},
					"tmdb_show:5001": {},
				},
				"anilist:1005": {
					"tvdb_show:2004:s1": { ignored: "range payload" },
				},
				malformed: {
					"tvdb_show:9999": {},
				},
				"anilist:": {
					"tvdb_show:9999": {},
				},
				"anilist:1e2": {
					"tvdb_show:9999": {},
				},
				"anilist:0x10": {
					"tvdb_show:9999": {},
				},
				"anilist:1006": {
					"tvdb_show:": {},
					"tvdb_show:1e2": {},
					"tvdb_show:0x10": {},
					"tvdb_show:2005:": {},
					"tvdb_show:2006:s1:extra": {},
				},
				"anidb:1007": {
					"tvdb_show:9999": {},
				},
				"anilist:1008": {
					"tvdb_show:2007": {},
					"tvdb_show:2007:s1": {},
					"tmdb_movie:3002": {},
				},
			}),
		).toEqual({
			sonarr: {
				1001: [2001],
				1003: [2002, 2003],
				1005: [2004],
				1008: [2007],
			},
			radarr: {
				1002: [3001],
				1008: [3002],
			},
		});
	});

	it("skips malformed IDs while hydrating normalized cache payloads", async () => {
		const cache = createMemoryCache<AnibridgeMappingPayload>();
		await cache.write(
			"upstream",
			{
				sonarr: {
					154_587: [424_536, 0, -1, 1.5, Number.NaN],
					0: [1],
					"-1": [2],
					"1.5": [3],
					"1e2": [4],
					"0x10": [5],
				},
				radarr: {
					182_255: [424_537],
				},
			} as unknown as AnibridgeMappingPayload,
			{ staleMs: 60_000, hardMs: 120_000 },
		);

		const store = new AnibridgeMappingStore(cache, {
			fetch: async () => notModifiedResponse(),
		});
		await store.init();

		expect(
			store
				.listAllProviderPairs()
				.toSorted((left, right) => left.anilistId - right.anilistId),
		).toEqual([
			{ provider: "sonarr", anilistId: 154_587, providerId: 424_536 },
			{ provider: "radarr", anilistId: 182_255, providerId: 424_537 },
		]);
	});
});
