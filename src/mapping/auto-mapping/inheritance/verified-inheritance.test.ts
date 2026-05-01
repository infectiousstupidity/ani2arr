/** Tests for trusted relation inheritance traversal and exact inherited verification. */
// src/mapping/auto-mapping/inheritance/verified-inheritance.test.ts

import { describe, expect, it, vi } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist";
import type { AniListMedia } from "@/anilist/schemas/media.schema";
import {
	parseTvdbId,
	type ProviderCredentials,
	type SonarrLookupSeries,
} from "@/providers";
import { verifyInheritedSonarrCandidate } from "./inherited-verifier";
import { attemptVerifiedInheritedSonarrResolution } from "./verified-inheritance";

const TEST_CREDENTIALS: ProviderCredentials = {
	url: "http://localhost:8989",
	apiKey: "test-key",
};

const aid = parseAniListId;
const tvdb = parseTvdbId;

function createMedia(
	id: number,
	title: string,
	relations: Array<{ relationType: "PREQUEL" | "SEQUEL"; id: number }> = [],
): AniListMedia {
	return {
		id: aid(id),
		format: "TV",
		title: { english: title },
		synonyms: [],
		relations: {
			edges: relations.map((relation) => ({
				relationType: relation.relationType,
				node: { id: aid(relation.id) },
			})),
		},
	};
}

describe("verifyInheritedSonarrCandidate", () => {
	it("accepts when exact Sonarr metadata confirms title-family continuity", async () => {
		const result = await verifyInheritedSonarrCandidate(
			createMedia(1, "Attack on Titan Final Season"),
			{
				providerId: tvdb(100),
				borrowedBaseTitle: "Attack on Titan",
				immediateSourceAniListId: aid(2),
				chainAnchorAniListId: aid(2),
			},
			{
				lookupByProviderId: vi.fn(
					async () =>
						({
							title: "Attack on Titan",
							tvdbId: tvdb(100),
						}) satisfies SonarrLookupSeries,
				),
			},
			TEST_CREDENTIALS,
		);

		expect(result.verdict).toBe("accept");
		expect(result.details.positiveSignals.length).toBeGreaterThan(0);
		expect(result.details.contradictions).toEqual([]);
	});

	it("rejects when exact Sonarr metadata contradicts the AniList title family", async () => {
		const result = await verifyInheritedSonarrCandidate(
			createMedia(1, "Bleach"),
			{
				providerId: tvdb(100),
				borrowedBaseTitle: "Bleach",
				immediateSourceAniListId: aid(2),
				chainAnchorAniListId: aid(2),
			},
			{
				lookupByProviderId: vi.fn(
					async () =>
						({
							title: "Naruto",
							tvdbId: tvdb(100),
						}) satisfies SonarrLookupSeries,
				),
			},
			TEST_CREDENTIALS,
		);

		expect(result.verdict).toBe("reject");
		expect(result.details.contradictions).toEqual([
			"Exact Sonarr titles conflict with the current and trusted related AniList title families.",
		]);
	});

	it("returns ambiguous when exact Sonarr metadata is too generic to accept", async () => {
		const result = await verifyInheritedSonarrCandidate(
			createMedia(1, "Special"),
			{
				providerId: tvdb(100),
				immediateSourceAniListId: aid(2),
				chainAnchorAniListId: aid(2),
			},
			{
				lookupByProviderId: vi.fn(
					async () =>
						({
							title: "Special",
							tvdbId: tvdb(100),
						}) satisfies SonarrLookupSeries,
				),
			},
			TEST_CREDENTIALS,
		);

		expect(result.verdict).toBe("ambiguous");
		expect(result.details.positiveSignals).toEqual([]);
		expect(result.details.contradictions).toEqual([]);
	});
});

describe("attemptVerifiedInheritedSonarrResolution", () => {
	it("uses trusted anchors only and prefers the nearest relation depth", async () => {
		const mediaById = new Map<number, AniListMedia>([
			[
				1,
				createMedia(1, "Attack on Titan Final Season", [
					{ relationType: "PREQUEL", id: 2 },
				]),
			],
			[
				2,
				createMedia(2, "Attack on Titan Season 3", [
					{ relationType: "PREQUEL", id: 4 },
				]),
			],
			[4, createMedia(4, "Attack on Titan Season 2")],
		]);

		const exactLookup = vi.fn(
			async (providerId: ReturnType<typeof tvdb>) =>
				({
					title: providerId === tvdb(200) ? "Attack on Titan" : "Wrong Show",
					tvdbId: providerId,
				}) satisfies SonarrLookupSeries,
		);

		const result = await attemptVerifiedInheritedSonarrResolution({
			media: mediaById.get(1)!,
			anilistApi: {
				fetchMediaWithRelations: vi.fn(
					async (id: AniListId) => mediaById.get(id)!,
				),
			} as never,
			anibridgeMappingStore: {
				getSonarrCandidates: vi.fn((anilistId: AniListId) =>
					anilistId === 4 ? [tvdb(400)] : [],
				),
			} as never,
			manualMappings: {
				isIgnored: vi.fn(() => false),
				get: vi.fn((_: "sonarr", anilistId: AniListId) =>
					anilistId === 2 ? tvdb(200) : null,
				),
			},
			lookupClient: {
				provider: "sonarr",
				reset: vi.fn(async () => {}),
				lookupTitle: vi.fn(async () => []),
				readProviderId: vi.fn(() => null),
				lookupByProviderId: exactLookup,
			},
			credentials: TEST_CREDENTIALS,
		});

		expect(result).toMatchObject({
			status: "accepted",
			resolved: {
				providerId: tvdb(200),
				immediateSourceAniListId: 2,
				chainAnchorAniListId: 2,
			},
		});
		expect(exactLookup).toHaveBeenCalledWith(tvdb(200), TEST_CREDENTIALS);
	});

	it("returns ambiguous when nearest trusted anchors disagree", async () => {
		const mediaById = new Map<number, AniListMedia>([
			[
				1,
				createMedia(1, "Attack on Titan Final Season", [
					{ relationType: "PREQUEL", id: 2 },
					{ relationType: "SEQUEL", id: 3 },
				]),
			],
			[2, createMedia(2, "Attack on Titan Season 3")],
			[3, createMedia(3, "Attack on Titan Season 5")],
		]);

		const exactLookup = vi.fn();
		const result = await attemptVerifiedInheritedSonarrResolution({
			media: mediaById.get(1)!,
			anilistApi: {
				fetchMediaWithRelations: vi.fn(
					async (id: AniListId) => mediaById.get(id)!,
				),
			} as never,
			anibridgeMappingStore: {
				getSonarrCandidates: vi.fn((anilistId: AniListId) => {
					if (anilistId === 2) return [tvdb(200)];
					if (anilistId === 3) return [tvdb(300)];
					return [];
				}),
			} as never,
			lookupClient: {
				provider: "sonarr",
				reset: vi.fn(async () => {}),
				lookupTitle: vi.fn(async () => []),
				readProviderId: vi.fn(() => null),
				lookupByProviderId: exactLookup,
			},
			credentials: TEST_CREDENTIALS,
		});

		expect(result.status).toBe("ambiguous");
		expect(exactLookup).not.toHaveBeenCalled();
	});

	it("respects the traversal depth bound", async () => {
		const mediaById = new Map<number, AniListMedia>([
			[
				1,
				createMedia(1, "Attack on Titan Final Season", [
					{ relationType: "PREQUEL", id: 2 },
				]),
			],
			[
				2,
				createMedia(2, "Attack on Titan Season 3", [
					{ relationType: "PREQUEL", id: 4 },
				]),
			],
			[4, createMedia(4, "Attack on Titan Season 2")],
		]);

		const result = await attemptVerifiedInheritedSonarrResolution({
			media: mediaById.get(1)!,
			anilistApi: {
				fetchMediaWithRelations: vi.fn(
					async (id: AniListId) => mediaById.get(id)!,
				),
			} as never,
			anibridgeMappingStore: {
				getSonarrCandidates: vi.fn((anilistId: AniListId) =>
					anilistId === 4 ? [tvdb(400)] : [],
				),
			} as never,
			manualMappings: {
				isIgnored: vi.fn(() => false),
				get: vi.fn(() => null),
			},
			lookupClient: {
				provider: "sonarr",
				reset: vi.fn(async () => {}),
				lookupTitle: vi.fn(async () => []),
				readProviderId: vi.fn(() => null),
				lookupByProviderId: vi.fn(async () => null),
			},
			credentials: TEST_CREDENTIALS,
			maxDepth: 1,
		});

		expect(result.status).toBe("none");
	});

	it("skips ignored relation entries when selecting trusted anchors", async () => {
		const mediaById = new Map<number, AniListMedia>([
			[
				1,
				createMedia(1, "Attack on Titan Final Season", [
					{ relationType: "PREQUEL", id: 2 },
					{ relationType: "SEQUEL", id: 3 },
				]),
			],
			[2, createMedia(2, "Ignored Anchor")],
			[3, createMedia(3, "Trusted Upstream Anchor")],
		]);

		const result = await attemptVerifiedInheritedSonarrResolution({
			media: mediaById.get(1)!,
			anilistApi: {
				fetchMediaWithRelations: vi.fn(
					async (id: AniListId) => mediaById.get(id)!,
				),
			} as never,
			anibridgeMappingStore: {
				getSonarrCandidates: vi.fn((anilistId: AniListId) =>
					anilistId === 3 ? [tvdb(300)] : [],
				),
			} as never,
			manualMappings: {
				isIgnored: vi.fn(
					(_: "sonarr", anilistId: AniListId) => anilistId === 2,
				),
				get: vi.fn((_: "sonarr", anilistId: AniListId) =>
					anilistId === 2 ? tvdb(200) : null,
				),
			},
			lookupClient: {
				provider: "sonarr",
				reset: vi.fn(async () => {}),
				lookupTitle: vi.fn(async () => []),
				readProviderId: vi.fn(() => null),
				lookupByProviderId: vi.fn(
					async () =>
						({
							title: "Trusted Upstream Anchor",
							tvdbId: tvdb(300),
						}) satisfies SonarrLookupSeries,
				),
			},
			credentials: TEST_CREDENTIALS,
		});

		expect(result).toMatchObject({
			status: "accepted",
			resolved: { providerId: tvdb(300) },
		});
	});
});
