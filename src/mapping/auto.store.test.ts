import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId } from "@/providers/schemas";
import {
	clearAutoResults,
	getAutoResult,
	listAniListAutoResults,
	setAutoResult,
} from "./auto.store";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const start = new Date("2026-01-01T00:00:00Z");
const AUTO_STORAGE_KEY = "mapping:auto";

describe("auto mapping store", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(start);
		await clearAutoResults("radarr");
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("ignores expired results without deleting them on read", async () => {
		const identity = { source: "anilist", id: aid(1) } as const;
		await setAutoResult("radarr", identity, {
			kind: "mapped",
			providerId: tmdb(10),
		});
		await expect(
			browser.storage.local.get(AUTO_STORAGE_KEY),
		).resolves.toMatchObject({
			[AUTO_STORAGE_KEY]: {
				radarr: {
					"anilist:1": { kind: "mapped", providerId: tmdb(10) },
				},
			},
		});

		vi.setSystemTime(new Date("2026-02-02T00:00:00Z"));
		await expect(getAutoResult("radarr", identity)).resolves.toBeNull();

		vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
		await expect(getAutoResult("radarr", identity)).resolves.toEqual({
			kind: "mapped",
			providerId: tmdb(10),
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

		await expect(listAniListAutoResults("radarr")).resolves.toEqual([
			{
				anilistId: aid(1),
				result: { kind: "mapped", providerId: tmdb(300) },
			},
		]);
	});

	it("round-trips MAL results under a source-aware key", async () => {
		const identity = { source: "mal", id: mal(63_816) } as const;
		await setAutoResult("radarr", identity, {
			kind: "mapped",
			providerId: tmdb(1_400_000),
		});

		await expect(getAutoResult("radarr", identity)).resolves.toEqual({
			kind: "mapped",
			providerId: tmdb(1_400_000),
		});
		await expect(
			browser.storage.local.get(AUTO_STORAGE_KEY),
		).resolves.toMatchObject({
			[AUTO_STORAGE_KEY]: {
				radarr: {
					"mal:63816": {
						kind: "mapped",
						providerId: tmdb(1_400_000),
					},
				},
			},
		});
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
			getAutoResult("radarr", { source: "anilist", id: aid(1) }),
		).resolves.toEqual({
			kind: "mapped",
			providerId: tmdb(300),
		});
	});
});
