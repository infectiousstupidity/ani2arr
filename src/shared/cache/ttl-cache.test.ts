/** Tests for side-effect-free IndexedDB TTL cache reads. */
// src/shared/cache/ttl-cache.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTtlCache, type CacheEntry } from "./ttl-cache";

const idbMock = vi.hoisted(() => {
	const entries = new Map<string, unknown>();
	const get = vi.fn(async (_storeName: string, key: string) => entries.get(key));
	const remove = vi.fn(async (_storeName: string, key: string) => {
		entries.delete(key);
	});
	const db = {
		get,
		delete: remove,
		objectStoreNames: { contains: () => true },
		close: vi.fn(),
	};

	return {
		entries,
		get,
		remove,
		openDB: vi.fn(async () => db),
		deleteDB: vi.fn(),
	};
});

vi.mock("idb", () => ({
	openDB: idbMock.openDB,
	deleteDB: idbMock.deleteDB,
}));

const now = new Date("2026-07-14T12:00:00Z");
const cache = createTtlCache<string>("test");

describe("TtlCache.read", () => {
	beforeEach(() => {
		idbMock.entries.clear();
		vi.clearAllMocks();
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(now);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns null for expired entries without deleting them", async () => {
		const entry: CacheEntry<string> = {
			value: "expired",
			staleAt: now.getTime() - 2,
			expiresAt: now.getTime(),
		};
		idbMock.entries.set("test:key", entry);

		await expect(cache.read("key")).resolves.toBeNull();

		expect(idbMock.get).toHaveBeenCalledWith("ttl-cache-store", "test:key");
		expect(idbMock.remove).not.toHaveBeenCalled();
		expect(idbMock.entries.get("test:key")).toBe(entry);
	});

	it("returns valid entries unchanged", async () => {
		const entry: CacheEntry<string> = {
			value: "valid",
			staleAt: now.getTime() - 1,
			expiresAt: now.getTime() + 1,
			meta: { source: "test" },
		};
		idbMock.entries.set("test:key", entry);

		await expect(cache.read("key")).resolves.toEqual({
			value: "valid",
			stale: true,
			staleAt: entry.staleAt,
			expiresAt: entry.expiresAt,
			meta: entry.meta,
		});

		expect(idbMock.remove).not.toHaveBeenCalled();
	});
});
