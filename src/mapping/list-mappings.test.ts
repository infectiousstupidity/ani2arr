/** Effective mapping list behavior over shared fact records. */

import { describe, expect, it } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import {
	getMappingIdentities,
	listEffectiveMappingRecordsByProvider,
} from "./list-mappings";

const aid = parseAniListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

async function seed(input: {
	manual?: Record<string, unknown>;
	automatic?: Record<string, unknown>;
	upstream?: Record<string, unknown>;
}): Promise<void> {
	await browser.storage.local.set({
		"mapping:manual": { version: 1, records: input.manual ?? {} },
		"mapping:auto": { version: 1, records: input.automatic ?? {} },
		"mapping:upstream": {
			version: 1,
			records: input.upstream ?? {},
			fetchedAt: Date.now(),
		},
	});
}

describe("list mappings", () => {
	it("combines shared records and splits provider projections", async () => {
		await seed({
			manual: {
				"anilist:1": {
					facts: {},
					decisions: { sonarr: { ignored: true } },
				},
			},
			automatic: {
				"anilist:2": {
					facts: { tmdbMovie: tmdb(22) },
					slotMeta: {
						tmdbMovie: { expiresAt: Date.now() + 10_000 },
					},
				},
			},
			upstream: {
				"anilist:3": {
					facts: { tvdbShow: tvdb(33), tmdbMovie: tmdb(44) },
				},
			},
		});

		const result = await listEffectiveMappingRecordsByProvider();
		expect(
			[...result.sonarr, ...result.radarr].map((record) => [
				record.anilistId,
				record.provider,
				record.result.kind,
			]),
		).toEqual([
			[aid(1), "sonarr", "ignored"],
			[aid(3), "sonarr", "mapped"],
			[aid(2), "radarr", "mapped"],
			[aid(3), "radarr", "mapped"],
		]);
	});

	it("routes movie upstream mappings only to Radarr", async () => {
		await seed({
			upstream: {
				"anilist:1": {
					facts: { tvdbShow: tvdb(10), tmdbMovie: tmdb(20) },
				},
			},
		});
		const result = await listEffectiveMappingRecordsByProvider({
			loadFormatByAniListId: async () => new Map([[aid(1), "MOVIE"]]),
		});

		expect(result.sonarr).toEqual([]);
		expect(result.radarr).toMatchObject([
			{
				anilistId: aid(1),
				result: { kind: "mapped", providerId: tmdb(20) },
			},
		]);
	});

	it("returns requested identities in AniList and provider order", async () => {
		await seed({
			manual: {
				"anilist:1": { facts: { tmdbMovie: tmdb(11) } },
				"anilist:2": { facts: { tvdbShow: tvdb(22) } },
			},
		});

		await expect(getMappingIdentities([aid(2), aid(1)])).resolves.toMatchObject([
			{ anilistId: aid(2), provider: "sonarr" },
			{ anilistId: aid(1), provider: "radarr" },
		]);
	});
});
