import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import {
	captureAutomaticWriteToken,
	clearAutoResults,
	consolidateAutomaticAliases,
	getAutomaticLayerRecord,
	listAniListAutomaticLayers,
	migrateAutomaticStore,
	setAutoResult,
	setSeerrAutoResult,
} from "./auto.store";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const start = new Date("2026-01-01T00:00:00Z");
const AUTO_STORAGE_KEY = "mapping:auto";

const createDeferred = <T>() => {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
};

describe("auto mapping store", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(start);
		await clearAutoResults();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("ignores expired results without deleting them on read", async () => {
		const identity = { source: "anilist", id: aid(1) } as const;
		await setAutoResult(captureAutomaticWriteToken(), "radarr", identity, {
			kind: "mapped",
			providerId: tmdb(10),
		});
		await expect(
			browser.storage.local.get(AUTO_STORAGE_KEY),
		).resolves.toMatchObject({
			[AUTO_STORAGE_KEY]: {
				version: 1,
				records: {
					"anilist:1": { facts: { tmdbMovie: tmdb(10) } },
				},
			},
		});

		vi.setSystemTime(new Date("2026-02-02T00:00:00Z"));
		await expect(getAutomaticLayerRecord(identity)).resolves.toBeNull();

		vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
		await expect(getAutomaticLayerRecord(identity)).resolves.toMatchObject({
			facts: { tmdbMovie: tmdb(10) },
		});
	});

	it("lists only AniList results from mixed-source storage", async () => {
		await browser.storage.local.set({
			[AUTO_STORAGE_KEY]: {
				sonarr: {},
				radarr: {
					"anilist:1": {
						kind: "mapped",
						providerId: tmdb(300),
						expiresAt: Date.now() + 1000,
					},
					"mal:5114": {
						kind: "mapped",
						providerId: tmdb(400),
						expiresAt: Date.now() + 1000,
					},
				},
			},
		});

		await expect(listAniListAutomaticLayers()).resolves.toEqual([
			{
				anilistId: aid(1),
				record: {
					facts: { tmdbMovie: tmdb(300) },
					slotMeta: {
						tmdbMovie: { expiresAt: Date.now() + 1000 },
					},
				},
			},
		]);
	});

	it("round-trips MAL results under a source-aware key", async () => {
		const identity = { source: "mal", id: mal(63_816) } as const;
		await setAutoResult(captureAutomaticWriteToken(), "radarr", identity, {
			kind: "mapped",
			providerId: tmdb(1_400_000),
		});

		await expect(getAutomaticLayerRecord(identity)).resolves.toMatchObject({
			facts: { tmdbMovie: tmdb(1_400_000) },
		});
		await expect(
			browser.storage.local.get(AUTO_STORAGE_KEY),
		).resolves.toMatchObject({
			[AUTO_STORAGE_KEY]: {
				version: 1,
				records: {
					"mal:63816": {
						facts: { tmdbMovie: tmdb(1_400_000) },
					},
				},
			},
		});
	});

	it("reads canonical and pre-link alias facts together before consolidating on mutation", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		const expiresAt = Date.now() + 10_000;
		await browser.storage.local.set({
			[AUTO_STORAGE_KEY]: {
				version: 1,
				records: {
					"anilist:1": {
						facts: { tvdbShow: tvdb(10) },
						slotMeta: { tvdbShow: { expiresAt } },
					},
					"mal:5114": {
						facts: { tmdbMovie: tmdb(20) },
						slotMeta: { tmdbMovie: { expiresAt } },
					},
				},
			},
		});

		await expect(getAutomaticLayerRecord(source, aid(1))).resolves.toEqual({
			facts: { tmdbMovie: tmdb(20), tvdbShow: tvdb(10) },
			slotMeta: {
				tmdbMovie: { expiresAt },
				tvdbShow: { expiresAt },
			},
		});

		await setSeerrAutoResult(
			captureAutomaticWriteToken(),
			source,
			"tv",
			{
				kind: "mapped",
				target: { mediaType: "tv", tmdbId: tmdb(30) },
			},
			aid(1),
		);
		const stored = await browser.storage.local.get(AUTO_STORAGE_KEY);
		const envelope = stored[AUTO_STORAGE_KEY] as {
			records: Record<string, unknown>;
		};
		expect(envelope).toMatchObject({
			records: {
				"anilist:1": {
					facts: {
						tmdbMovie: tmdb(20),
						tmdbShow: tmdb(30),
						tvdbShow: tvdb(10),
					},
				},
			},
		});
		expect(envelope.records).not.toHaveProperty("mal:5114");
	});

	it("reads legacy raw AniList keys", async () => {
		await browser.storage.local.set({
			[AUTO_STORAGE_KEY]: {
				sonarr: {},
				radarr: {
					1: {
						kind: "mapped",
						providerId: tmdb(300),
						expiresAt: Date.now() + 1000,
					},
				},
			},
		});

		await expect(
			getAutomaticLayerRecord({ source: "anilist", id: aid(1) }),
		).resolves.toMatchObject({ facts: { tmdbMovie: tmdb(300) } });
	});

	it("migrates Arr and Seerr TTLs with independent facts and attempt lanes", async () => {
		const sonarrExpiry = Date.now() + 1000;
		const radarrExpiry = Date.now() + 2000;
		const seerrExpiry = Date.now() + 3000;
		const negativeExpiry = Date.now() + 4000;
		await browser.storage.local.set({
			[AUTO_STORAGE_KEY]: {
				sonarr: {
					1: {
						kind: "mapped",
						providerId: tvdb(100),
						expiresAt: sonarrExpiry,
					},
				},
				radarr: {
					1: {
						kind: "mapped",
						providerId: tmdb(200),
						expiresAt: radarrExpiry,
					},
					3: {
						kind: "mapped",
						providerId: tmdb(500),
						expiresAt: radarrExpiry,
					},
				},
			},
			"mapping:seerr-auto": {
				1: {
					kind: "mapped",
					target: {
						mediaType: "tv",
						tmdbId: tmdb(300),
						tvdbId: tvdb(400),
					},
					expiresAt: seerrExpiry,
				},
				2: { kind: "unmapped", expiresAt: negativeExpiry },
				3: {
					kind: "mapped",
					target: { mediaType: "movie", tmdbId: tmdb(600) },
					expiresAt: seerrExpiry,
				},
			},
		});

		await migrateAutomaticStore();

		await expect(getAutomaticLayerRecord(aid(1))).resolves.toEqual({
			facts: {
				tmdbMovie: tmdb(200),
				tmdbShow: tmdb(300),
				tvdbShow: tvdb(100),
			},
			tvShowPairs: [{ tmdbShow: tmdb(300), tvdbShow: tvdb(400) }],
			slotMeta: {
				tmdbMovie: { expiresAt: radarrExpiry },
				tmdbShow: { expiresAt: seerrExpiry },
				tvdbShow: { expiresAt: sonarrExpiry },
			},
		});
		await expect(getAutomaticLayerRecord(aid(2))).resolves.toEqual({
			facts: {},
			attempts: {
				seerrTmdbMovie: { expiresAt: negativeExpiry },
				seerrTmdbShow: { expiresAt: negativeExpiry },
			},
		});
		await expect(getAutomaticLayerRecord(aid(3))).resolves.toMatchObject({
			facts: { tmdbMovie: tmdb(500) },
		});
		await expect(
			browser.storage.local.get("mapping:seerr-auto"),
		).resolves.toEqual({});
	});

	it("updates one slot without refreshing another slot or attempt lane", async () => {
		const identity = { source: "anilist", id: aid(1) } as const;
		await setAutoResult(captureAutomaticWriteToken(), "sonarr", identity, {
			kind: "mapped",
			providerId: tvdb(100),
		});
		await setSeerrAutoResult(captureAutomaticWriteToken(), identity, "movie", {
			kind: "unmapped",
		});
		const storedBefore = await browser.storage.local.get(AUTO_STORAGE_KEY);
		const before = storedBefore[AUTO_STORAGE_KEY] as {
			records: Record<string, unknown>;
		};

		vi.setSystemTime(Date.now() + 60 * 60 * 1000);
		await setSeerrAutoResult(captureAutomaticWriteToken(), identity, "tv", {
			kind: "mapped",
			target: { mediaType: "tv", tmdbId: tmdb(300) },
		});

		const storedAfter = await browser.storage.local.get(AUTO_STORAGE_KEY);
		const after = storedAfter[AUTO_STORAGE_KEY] as {
			records: Record<string, unknown>;
		};
		expect(after.records["anilist:1"]).toMatchObject({
			facts: { tmdbShow: tmdb(300), tvdbShow: tvdb(100) },
			slotMeta: {
				tvdbShow: {
					expiresAt: new Date("2026-01-31T00:00:00Z").getTime(),
				},
			},
			attempts: {
				seerrTmdbMovie: {
					expiresAt: new Date("2026-01-03T00:00:00Z").getTime(),
				},
			},
		});
		expect(after.records["anilist:1"]).not.toEqual(before.records["anilist:1"]);
	});

	it("drops conflicting alias slots while preserving independent facts and attempts", async () => {
		const expiresAt = Date.now() + 10_000;
		await browser.storage.local.set({
			[AUTO_STORAGE_KEY]: {
				version: 1,
				records: {
					"anilist:1": {
						facts: { tmdbMovie: tmdb(15) },
						slotMeta: { tmdbMovie: { expiresAt } },
						attempts: { seerrTmdbShow: { expiresAt: expiresAt + 3 } },
					},
					"mal:2": {
						facts: { tmdbMovie: tmdb(10) },
						slotMeta: { tmdbMovie: { expiresAt } },
						attempts: { seerrTmdbShow: { expiresAt: expiresAt + 1 } },
					},
					"mal:3": {
						facts: { tmdbMovie: tmdb(20), tvdbShow: tvdb(30) },
						slotMeta: {
							tmdbMovie: { expiresAt },
							tvdbShow: { expiresAt },
						},
						attempts: { seerrTmdbShow: { expiresAt: expiresAt + 2 } },
					},
				},
			},
		});

		await consolidateAutomaticAliases(
			new Map([
				[
					aid(1),
					[
						{ source: "mal", id: mal(3) },
						{ source: "mal", id: mal(2) },
					],
				],
			]),
		);

		await expect(getAutomaticLayerRecord(aid(1))).resolves.toEqual({
			facts: { tvdbShow: tvdb(30) },
			slotMeta: { tvdbShow: { expiresAt } },
			attempts: { seerrTmdbShow: { expiresAt: expiresAt + 3 } },
		});
		const storedResult = await browser.storage.local.get(AUTO_STORAGE_KEY);
		const stored = storedResult[AUTO_STORAGE_KEY] as {
			records: Record<string, unknown>;
		};
		expect(stored.records).not.toHaveProperty("mal:2");
		expect(stored.records).not.toHaveProperty("mal:3");
	});

	it("rejects Arr and Seerr writes captured before a full clear", async () => {
		const identity = { source: "anilist", id: aid(1) } as const;
		const staleToken = captureAutomaticWriteToken();

		await clearAutoResults();

		await expect(
			setAutoResult(staleToken, "radarr", identity, {
				kind: "mapped",
				providerId: tmdb(10),
			}),
		).resolves.toBe(false);
		await expect(
			setSeerrAutoResult(staleToken, identity, "tv", {
				kind: "mapped",
				target: { mediaType: "tv", tmdbId: tmdb(20) },
			}),
		).resolves.toBe(false);
		await expect(getAutomaticLayerRecord(identity)).resolves.toBeNull();
	});

	it("checks the Arr token inside the serialized mutation", async () => {
		const identity = { source: "anilist", id: aid(2) } as const;
		const firstWriteSet = createDeferred<void>();
		const releaseFirstWrite = createDeferred<void>();
		const originalSet = browser.storage.local.set.bind(browser.storage.local);
		const setValue = vi.spyOn(browser.storage.local, "set");
		setValue.mockImplementationOnce(async (items) => {
			firstWriteSet.resolve();
			await releaseFirstWrite.promise;
			await originalSet(items);
		});
		const firstWrite = setAutoResult(
			captureAutomaticWriteToken(),
			"sonarr",
			identity,
			{ kind: "mapped", providerId: tvdb(10) },
		);
		await firstWriteSet.promise;
		const staleWrite = setAutoResult(
			captureAutomaticWriteToken(),
			"radarr",
			identity,
			{ kind: "mapped", providerId: tmdb(20) },
		);
		const clear = clearAutoResults();

		releaseFirstWrite.resolve();
		await expect(firstWrite).resolves.toBe(true);
		await expect(staleWrite).resolves.toBe(false);
		await clear;
		expect(setValue).toHaveBeenCalledTimes(2);
		await expect(getAutomaticLayerRecord(identity)).resolves.toBeNull();
	});

	it("allows automatic writes captured after a full clear", async () => {
		const identity = { source: "anilist", id: aid(3) } as const;

		await clearAutoResults();

		await expect(
			setAutoResult(captureAutomaticWriteToken(), "radarr", identity, {
				kind: "mapped",
				providerId: tmdb(30),
			}),
		).resolves.toBe(true);
		await expect(getAutomaticLayerRecord(identity)).resolves.toMatchObject({
			facts: { tmdbMovie: tmdb(30) },
		});
	});

	it("reset removes the shared and legacy Seerr automatic records", async () => {
		await setAutoResult(captureAutomaticWriteToken(), "radarr", aid(1), {
			kind: "mapped",
			providerId: tmdb(10),
		});
		await browser.storage.local.set({
			"mapping:seerr-auto": { 1: { kind: "unmapped", expiresAt: Date.now() } },
		});

		await clearAutoResults();

		await expect(browser.storage.local.get(AUTO_STORAGE_KEY)).resolves.toEqual({
			[AUTO_STORAGE_KEY]: { version: 1, records: {} },
		});
		await expect(
			browser.storage.local.get("mapping:seerr-auto"),
		).resolves.toEqual({});
	});
});
