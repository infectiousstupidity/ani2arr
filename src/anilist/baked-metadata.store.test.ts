/** Focused tests for persistent baked AniList metadata sync behavior. */
// src/anilist/baked-metadata.store.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/anilist-id";
import type { AniListMetadata } from "@/anilist/schemas/metadata.schema";

const idbMock = vi.hoisted(() => ({
	metadata: new Map<IDBValidKey, unknown>(),
	syncState: new Map<IDBValidKey, unknown>(),
	openDB: vi.fn(),
}));

vi.mock("idb", () => ({
	openDB: idbMock.openDB,
}));

import { IndexedDbBakedMetadataStore } from "./baked-metadata.store";

const SYNC_STATE_KEY = "anilist-static-metadata";

const storeFor = (name: string): Map<IDBValidKey, unknown> => {
	if (name === "metadata") return idbMock.metadata;
	if (name === "sync-state") return idbMock.syncState;
	throw new Error(`Unknown object store ${name}`);
};

const createMockDb = () => ({
	get: async (storeName: string, key: IDBValidKey): Promise<unknown> =>
		storeFor(storeName).get(key),
	transaction: () => ({
		objectStore: (storeName: string) => ({
			clear: async (): Promise<void> => {
				storeFor(storeName).clear();
			},
			put: async (value: unknown, key: IDBValidKey): Promise<void> => {
				storeFor(storeName).set(key, value);
			},
		}),
		done: Promise.resolve(),
	}),
	objectStoreNames: {
		contains: () => true,
	},
	createObjectStore: vi.fn(),
});

const response = (payload: unknown): Response =>
	({
		ok: true,
		status: 200,
		json: async () => payload,
	}) as Response;

const metadataEntry = (id: number, romaji: string): AniListMetadata => ({
	id: parseAniListId(id),
	titles: { romaji },
	seasonYear: null,
	format: null,
	coverImage: null,
	updatedAt: 1000,
});

describe("IndexedDbBakedMetadataStore", () => {
	beforeEach(() => {
		idbMock.metadata.clear();
		idbMock.syncState.clear();
		idbMock.openDB.mockReset();
		idbMock.openDB.mockResolvedValue(createMockDb());
	});

	it("skips chunk fetch when stored generatedAt matches manifest", async () => {
		idbMock.syncState.set(SYNC_STATE_KEY, { generatedAt: 10 });
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			response({
				generatedAt: 10,
				chunks: [{ file: "anilist-static-metadata.part-1.json", count: 1 }],
			}),
		);
		const store = new IndexedDbBakedMetadataStore({ fetch: fetchImpl });

		await store.syncFromBundleManifest();

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(idbMock.metadata.size).toBe(0);
	});

	it("replaces old rows before storing changed generatedAt entries", async () => {
		const oldId = parseAniListId(1);
		const newId = parseAniListId(2);
		idbMock.metadata.set(oldId, metadataEntry(oldId, "Old"));
		idbMock.syncState.set(SYNC_STATE_KEY, { generatedAt: 10 });
		const fetchImpl = vi.fn<typeof fetch>(async (input) => {
			const url = String(input);
			if (url.includes("part-1")) {
				return response({
					generatedAt: 20,
					entries: [metadataEntry(newId, "New")],
				});
			}

			return response({
				generatedAt: 20,
				chunks: [{ file: "anilist-static-metadata.part-1.json", count: 1 }],
			});
		});
		const store = new IndexedDbBakedMetadataStore({ fetch: fetchImpl });

		await store.syncFromBundleManifest();

		expect(await store.get(oldId)).toBeNull();
		expect(await store.get(newId)).toEqual(metadataEntry(newId, "New"));
		expect(idbMock.syncState.get(SYNC_STATE_KEY)).toEqual({ generatedAt: 20 });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("keeps entries with nullable title leaves from baked chunks", async () => {
		const id = parseAniListId(3);
		const fetchImpl = vi.fn<typeof fetch>(async (input) => {
			const url = String(input);
			if (url.includes("part-1")) {
				return response({
					generatedAt: 30,
					entries: [
						{
							id,
							titles: {
								english: null,
								romaji: "Nullable Title",
								native: null,
							},
							seasonYear: 2024,
							format: "TV",
							coverImage: { medium: null, large: "large.jpg" },
						},
					],
				});
			}

			return response({
				generatedAt: 30,
				chunks: [{ file: "anilist-static-metadata.part-1.json", count: 1 }],
			});
		});
		const store = new IndexedDbBakedMetadataStore({ fetch: fetchImpl });

		await store.syncFromBundleManifest();

		expect(await store.get(id)).toEqual({
			id,
			titles: { romaji: "Nullable Title" },
			seasonYear: 2024,
			format: "TV",
			coverImage: { medium: null, large: "large.jpg" },
			updatedAt: 30,
		});
	});

	it("fails sync when a chunk parses fewer entries than the manifest declares", async () => {
		const fetchImpl = vi.fn<typeof fetch>(async (input) => {
			const url = String(input);
			if (url.includes("part-1")) {
				return response({
					generatedAt: 40,
					entries: [
						{
							id: parseAniListId(4),
							titles: { english: 123 },
						},
					],
				});
			}

			return response({
				generatedAt: 40,
				chunks: [{ file: "anilist-static-metadata.part-1.json", count: 1 }],
			});
		});
		const store = new IndexedDbBakedMetadataStore({ fetch: fetchImpl });

		await expect(store.syncFromBundleManifest()).rejects.toThrow(
			"AniList metadata bundle parse dropped 1 entries",
		);
		expect(idbMock.metadata.size).toBe(0);
		expect(idbMock.syncState.size).toBe(0);
	});
});
