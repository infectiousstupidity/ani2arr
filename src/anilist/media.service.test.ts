/** Focused tests for AniList media service cache, dedupe, and prequel behavior. */
// src/anilist/media.service.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAniListId, type AniListId, type AniListMedia } from "@/anilist/types";
import type { CacheHit, CacheWriteOptions, TtlCache } from "@/shared/cache/ttl-cache";
import { AniListMediaService } from "./media.service";

const { fetchAniListMediaMock } = vi.hoisted(() => ({
	fetchAniListMediaMock: vi.fn(),
}));

vi.mock("@/anilist/client", () => ({
	fetchAniListMedia: fetchAniListMediaMock,
}));

type MemoryCache<T> = TtlCache<T> & {
	peek(key: string): CacheHit<T> | null;
	set(key: string, value: T, stale?: boolean): void;
};

const createMedia = (id: AniListId, title = `Media ${id}`): AniListMedia => ({
	id,
	format: "TV",
	title: { romaji: title },
	synonyms: [],
	coverImage: {
		extraLarge: null,
		large: `https://img.example.test/${id}.jpg`,
		medium: null,
		color: null,
	},
});

const createDeferred = <T>() => {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
};

const createMemoryCache = <T>(): MemoryCache<T> => {
	const entries = new Map<string, CacheHit<T>>();

	const put = (key: string, value: T, stale: boolean): void => {
		const now = Date.now();
		entries.set(key, {
			value,
			stale,
			staleAt: stale ? now - 1 : now + 60_000,
			expiresAt: now + 120_000,
		});
	};

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
		set(key: string, value: T, stale = false): void {
			put(key, value, stale);
		},
	};
};

afterEach(() => {
	fetchAniListMediaMock.mockReset();
});

describe("AniListMediaService", () => {
	it("shares concurrent duplicate single-ID requests", async () => {
		const id = parseAniListId(101);
		const pending = createDeferred<AniListMedia>();
		fetchAniListMediaMock.mockReturnValue(pending.promise);
		const service = new AniListMediaService();

		const first = service.fetchMediaWithRelations(id);
		const second = service.fetchMediaWithRelations(id);

		await vi.waitFor(() => {
			expect(fetchAniListMediaMock).toHaveBeenCalledTimes(1);
		});
		pending.resolve(createMedia(id));

		await expect(first).resolves.toMatchObject({ id });
		await expect(second).resolves.toMatchObject({ id });
	});

	it("returns fresh cache hits without fetching", async () => {
		const id = parseAniListId(303);
		const cache = createMemoryCache<AniListMedia>();
		cache.set(String(id), createMedia(id, "Cached"));
		const service = new AniListMediaService({ media: cache });

		const result = await service.fetchMediaWithRelations(id);

		expect(result).toMatchObject({ id, title: { romaji: "Cached" } });
		expect(fetchAniListMediaMock).not.toHaveBeenCalled();
	});

	it("returns stale cache hits without background refresh", async () => {
		const id = parseAniListId(404);
		const cache = createMemoryCache<AniListMedia>();
		cache.set(String(id), createMedia(id, "Stale"), true);
		const service = new AniListMediaService({ media: cache });

		const result = await service.fetchMediaWithRelations(id);

		expect(result).toMatchObject({ id, title: { romaji: "Stale" } });
		expect(fetchAniListMediaMock).not.toHaveBeenCalled();
		expect(cache.peek(String(id))?.value).toMatchObject({
			title: { romaji: "Stale" },
		});
	});

	it("walks AniList prequel relations through the service", async () => {
		const firstId = parseAniListId(501);
		const prequelId = parseAniListId(500);
		const seed: AniListMedia = {
			...createMedia(firstId),
			relations: {
				edges: [{ relationType: "PREQUEL", node: { id: prequelId } }],
			},
		};
		fetchAniListMediaMock.mockResolvedValue(createMedia(prequelId, "Prequel"));
		const service = new AniListMediaService();

		const chain: AniListMedia[] = [];
		for await (const media of service.iteratePrequelChain(seed)) {
			chain.push(media);
		}

		expect(chain.map((media) => media.id)).toEqual([prequelId]);
		expect(fetchAniListMediaMock).toHaveBeenCalledWith(prequelId);
	});
});
