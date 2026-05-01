/** Highest-value AutoMappingStore test for serialized whole-store persistence. */
// src/mapping/auto-mapping/auto-mapping.store.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist";
import type { AutoMappingRecord } from "./types";
import { AutoMappingStore } from "./auto-mapping.store";

const aid = parseAniListId;

function createDeferred<T = void>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
}

const mappedState = (
	providerId: number,
): Omit<AutoMappingRecord, "updatedAt"> =>
	({
		state: "mapped",
		providerId,
		acceptedEvidence: {
			source: "auto",
			reason: "fuzzy-match",
		},
	}) as Omit<AutoMappingRecord, "updatedAt">;

describe("AutoMappingStore", () => {
	let store: AutoMappingStore;

	beforeEach(async () => {
		store = new AutoMappingStore();
		await store.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("serializes concurrent writes so whole-store persists cannot overlap", async () => {
		const prototype = Object.getPrototypeOf(store) as {
			persist(this: AutoMappingStore): Promise<void>;
		};
		const originalPersist = prototype.persist;
		const firstPersistStarted = createDeferred();
		const releaseFirstPersist = createDeferred();
		let persistStarts = 0;
		let activePersists = 0;
		let maxActivePersists = 0;

		vi.spyOn(prototype, "persist").mockImplementation(async function (
			this: AutoMappingStore,
		) {
			persistStarts += 1;
			activePersists += 1;
			maxActivePersists = Math.max(maxActivePersists, activePersists);
			try {
				if (persistStarts === 1) {
					firstPersistStarted.resolve();
					await releaseFirstPersist.promise;
				}
				await originalPersist.call(this);
			} finally {
				activePersists -= 1;
			}
		});

		const firstWrite = store.set("sonarr", aid(1), mappedState(101), {
			hardMs: 2000,
		});
		await firstPersistStarted.promise;

		const secondWrite = store.set("radarr", aid(2), mappedState(202), {
			hardMs: 2000,
		});
		await Promise.resolve();
		await Promise.resolve();

		expect(persistStarts).toBe(1);

		releaseFirstPersist.resolve();
		await Promise.all([firstWrite, secondWrite]);

		expect(maxActivePersists).toBe(1);
		await expect(store.get("sonarr", aid(1))).resolves.toMatchObject({
			state: "mapped",
			providerId: 101,
		});
		await expect(store.get("radarr", aid(2))).resolves.toMatchObject({
			state: "mapped",
			providerId: 202,
		});
	});

	it("sanitizes legacy recent-evaluation payloads when records are read", async () => {
		await browser.storage.local.set({
			"autoMappings:v2": {
				"sonarr:1": {
					state: "mapped",
					providerId: 101,
					acceptedEvidence: {
						source: "auto",
						reason: "fuzzy-match",
					},
					recentEvaluation: {
						attemptedAt: 1,
						searchTerms: ["legacy"],
						candidates: [],
					},
					updatedAt: 10,
					expiresAt: Date.now() + 60_000,
				},
				"sonarr:2": {
					state: "mapped",
					providerId: 202,
					acceptedEvidence: {
						source: "upstream",
						reason: "exact-upstream",
					},
					updatedAt: 10,
					expiresAt: Date.now() + 60_000,
				},
			},
		});

		const legacyStore = new AutoMappingStore();

		await expect(legacyStore.get("sonarr", aid(1))).resolves.toEqual({
			state: "mapped",
			providerId: 101,
			acceptedEvidence: {
				source: "auto",
				reason: "fuzzy-match",
			},
			updatedAt: 10,
		});
		await expect(legacyStore.get("sonarr", aid(2))).resolves.toBeNull();
	});
});
