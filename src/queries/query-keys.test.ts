/** Critical React Query cache identity tests. */
// src/queries/query-keys.test.ts

import { describe, expect, it } from "vitest";
import { type AniListId, parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId } from "@/providers/schemas";
import type { StatusInput } from "@/rpc/types";
import {
	normalizeMappingInspectionRequest,
	normalizeMetadataIds,
	normalizeProviderLookupRequest,
	normalizeRadarrStatusRequest,
	normalizeSeerrMediaStatusRequest,
	normalizeSeerrSearchRequest,
	normalizeSeerrTargetRequest,
	normalizeSonarrStatusRequest,
	queryKeys,
} from "./query-keys";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;

describe("query keys", () => {
	it("keeps MAL and AniList provider-status caches separate", () => {
		const malSource = {
			source: "mal",
			id: mal(5114),
		} as const;

		const itemKey = queryKeys.providerMediaStatusItem("sonarr", malSource);
		const malRequest = normalizeSonarrStatusRequest({
			source: malSource,
			title: "Fullmetal Alchemist",
		});
		const malKey = queryKeys.providerMediaStatus("sonarr", malRequest);
		const anilistKey = queryKeys.providerMediaStatus(
			"sonarr",
			normalizeSonarrStatusRequest({
				anilistId: aid(5114),
				title: "Fullmetal Alchemist",
			}),
		);

		expect(malKey.slice(0, itemKey.length)).toEqual(itemKey);
		expect(malKey).not.toEqual(anilistKey);
	});

	it("normalizes noisy Sonarr resolver input once for requests and keys", () => {
		const source = { source: "mal", id: mal(5114) } as const;
		const noisyRequest = normalizeSonarrStatusRequest({
			source,
			anilistId: aid(21),
			title: "\tFullmetal\n\tAlchemist\t",
			metadata: {
				titles: {
					english: " Fullmetal\t Alchemist ",
					romaji: "\t",
				},
				synonyms: [" Hagane no Renkinjutsushi ", "FMA", "FMA", ""],
				startYear: 2003,
				format: "TV",
				relationPrequelIds: [21, 10, 21, -1],
				coverImage: "https://example.test/cover.jpg",
			},
		});
		const cleanRequest = normalizeSonarrStatusRequest({
			source,
			anilistId: aid(21),
			title: "Fullmetal Alchemist",
			metadata: {
				titles: { english: "Fullmetal Alchemist" },
				synonyms: ["FMA", "Hagane no Renkinjutsushi"],
				startYear: 2003,
				format: "TV",
				relationPrequelIds: [10, 21],
			},
		});

		expect(noisyRequest).toEqual(cleanRequest);
		expect(noisyRequest).toEqual({
			source,
			anilistId: aid(21),
			title: "Fullmetal Alchemist",
			metadata: {
				titles: { english: "Fullmetal Alchemist" },
				synonyms: ["FMA", "Hagane no Renkinjutsushi"],
				startYear: 2003,
				format: "TV",
				relationPrequelIds: [aid(10), aid(21)],
			},
		});
		expect(queryKeys.providerMediaStatus("sonarr", noisyRequest)).toEqual(
			queryKeys.providerMediaStatus("sonarr", cleanRequest),
		);
	});

	it("drops cover images, empty metadata, and non-Sonarr prequel IDs", () => {
		const source = { source: "anilist", id: aid(1) } as const;
		const empty = normalizeRadarrStatusRequest({ source });
		const displayOnly = normalizeRadarrStatusRequest({
			source,
			title: " \n ",
			metadata: {
				titles: { english: "\t" },
				synonyms: [""],
				relationPrequelIds: [2],
				coverImage: "different-cover",
			},
		});

		expect(displayOnly).toEqual(empty);
		expect(queryKeys.providerMediaStatus("radarr", displayOnly)).toEqual(
			queryKeys.providerMediaStatus("radarr", empty),
		);
		expect(
			normalizeSeerrTargetRequest({
				source,
				metadata: { relationPrequelIds: [2], coverImage: "cover" },
			}),
		).toEqual(normalizeSeerrTargetRequest({ source }));
	});

	it("keeps execution controls out of resource keys", () => {
		const source = { source: "anilist", id: aid(1) } as const;
		const normalStatus: StatusInput = { source, title: "Title" };
		const forcedStatus: StatusInput = {
			...normalStatus,
			force_verify: true,
			force_mapping_retry: true,
		};
		const normalTarget = normalizeSeerrTargetRequest({ source, title: "Title" });
		const forcedTarget = normalizeSeerrTargetRequest({
			source,
			title: "Title",
			forceRetry: true,
		});

		expect(
			queryKeys.providerMediaStatus(
				"sonarr",
				normalizeSonarrStatusRequest(normalStatus),
			),
		).toEqual(
			queryKeys.providerMediaStatus(
				"sonarr",
				normalizeSonarrStatusRequest(forcedStatus),
			),
		);
		expect(queryKeys.seerrTarget(normalTarget)).toEqual(
			queryKeys.seerrTarget(forcedTarget),
		);
	});

	it("keeps meaningful resolver and provider differences distinct", () => {
		const source = { source: "anilist", id: aid(1) } as const;
		const base = normalizeSonarrStatusRequest({ source, title: "Title" });
		const variants = [
			normalizeSonarrStatusRequest({ source, title: "Other title" }),
			normalizeSonarrStatusRequest({
				source,
				title: "Title",
				metadata: { titles: { english: "Resolver title" } },
			}),
			normalizeSonarrStatusRequest({
				source,
				title: "Title",
				metadata: { startYear: 2003 },
			}),
			normalizeSonarrStatusRequest({
				source,
				title: "Title",
				metadata: { format: "TV" },
			}),
			normalizeSonarrStatusRequest({
				source,
				title: "Title",
				metadata: { relationPrequelIds: [2] },
			}),
			normalizeSonarrStatusRequest({ anilistId: aid(2), title: "Title" }),
		];
		const baseKey = queryKeys.providerMediaStatus("sonarr", base);

		for (const variant of variants) {
			expect(queryKeys.providerMediaStatus("sonarr", variant)).not.toEqual(
				baseKey,
			);
		}
		expect(queryKeys.providerMediaStatus("radarr", base)).not.toEqual(baseKey);
	});

	it("includes MAL canonical AniList identity in status and inspection", () => {
		const source = { source: "mal", id: mal(5114) } as const;
		const status = (anilistId?: AniListId) =>
			queryKeys.providerMediaStatus(
				"sonarr",
				normalizeSonarrStatusRequest({
					source,
					...(anilistId === undefined ? {} : { anilistId }),
				}),
			);
		const inspection = (anilistId?: AniListId) =>
			queryKeys.mappingInspection(
				normalizeMappingInspectionRequest("sonarr", {
					source,
					...(anilistId === undefined ? {} : { anilistId }),
				}),
			);

		expect(status()).not.toEqual(status(aid(1)));
		expect(status(aid(1))).not.toEqual(status(aid(2)));
		expect(inspection()).not.toEqual(inspection(aid(1)));
		expect(inspection(aid(1))).not.toEqual(inspection(aid(2)));
		expect(
			normalizeMappingInspectionRequest("sonarr", {
				source: { source: "anilist", id: aid(1) },
			}),
		).toEqual(normalizeMappingInspectionRequest("sonarr", aid(1)));
		expect(
			normalizeSeerrTargetRequest({
				source: { source: "anilist", id: aid(1) },
			}),
		).toEqual(normalizeSeerrTargetRequest(aid(1)));
	});

	it("shares whitespace normalization between search requests and keys", () => {
		const lookup = normalizeProviderLookupRequest({
			term: "\tFullmetal\n Alchemist\t",
		});
		const seerr = normalizeSeerrSearchRequest({
			query: "\tFullmetal\t Alchemist\t",
		});

		expect(lookup).toEqual({ term: "Fullmetal Alchemist" });
		expect(seerr).toEqual({ query: "Fullmetal Alchemist" });
		expect(queryKeys.providerLookup("sonarr", lookup)).toEqual(
			queryKeys.providerLookup(
				"sonarr",
				normalizeProviderLookupRequest({ term: "Fullmetal Alchemist" }),
			),
		);
		expect(queryKeys.seerrSearch(seerr)).toEqual(
			queryKeys.seerrSearch(
				normalizeSeerrSearchRequest({ query: "Fullmetal Alchemist" }),
			),
		);
		expect(
			queryKeys.providerLookup(
				"sonarr",
				normalizeProviderLookupRequest({ term: "FULLMETAL ALCHEMIST" }),
			),
		).not.toEqual(queryKeys.providerLookup("sonarr", lookup));
	});

	it("normalizes Seerr status seasons once for requests and keys", () => {
		const normalized = normalizeSeerrMediaStatusRequest({
			mediaType: "tv",
			tmdbId: tmdb(10),
			seasons: [2, 1, 2],
		});

		expect(normalized).toEqual({
			mediaType: "tv",
			tmdbId: tmdb(10),
			seasons: [1, 2],
		});
		expect(queryKeys.seerrMediaStatus(normalized)).toEqual(
			queryKeys.seerrMediaStatus(
				normalizeSeerrMediaStatusRequest({
					mediaType: "tv",
					tmdbId: tmdb(10),
					seasons: [1, 2],
				}),
			),
		);
	});

	it("normalizes omitted and all TV status to one overall scope", () => {
		const omitted = normalizeSeerrMediaStatusRequest({
			mediaType: "tv",
			tmdbId: tmdb(10),
		});
		const all = normalizeSeerrMediaStatusRequest({
			mediaType: "tv",
			tmdbId: tmdb(10),
			seasons: "all",
		});
		const oneSeason = normalizeSeerrMediaStatusRequest({
			mediaType: "tv",
			tmdbId: tmdb(10),
			seasons: [1],
		});
		const multipleSeasons = normalizeSeerrMediaStatusRequest({
			mediaType: "tv",
			tmdbId: tmdb(10),
			seasons: [2, 1],
		});
		const itemKey = queryKeys.seerrMediaStatusItem("tv", tmdb(10));
		const scopedKeys = [omitted, oneSeason, multipleSeasons].map((request) =>
			queryKeys.seerrMediaStatus(request),
		);

		expect(all).toEqual(omitted);
		expect(queryKeys.seerrMediaStatus(all)).toEqual(
			queryKeys.seerrMediaStatus(omitted),
		);
		expect(
			scopedKeys.every((key) =>
				key.slice(0, itemKey.length).every((part, index) => part === itemKey[index]),
			),
		).toBe(true);
		expect(new Set(scopedKeys.map((key) => JSON.stringify(key))).size).toBe(3);
	});

	it("keeps movie and TV Seerr status item prefixes separate", () => {
		expect(queryKeys.seerrMediaStatusItem("movie", tmdb(10))).not.toEqual(
			queryKeys.seerrMediaStatusItem("tv", tmdb(10)),
		);
	});

	it("normalizes unordered batch IDs", () => {
		expect(
			normalizeMetadataIds([aid(3), aid(1), aid(3), -1 as AniListId]),
		).toEqual([aid(1), aid(3)]);
	});
});
