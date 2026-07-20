/** Tests for automatic mapping result expiry behavior. */
// src/mapping/auto.store.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId } from "@/providers/schemas";
import {
	clearAutoResults,
	getAutoResult,
	listSourceAutoResults,
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
		await setAutoResult("radarr", aid(1), {
			kind: "mapped",
			providerId: tmdb(10),
		});

		vi.setSystemTime(new Date("2026-02-02T00:00:00Z"));
		await expect(getAutoResult("radarr", aid(1))).resolves.toBeNull();

		vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
		await expect(getAutoResult("radarr", aid(1))).resolves.toEqual({
			kind: "mapped",
			providerId: tmdb(10),
		});
	});

	it("stores and lists MAL source auto results", async () => {
		await setAutoResult("radarr", { source: "mal", id: mal(5114) }, {
			kind: "mapped",
			providerId: tmdb(300),
		});

		await expect(
			getAutoResult("radarr", { source: "mal", id: mal(5114) }),
		).resolves.toEqual({
			kind: "mapped",
			providerId: tmdb(300),
		});
		await expect(listSourceAutoResults("radarr")).resolves.toEqual([
			{
				source: { source: "mal", id: mal(5114) },
				result: { kind: "mapped", providerId: tmdb(300) },
			},
		]);
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

		await expect(getAutoResult("radarr", aid(1))).resolves.toEqual({
			kind: "mapped",
			providerId: tmdb(300),
		});
	});
});
