/**
 * Background cost of one browse batch: N per-card status RPCs plus one
 * mapping-identities RPC, against the real AniBridge dataset and a user with
 * a populated automatic store.
 */
import { beforeEach, describe, it, vi } from "vitest";
import { browser } from "wxt/browser";
import type { AniListId } from "@/anilist/types";
import { createApiHandlers } from "@/rpc/handlers";
import { sonarrLibrary } from "@/background/api-services";
import { saveProviderConnectionSnapshot } from "@/settings/store";
import {
	loadUpstreamRecords,
	report,
	seedUpstream,
	time,
	useRealisticStorage,
} from "./helpers";

vi.mock("@/shared/cache/ttl-cache", () => {
	const data = new Map<string, unknown>();
	return {
		clearAllTtlCaches: async () => data.clear(),
		createTtlCache: () => ({
			read: async () => null,
			write: async () => {},
			remove: async () => {},
			clear: async () => {},
		}),
	};
});

vi.mock("@/rpc/revision-signals", () => ({
	bumpMappingsRevision: vi.fn(async () => "r"),
	bumpProviderLibraryRevision: vi.fn(async () => "r"),
	resetAllRevisions: vi.fn(async () => {}),
	MAPPINGS_REVISION_CHANGE_KEY: "mappingsRevision",
	SONARR_LIBRARY_REVISION_CHANGE_KEY: "sonarrLibraryRevision",
	RADARR_LIBRARY_REVISION_CHANGE_KEY: "radarrLibraryRevision",
}));

// These scenarios measure handler work separately from migration.
const initialized = Promise.resolve();
const apiHandlers = createApiHandlers(initialized, initialized);

function pickMappedAniListIds(count: number): AniListId[] {
	const ids: AniListId[] = [];
	for (const [key, record] of Object.entries(loadUpstreamRecords())) {
		if (!key.startsWith("anilist:") || record.facts.tvdbShow === undefined)
			continue;
		ids.push(Number(key.slice("anilist:".length)) as AniListId);
		if (ids.length === count) break;
	}
	return ids;
}

async function seedAutomaticStore(entries: number): Promise<void> {
	const records: Record<string, unknown> = {};
	const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
	for (let index = 0; index < entries; index += 1) {
		records[`anilist:${900_000 + index}`] = {
			facts: { tvdbShow: 500_000 + index },
			slotMeta: {
				tvdbShow: { expiresAt, matchedTitle: `Some Long Anime Title ${index}` },
			},
			attempts: { sonarrTvdb: { expiresAt } },
		};
	}
	await browser.storage.local.set({ "mapping:auto": { version: 1, records } });
}

// Fresh module graph per iteration = a cold MV3 worker (empty in-memory caches).
async function coldModules() {
	vi.resetModules();
	const [
		{ migrateMappingStorage: migrate },
		{ createApiHandlers: createHandlers },
		services,
	] = await Promise.all([
		import("@/mapping/migrate"),
		import("@/rpc/handlers"),
		import("@/background/api-services"),
	]);
	vi.spyOn(services.sonarrLibrary, "getSeriesSnapshots").mockResolvedValue([]);
	return { migrate, handlers: createHandlers(initialized, initialized) };
}

describe("browse batch background cost", () => {
	beforeEach(async () => {
		await saveProviderConnectionSnapshot("sonarr", {
			url: "https://sonarr.local:8989",
			apiKey: "sonarr-key",
		});
		await seedUpstream();
		await seedAutomaticStore(1500);
		vi.spyOn(sonarrLibrary, "getSeriesSnapshots").mockResolvedValue([]);
	});

	it("cold worker wake: migrateMappingStorage", async () => {
		const storage = useRealisticStorage();
		const { migrate } = await coldModules();
		storage.reset();
		await migrate();
		report(
			"cold migrateMappingStorage storage reads",
			JSON.stringify(Object.fromEntries(storage.reads)),
		);
		const samples: number[] = [];
		for (let index = 0; index < 3; index += 1) {
			const cold = await coldModules();
			const start = performance.now();
			await cold.migrate();
			samples.push(performance.now() - start);
		}
		report(
			"cold migrateMappingStorage (every worker wake)",
			Math.min(...samples).toFixed(2),
			"ms (min of 3)",
		);
	});

	it("cold anime page: identities(1) + one status, then warm", async () => {
		useRealisticStorage();
		const [id] = pickMappedAniListIds(1);
		const samples: number[] = [];
		for (let index = 0; index < 3; index += 1) {
			const { handlers } = await coldModules();
			const start = performance.now();
			await handlers.getMappingIdentities([id!]);
			await handlers.getSeriesStatus({
				source: { source: "anilist", id: id! },
			});
			samples.push(performance.now() - start);
		}
		report(
			"cold anime page background work (identities + status, serial)",
			Math.min(...samples).toFixed(2),
			"ms (min of 3)",
		);
		await time(
			"warm anime page background work (identities + status, serial)",
			async () => {
				await apiHandlers.getMappingIdentities([id!]);
				await apiHandlers.getSeriesStatus({
					source: { source: "anilist", id: id! },
				});
			},
			5,
		);
	});

	it("cold browse batch: 50 parallel status calls on a fresh worker", async () => {
		useRealisticStorage();
		const ids = pickMappedAniListIds(50);
		const samples: number[] = [];
		for (let index = 0; index < 3; index += 1) {
			const { handlers } = await coldModules();
			const start = performance.now();
			await Promise.all(
				ids.map((id) =>
					handlers.getSeriesStatus({ source: { source: "anilist", id } }),
				),
			);
			samples.push(performance.now() - start);
		}
		report(
			"cold 50 x getSeriesStatus (fresh worker)",
			Math.min(...samples).toFixed(2),
			"ms (min of 3)",
		);
	});

	for (const cards of [50]) {
		it(`${cards} cards`, async () => {
			const storage = useRealisticStorage();
			const ids = pickMappedAniListIds(cards);

			storage.reset();
			await apiHandlers.getMappingIdentities(ids);
			report(
				`getMappingIdentities(${cards}) storage reads`,
				JSON.stringify(Object.fromEntries(storage.reads)),
			);
			await time(
				`getMappingIdentities(${cards} ids)`,
				() => apiHandlers.getMappingIdentities(ids),
				3,
			);

			storage.reset();
			await apiHandlers.getSeriesStatus({
				source: { source: "anilist", id: ids[0]! },
			});
			report(
				"getSeriesStatus x1 storage reads",
				JSON.stringify(Object.fromEntries(storage.reads)),
			);

			await time(
				`${cards} x getSeriesStatus (parallel, like one browse batch)`,
				() =>
					Promise.all(
						ids.map((id) =>
							apiHandlers.getSeriesStatus({
								source: { source: "anilist", id },
							}),
						),
					),
				3,
			);
		});
	}
});
