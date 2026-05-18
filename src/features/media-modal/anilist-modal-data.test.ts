/** Tests for shared media modal AniList metadata and title resolution. */
// src/features/media-modal/anilist-modal-data.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist";
import type { AniListMedia } from "@/anilist/schemas/media.schema";
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
			anilistId: parseAniListId(1),
			anilistMedia: createMedia({
				title: {
					english: "English Title",
					romaji: "Romaji Title",
					native: "Native Title",
				},
			}),
			metadataBatchData: undefined,
			metadataHint: null,
			preferredTitleLanguage: "native",
		});

		expect(result.providerRequestTitle).toBe("Native Title");
		expect(result.providerPayloadTitle).toBe("Native Title");
		expect(result.fallbackTitle).toBe("English Title");
	});

	it("uses synthetic fallback title and omits provider payload title without usable titles", () => {
		const result = resolveMediaModalMetadata({
			anilistId: parseAniListId(123),
			anilistMedia: null,
			metadataBatchData: undefined,
			metadataHint: null,
			preferredTitleLanguage: "english",
		});

		expect(result.fallbackTitle).toBe("AniList #123");
		expect(result.providerRequestTitle).toBe("AniList #123");
		expect(result.providerPayloadTitle).toBeUndefined();
	});

	it("builds header data from AniList media fields", () => {
		const result = resolveMediaModalMetadata({
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
			anilistId: parseAniListId(3),
			anilistMedia: createMedia({
				title: {
					romaji: "Hint Cover Title",
				},
			}),
			metadataBatchData: undefined,
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
});
