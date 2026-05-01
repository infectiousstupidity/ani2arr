/** Tests for candidate-search match reasons on exact and fuzzy title wins. */
// src/mapping/auto-mapping/candidate-search/candidate-search.test.ts

import type { AniListMedia } from "@/anilist/schemas/media.schema";
import { parseAniListId } from "@/anilist";
import type {
	ProviderTitleLookup,
	ProviderTitleResult,
} from "@/mapping/auto-mapping/lookup/provider-title-lookup";
import { parseTvdbId } from "@/providers";
import { describe, expect, it, vi } from "vitest";
import { searchAutoMappingCandidates } from "./candidate-search";

type SonarrLookupResult = ProviderTitleResult & { tvdbId: number };
const aid = parseAniListId;
const tvdb = parseTvdbId;

const createLookupClient = (
	results: SonarrLookupResult[],
): ProviderTitleLookup<SonarrLookupResult> => ({
	provider: "sonarr",
	reset: async () => {},
	lookupTitle: async () => results,
	readProviderId: (result: unknown) =>
		typeof (result as Partial<SonarrLookupResult>).tvdbId === "number"
			? tvdb((result as SonarrLookupResult).tvdbId)
			: null,
});

const createMedia = (title: string, year = 2013): AniListMedia => ({
	id: aid(1),
	format: "TV",
	title: { english: title },
	synonyms: [],
	startDate: { year },
});

const TEST_CREDENTIALS = {
	url: "http://localhost:8989",
	apiKey: "test-key",
};

describe("searchAutoMappingCandidates", () => {
	it("returns exact when the winning candidate is an exact title match", async () => {
		const result = await searchAutoMappingCandidates(
			createMedia("Attack on Titan"),
			{
				lookupClient: createLookupClient([
					{ title: "Attack on Titan", tvdbId: 101, year: 2013 },
				]),
				credentials: TEST_CREDENTIALS,
				limits: {
					maxTerms: 1,
					scoreThreshold: 0.1,
					earlyStopThreshold: 2,
				},
				log: { debug: vi.fn() } as never,
			},
		);

		expect(result).toMatchObject({
			status: "resolved",
			providerId: 101,
			reason: "exact-title-match",
			searchTerms: ["Attack on Titan"],
		});
		expect(result.candidates).toEqual([
			expect.objectContaining({
				providerId: 101,
				reason: "exact-title-match",
				searchTerm: "Attack on Titan",
			}),
		]);
	});

	it("returns fuzzy when the winning candidate only matches approximately", async () => {
		const result = await searchAutoMappingCandidates(
			createMedia("Attack on Titan"),
			{
				lookupClient: createLookupClient([
					{ title: "Attack Titan", tvdbId: 202, year: 2013 },
				]),
				credentials: TEST_CREDENTIALS,
				limits: {
					maxTerms: 1,
					scoreThreshold: 0.01,
					earlyStopThreshold: 2,
				},
				log: { debug: vi.fn() } as never,
			},
		);

		expect(result).toMatchObject({
			status: "resolved",
			providerId: 202,
			reason: "fuzzy-match",
			searchTerms: ["Attack on Titan"],
		});
		expect(result.candidates).toEqual([
			expect.objectContaining({
				providerId: 202,
				reason: "fuzzy-match",
				searchTerm: "Attack on Titan",
			}),
		]);
	});

	it("does not treat duplicate hits for the same provider ID as a tie", async () => {
		let callCount = 0;
		const lookupClient: ProviderTitleLookup<SonarrLookupResult> = {
			provider: "sonarr",
			reset: async () => {},
			lookupTitle: async () => {
				callCount += 1;
				return [
					{
						title: callCount === 1 ? "Needle Bloom" : "Needle Bloom!",
						tvdbId: 303,
						year: 2020,
					},
				];
			},
			readProviderId: (result: unknown) =>
				typeof (result as Partial<SonarrLookupResult>).tvdbId === "number"
					? tvdb((result as SonarrLookupResult).tvdbId)
					: null,
		};

		const result = await searchAutoMappingCandidates(
			{
				...createMedia("Needle Bloom", 2020),
				title: {
					english: "Needle Bloom",
					romaji: "Needle Bloom!",
				},
			},
			{
				lookupClient,
				credentials: TEST_CREDENTIALS,
				limits: {
					maxTerms: 2,
					scoreThreshold: 0.1,
					earlyStopThreshold: 2,
				},
				log: { debug: vi.fn() } as never,
			},
		);

		expect(result).toMatchObject({
			status: "resolved",
			providerId: 303,
		});
	});

	it("leaves near-tied different provider IDs unresolved", async () => {
		const result = await searchAutoMappingCandidates(
			createMedia("Needle Bloom", 2020),
			{
				lookupClient: createLookupClient([
					{ title: "Needle Bloom", tvdbId: 303, year: 2020 },
					{ title: "Needle Bloom!", tvdbId: 404, year: 2020 },
				]),
				credentials: TEST_CREDENTIALS,
				limits: {
					maxTerms: 1,
					scoreThreshold: 0.1,
					earlyStopThreshold: 2,
				},
				log: { debug: vi.fn() } as never,
			},
		);

		expect(result).toMatchObject({
			status: "unresolved",
			reason: "low-confidence",
		});
	});
});
