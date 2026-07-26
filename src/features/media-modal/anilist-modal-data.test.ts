/** Tests for shared media modal AniList metadata and title resolution. */
// src/features/media-modal/anilist-modal-data.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId, type AniListMedia } from "@/anilist/types";
import { resolveMediaModalMetadata } from "./anilist-modal-data";

function createMedia(overrides: Partial<AniListMedia> = {}): AniListMedia {
	return {
		id: parseAniListId(1),
		format: null,
		title: {},
		synonyms: [],
		...overrides,
	};
}

describe("resolveMediaModalMetadata", () => {
	it("uses the configured preferred AniList title language for provider requests", () => {
		const result = resolveMediaModalMetadata({
			source: { source: "anilist", id: parseAniListId(1) },
			anilistId: parseAniListId(1),
			anilistMedia: createMedia({
				title: {
					english: "English Title",
					romaji: "Romaji Title",
					native: "Native Title",
				},
			}),
			metadataBatchData: undefined,
			myAnimeListMetadata: undefined,
			metadataHint: null,
			preferredTitleLanguage: "native",
		});

		expect(result.providerRequestTitle).toBe("Native Title");
		expect(result.providerPayloadTitle).toBe("Native Title");
		expect(result.anilistHeaderData.title).toBe("Native Title");
		expect(result.fallbackTitle).toBe("English Title");
	});

	it("uses synthetic fallback title and omits provider payload title without usable titles", () => {
		const result = resolveMediaModalMetadata({
			source: { source: "anilist", id: parseAniListId(123) },
			anilistId: parseAniListId(123),
			anilistMedia: null,
			metadataBatchData: undefined,
			myAnimeListMetadata: undefined,
			metadataHint: null,
			preferredTitleLanguage: "english",
		});

		expect(result.fallbackTitle).toBe("AniList #123");
		expect(result.providerRequestTitle).toBe("AniList #123");
		expect(result.providerPayloadTitle).toBeUndefined();
	});

	it("builds header data from AniList media fields", () => {
		const result = resolveMediaModalMetadata({
			source: { source: "anilist", id: parseAniListId(2) },
			anilistId: parseAniListId(2),
			anilistMedia: createMedia({
				format: "TV",
				bannerImage: "https://img.example/banner.jpg",
				coverImage: {
					extraLarge: "https://img.example/cover-xl.jpg",
					large: "https://img.example/cover-large.jpg",
					medium: "https://img.example/cover-medium.jpg",
				},
				seasonYear: 2026,
				title: {
					english: "Header Title",
				},
			}),
			metadataBatchData: undefined,
			myAnimeListMetadata: undefined,
			metadataHint: null,
			preferredTitleLanguage: "english",
		});

		expect(result.anilistHeaderData).toEqual({
			title: "Header Title",
			bannerImage: "https://img.example/banner.jpg",
			coverImage: "https://img.example/cover-xl.jpg",
			format: "TV",
			year: 2026,
		});
	});

	it("uses metadata hints as cover fallback when media has no cover image", () => {
		const result = resolveMediaModalMetadata({
			source: { source: "anilist", id: parseAniListId(3) },
			anilistId: parseAniListId(3),
			anilistMedia: createMedia({
				title: {
					romaji: "Hint Cover Title",
				},
			}),
			metadataBatchData: undefined,
			myAnimeListMetadata: undefined,
			metadataHint: {
				coverImage: "https://img.example/hint-cover.jpg",
				format: "MOVIE",
			},
			preferredTitleLanguage: "romaji",
		});

		expect(result.anilistHeaderData.coverImage).toBe(
			"https://img.example/hint-cover.jpg",
		);
		expect(result.anilistHeaderData.format).toBe("MOVIE");
	});

	it("keeps the DOM title for status when AniList media changes display titles", () => {
		const result = resolveMediaModalMetadata({
			source: { source: "anilist", id: parseAniListId(4) },
			anilistId: parseAniListId(4),
			anilistMedia: createMedia({
				title: {
					english: "Frieren: Beyond Journey's End",
					romaji: "Sousou no Frieren",
				},
			}),
			metadataBatchData: {
				metadata: [
					{
						id: parseAniListId(4),
						titles: { romaji: "Sousou no Frieren" },
						seasonYear: 2027,
						format: "TV",
					},
				],
			},
			metadataHint: {
				title: "Sousou no Frieren 3rd Season",
				format: "TV",
			},
			myAnimeListMetadata: undefined,
			preferredTitleLanguage: "english",
		});

		expect(result.providerRequestTitle).toBe("Frieren: Beyond Journey's End");
		expect(result.statusTitle).toBe("Sousou no Frieren 3rd Season");
		expect(result.statusMetadata?.titles).toEqual({ romaji: "Sousou no Frieren" });
	});

	it("does not let full AniList media alter status metadata", () => {
		const result = resolveMediaModalMetadata({
			source: { source: "anilist", id: parseAniListId(5) },
			anilistId: parseAniListId(5),
			anilistMedia: createMedia({
				id: parseAniListId(5),
				title: { english: "Full Media Title" },
				synonyms: ["Full Media Synonym"],
				relations: {
					edges: [
						{
							relationType: "PREQUEL",
							node: {
								id: parseAniListId(50),
							},
						},
					],
				},
			}),
			metadataBatchData: {
				metadata: [
					{
						id: parseAniListId(5),
						titles: { english: "Canonical Title" },
						seasonYear: 2027,
						format: "TV",
					},
				],
			},
			metadataHint: { title: "DOM Title", format: "TV" },
			myAnimeListMetadata: undefined,
			preferredTitleLanguage: "english",
		});

		expect(result.resolvedMetadata?.synonyms).toEqual(["Full Media Synonym"]);
		expect(result.resolvedMetadata?.relationPrequelIds).toEqual([50]);
		expect(result.statusMetadata?.synonyms).toBeNull();
		expect(result.statusMetadata?.relationPrequelIds).toBeNull();
	});
});
