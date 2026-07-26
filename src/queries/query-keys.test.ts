/** Tests for canonical React Query key shape and pure key input normalization. */
// src/queries/query-keys.test.ts

import { describe, expect, it } from "vitest";
import type { AniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId } from "@/providers/schemas";
import type { StatusInput } from "@/rpc/types";
import {
	normalizeMetadataIds,
	normalizeSeerrTargetInput,
	normalizeSourceKeys,
	queryKeys,
} from "@/queries/query-keys";

const aid = (value: number): AniListId => value as AniListId;

const expectPrefix = (
	key: readonly unknown[],
	prefix: readonly unknown[],
): void => {
	expect(key.slice(0, prefix.length)).toEqual(prefix);
};

describe("queryKeys", () => {
	it("sorts, dedupes, and filters AniList IDs", () => {
		expect(
			normalizeMetadataIds([aid(3), aid(1), aid(3), -1 as AniListId]),
		).toEqual([aid(1), aid(3)]);
	});

	it("sorts and dedupes source identity keys", () => {
		const sources = [
			{ source: "mal", id: parseMyAnimeListId(5114) },
			{ source: "anilist", id: aid(21) },
			{ source: "mal", id: parseMyAnimeListId(5114) },
		] as const;

		expect(normalizeSourceKeys(sources)).toEqual(["anilist:21", "mal:5114"]);
		expect(queryKeys.sourceAniListIds(["mal:5114", "anilist:21", "mal:5114"])).toEqual([
			"a2a",
			"mapping",
			"sourceAniListIds",
			["anilist:21", "mal:5114"],
		]);
	});

	it("uses one mapping list key", () => {
		expect(queryKeys.mappings()).toEqual(["a2a", "mapping", "list"]);
	});

	it("normalizes provider lookup text", () => {
		expect(queryKeys.providerLookup("sonarr", "  Cowboy Bebop  ")).toEqual(
			queryKeys.providerLookup("sonarr", "cowboy bebop"),
		);
	});

	it("sorts and dedupes Seerr target IDs", () => {
		expect(queryKeys.seerrTargets([aid(3), aid(1), aid(3)])).toEqual(
			queryKeys.seerrTargets([aid(1), aid(3)]),
		);
	});

	it("keeps single and batch Seerr targets under one root", () => {
		const root = queryKeys.seerrTargetsRoot();
		const malSource = {
			source: { source: "mal", id: parseMyAnimeListId(1) },
		} as const;

		expectPrefix(
			queryKeys.seerrTarget(normalizeSeerrTargetInput(aid(1))),
			root,
		);
		expectPrefix(
			queryKeys.seerrTarget(normalizeSeerrTargetInput(malSource)),
			root,
		);
		expectPrefix(queryKeys.seerrTargets([aid(1), aid(2)]), root);
		expect(
			queryKeys.seerrTarget(normalizeSeerrTargetInput(aid(1))),
		).not.toEqual(
			queryKeys.seerrTargets([aid(1)]),
		);
		expect(
			queryKeys.seerrTarget(normalizeSeerrTargetInput(aid(1))),
		).not.toEqual(
			queryKeys.seerrTarget(normalizeSeerrTargetInput(malSource)),
		);
	});

	it("keys Seerr resolution by normalized hints and force retry", () => {
		const source = {
			source: { source: "mal", id: parseMyAnimeListId(5114) },
		} as const;
		const base = normalizeSeerrTargetInput({ ...source, title: "  Title  " });
		const enriched = normalizeSeerrTargetInput({
			...source,
			title: "Title",
			metadata: { format: "TV", startYear: 2009 },
		});
		const forced = normalizeSeerrTargetInput({
			...source,
			title: "Title",
			forceRetry: true,
		});

		expect(base).toMatchObject({
			title: "Title",
			metadata: null,
			forceRetry: false,
		});
		expect(queryKeys.seerrTarget(base)).not.toEqual(
			queryKeys.seerrTarget(enriched),
		);
		expect(queryKeys.seerrTarget(base)).not.toEqual(
			queryKeys.seerrTarget(forced),
		);
		expect(
			queryKeys.seerrTarget(
				normalizeSeerrTargetInput({ ...source, title: " ".repeat(3) }),
			),
		).toEqual(queryKeys.seerrTarget(normalizeSeerrTargetInput(source)));
	});

	it("separates Seerr media status keys by media type and seasons", () => {
		const tvInput = {
			mediaType: "tv",
			tmdbId: parseTmdbId(1),
		} as const;

		expect(
			queryKeys.seerrMediaStatus({
				mediaType: "movie",
				tmdbId: parseTmdbId(1),
			}),
		).not.toEqual(queryKeys.seerrMediaStatus(tvInput));

		expect(
			queryKeys.seerrMediaStatus({
				...tvInput,
				seasons: [2, -1, 1, 2],
			}),
		).toEqual(
			queryKeys.seerrMediaStatus({
				...tvInput,
				seasons: [1, 2],
			}),
		);

		expect(
			queryKeys.seerrMediaStatus({
				...tvInput,
				seasons: "all",
			}),
		).not.toEqual(queryKeys.seerrMediaStatus(tvInput));
	});

	it("uses provider media-status request fields without metadata filtering", () => {
		const request = {
			anilistId: aid(9),
			title: "  Test  ",
			force_verify: true,
			metadata: {
				titles: { english: "Test EN", romaji: "Test JP" },
				synonyms: ["  Alias  ", "Second Alias"],
				format: "TV",
				startYear: 2025,
				coverImage: "https://example.invalid/cover.jpg",
				relationPrequelIds: [1, 2],
			},
		} satisfies StatusInput;
		const metadata = {
			titles: { english: "Test EN", romaji: "Test JP" },
			synonyms: ["  Alias  ", "Second Alias"],
			format: "TV" as const,
			startYear: 2025,
			coverImage: "https://example.invalid/cover.jpg",
			relationPrequelIds: [1, 2],
		};

		expect(queryKeys.providerMediaStatus("sonarr", request)).toEqual([
			"a2a",
			"provider",
			"sonarr",
			"mediaStatus",
			"anilist:9",
			{
				title: "  Test  ",
				metadata,
			},
		]);
	});

	it("separates provider media-status keys by request field changes", () => {
		expect(
			queryKeys.providerMediaStatus("sonarr", {
				anilistId: aid(7),
				title: " ".repeat(3),
				metadata: null,
			}),
		).not.toEqual(
			queryKeys.providerMediaStatus("sonarr", {
				anilistId: aid(7),
			}),
		);
	});

	it("keys provider media status by source identity", () => {
		expect(
			queryKeys.providerMediaStatus("sonarr", {
				source: { source: "mal", id: parseMyAnimeListId(5114) },
				title: "Fullmetal Alchemist: Brotherhood",
			}),
		).toEqual([
			"a2a",
			"provider",
			"sonarr",
			"mediaStatus",
			"mal:5114",
			{ title: "Fullmetal Alchemist: Brotherhood" },
		]);
	});

	it("keeps provider root and media item prefixes valid", () => {
		const providerRoot = queryKeys.providerRoot("sonarr");
		expectPrefix(
			queryKeys.providerConnection("sonarr", "configured"),
			providerRoot,
		);
		expectPrefix(
			queryKeys.providerFormResources("sonarr", "draft"),
			providerRoot,
		);
		const lookupRoot = queryKeys.providerLookupRoot("sonarr");
		expectPrefix(lookupRoot, providerRoot);
		expectPrefix(queryKeys.providerLookup("sonarr", "test"), lookupRoot);
		expectPrefix(queryKeys.providerMediaStatusRoot("sonarr"), providerRoot);

		const itemRoot = queryKeys.providerMediaStatusItem("sonarr", aid(12));
		expectPrefix(
			queryKeys.providerMediaStatus("sonarr", {
				anilistId: aid(12),
				title: "A",
				metadata: { format: "TV", startYear: 2024 },
			}),
			itemRoot,
		);
		expectPrefix(
			queryKeys.providerMediaStatus("sonarr", {
				anilistId: aid(12),
				title: "B",
				metadata: { format: null, startYear: null },
			}),
			itemRoot,
		);
	});
});
