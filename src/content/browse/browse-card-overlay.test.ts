/** Tests for browse-card provider resolution inputs. */
// src/content/browse/browse-card-overlay.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import type { MappingIdentity, SeerrRequestTarget } from "@/rpc/types";
import { resolveSeerrRequestInput } from "@/content/anilist/target-provider";
import type { HostMediaTarget } from "./types";
import { resolveBrowseCardProvider } from "./browse-card-provider";

const mountTarget = {} as HTMLElement;

function createTarget(format: HostMediaTarget["format"]): HostMediaTarget {
	const anilistId = parseAniListId(210_031);
	return {
		source: { source: "anilist", id: anilistId },
		anilistId,
		title: "Example",
		format,
		mountTarget,
	};
}

describe("resolveBrowseCardProvider", () => {
	it("uses metadata format when host card format is unknown", () => {
		expect(
			resolveBrowseCardProvider({
				parsed: createTarget(null),
				metadata: {
					titles: null,
					synonyms: null,
					startYear: null,
					format: "TV",
					relationPrequelIds: null,
					coverImage: null,
				},
				mappedIdentities: [],
			}),
		).toBe("sonarr");
	});

	it("uses mapped identity when both host and metadata formats are unknown", () => {
		const mappedIdentities: MappingIdentity[] = [
			{
				anilistId: parseAniListId(210_031),
				provider: "sonarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: 123,
				},
			},
		];

		expect(
			resolveBrowseCardProvider({
				parsed: createTarget(null),
				metadata: null,
				mappedIdentities,
			}),
		).toBe("sonarr");
	});
});

describe("resolveSeerrRequestInput", () => {
	it("uses upstream Seerr TV targets without provider mappings", () => {
		const target: SeerrRequestTarget = {
			anilistId: parseAniListId(210_031),
			mediaType: "tv",
			tmdbId: parseTmdbId(500),
			tvdbId: parseTvdbId(700),
			seasons: [1],
			source: "anibridge",
		};

		expect(
			resolveSeerrRequestInput({
				anilistId: parseAniListId(210_031),
				mappedIdentities: [],
				seerrRequestTarget: target,
			}),
		).toEqual({
			anilistId: parseAniListId(210_031),
			mediaType: "tv",
			tmdbId: parseTmdbId(500),
			tvdbId: parseTvdbId(700),
			seasons: [1],
		});
	});

	it("falls back to same AniList Radarr mapping only", () => {
		const anilistId = parseAniListId(210_031);
		const mappedIdentities: MappingIdentity[] = [
			{
				anilistId: parseAniListId(123),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: parseTmdbId(100),
				},
			},
			{
				anilistId,
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: parseTmdbId(500),
				},
			},
		];

		expect(
			resolveSeerrRequestInput({
				anilistId,
				mappedIdentities,
				seerrRequestTarget: null,
			}),
		).toEqual({
			anilistId,
			mediaType: "movie",
			tmdbId: parseTmdbId(500),
		});
	});
});
