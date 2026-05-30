/** Focused tests for AniList metadata store baked lookup behavior. */
// src/anilist/metadata.store.test.ts

import { describe, expect, it, vi } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist/anilist-id";
import type { AniListMetadata } from "@/anilist/schemas/metadata.schema";
import type { CacheHit, CacheWriteOptions, TtlCache } from "@/shared/cache/ttl-cache";
import type { BakedMetadataStore } from "./baked-metadata.store";
import { AniListMetadataStore } from "./metadata.store";

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

const metadataEntry = (id: AniListId, romaji: string): AniListMetadata => ({
	id,
	titles: { romaji },
	seasonYear: null,
	format: null,
	coverImage: null,
	updatedAt: Date.now(),
});

const createBakedStore = (
	entries: Map<AniListId, AniListMetadata>,
): BakedMetadataStore => ({
	syncFromBundleManifest: vi.fn(async () => {}),
	get: vi.fn(async (id: AniListId) => entries.get(id) ?? null),
	clear: vi.fn(async () => {
		entries.clear();
	}),
});

describe("AniListMetadataStore", () => {
	it("returns baked metadata without fetching missing media", async () => {
		const id = parseAniListId(101);
		const entry = metadataEntry(id, "Baked");
		const anilistApi = { fetchMediaBatch: vi.fn() };
		const store = new AniListMetadataStore(
			anilistApi as never,
			createMemoryCache<AniListMetadata>(),
			createBakedStore(new Map([[id, entry]])),
		);

		const result = await store.getMetadata([id], { fetchMissing: false });

		expect(result).toEqual({ metadata: [entry] });
		expect(anilistApi.fetchMediaBatch).not.toHaveBeenCalled();
	});

	it("returns missing IDs without network fetch when baked metadata is absent", async () => {
		const id = parseAniListId(202);
		const anilistApi = { fetchMediaBatch: vi.fn() };
		const store = new AniListMetadataStore(
			anilistApi as never,
			createMemoryCache<AniListMetadata>(),
			createBakedStore(new Map()),
		);

		const result = await store.getMetadata([id], { fetchMissing: false });

		expect(result).toEqual({ metadata: [], missingIds: [id] });
		expect(anilistApi.fetchMediaBatch).not.toHaveBeenCalled();
	});
});
