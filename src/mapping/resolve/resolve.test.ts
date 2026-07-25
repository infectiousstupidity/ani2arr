/** Tests for automatic mapping resolver provider-first behavior. */
// src/mapping/resolve/resolve.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	parseAniListId,
	type AniListId,
	type AniListMedia,
} from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { createAutomaticResolver } from "./resolve";

const setAutoResultMock = vi.hoisted(() => vi.fn());
type ResolverDeps = Parameters<typeof createAutomaticResolver>[0];
const anilistSource = (id: AniListId) => ({ source: "anilist", id }) as const;

vi.mock("../auto.store", () => ({
	setAutoResult: setAutoResultMock,
}));

function createDeps() {
	return {
		anilistMedia: {
			fetchMediaWithRelations: vi.fn(),
			iteratePrequelChain: vi.fn(
				async function* (): AsyncGenerator<AniListMedia> {},
			),
		},
		searchProviderCandidates: vi
			.fn<ResolverDeps["searchProviderCandidates"]>()
			.mockResolvedValue([]),
	};
}

function createMedia(input: {
	id: AniListId;
	english?: string;
	romaji?: string;
	native?: string;
	synonyms?: string[];
}): AniListMedia {
	return {
		id: input.id,
		format: null,
		title: {
			...(input.english === undefined ? {} : { english: input.english }),
			...(input.romaji === undefined ? {} : { romaji: input.romaji }),
			...(input.native === undefined ? {} : { native: input.native }),
		},
		synonyms: input.synonyms ?? [],
	};
}

describe("createAutomaticResolver", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("maps from title lookup before fetching AniList media", async () => {
		const deps = createDeps();
		const anilistId = parseAniListId(211_496);
		const identity = anilistSource(anilistId);
		deps.searchProviderCandidates.mockResolvedValue([
			{ providerId: 450_000, title: "Kagurabachi", year: 2026 },
		]);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await expect(
			resolve({
				provider: "sonarr",
				cacheIdentity: identity,
				canonicalAniListId: anilistId,
				rejectedProviderIds: [],
				title: "Kagurabachi",
			}),
		).resolves.toBe(true);

		expect(deps.searchProviderCandidates).toHaveBeenCalledWith(
			"sonarr",
			"Kagurabachi",
		);
		expect(deps.anilistMedia.fetchMediaWithRelations).not.toHaveBeenCalled();
		expect(setAutoResultMock).toHaveBeenCalledWith("sonarr", identity, {
			kind: "mapped",
			providerId: 450_000,
			matchedTitle: "Kagurabachi",
		});
	});

	it("keeps a distinct page title and metadata title in the same search", async () => {
		const deps = createDeps();
		const identity = {
			source: "mal",
			id: parseMyAnimeListId(63_816),
		} as const;
		deps.searchProviderCandidates.mockImplementation(
			async (_provider, title) =>
				title === "Page Match"
					? [{ providerId: 450_010, title: "Page Match", year: 2026 }]
					: [],
		);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await resolve({
			provider: "sonarr",
			cacheIdentity: identity,
			canonicalAniListId: null,
			rejectedProviderIds: [],
			title: "Page Match",
			metadata: { titles: { romaji: "Metadata Miss" } },
		});

		expect(deps.searchProviderCandidates).toHaveBeenNthCalledWith(
			1,
			"sonarr",
			"Metadata Miss",
		);
		expect(deps.searchProviderCandidates).toHaveBeenNthCalledWith(
			2,
			"sonarr",
			"Page Match",
		);
	});

	it("does not cache unmapped when AniList fallback fails", async () => {
		const deps = createDeps();
		const anilistId = parseAniListId(211_496);
		const identity = anilistSource(anilistId);
		deps.anilistMedia.fetchMediaWithRelations.mockRejectedValue(
			new Error("AniList rate limit exceeded"),
		);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await expect(
			resolve({
				provider: "sonarr",
				cacheIdentity: identity,
				canonicalAniListId: anilistId,
				rejectedProviderIds: [],
				title: "Kagurabachi",
			}),
		).resolves.toBe(false);

		expect(deps.anilistMedia.fetchMediaWithRelations).toHaveBeenCalledWith(
			anilistId,
		);
		expect(setAutoResultMock).not.toHaveBeenCalled();
	});

	it("falls back to AniList only after the DOM title misses", async () => {
		const deps = createDeps();
		const anilistId = parseAniListId(211_496);
		const identity = anilistSource(anilistId);
		deps.searchProviderCandidates.mockImplementation(
			async (_provider, title) =>
				title === "Kagurabachi"
					? [{ providerId: 450_000, title: "Kagurabachi", year: 2026 }]
					: [],
		);
		deps.anilistMedia.fetchMediaWithRelations.mockResolvedValue(
			createMedia({
				id: anilistId,
				english: "Kagurabachi",
				romaji: "Kagurabachi Romaji",
			}),
		);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await resolve({
			provider: "sonarr",
			cacheIdentity: identity,
			canonicalAniListId: anilistId,
			rejectedProviderIds: [],
			title: "DOM Miss",
		});

		expect(deps.searchProviderCandidates).toHaveBeenNthCalledWith(
			1,
			"sonarr",
			"DOM Miss",
		);
		expect(deps.anilistMedia.fetchMediaWithRelations).toHaveBeenCalledWith(
			anilistId,
		);
		expect(deps.searchProviderCandidates).toHaveBeenNthCalledWith(
			2,
			"sonarr",
			"Kagurabachi",
		);
		expect(deps.searchProviderCandidates).toHaveBeenCalledTimes(2);
		expect(setAutoResultMock).toHaveBeenCalledWith("sonarr", identity, {
			kind: "mapped",
			providerId: 450_000,
			matchedTitle: "Kagurabachi",
		});
	});

	it("does not repeat the DOM title during AniList fallback", async () => {
		const deps = createDeps();
		const anilistId = parseAniListId(211_496);
		const identity = anilistSource(anilistId);
		deps.searchProviderCandidates.mockImplementation(
			async (_provider, title) =>
				title === "Next Title"
					? [{ providerId: 450_001, title: "Next Title", year: 2026 }]
					: [],
		);
		deps.anilistMedia.fetchMediaWithRelations.mockResolvedValue(
			createMedia({
				id: anilistId,
				english: "Same Title",
				romaji: "Next Title",
			}),
		);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await resolve({
			provider: "sonarr",
			cacheIdentity: identity,
			canonicalAniListId: anilistId,
			rejectedProviderIds: [],
			title: "Same Title",
		});

		expect(deps.searchProviderCandidates).toHaveBeenCalledTimes(2);
		expect(deps.searchProviderCandidates).toHaveBeenNthCalledWith(
			1,
			"sonarr",
			"Same Title",
		);
		expect(deps.searchProviderCandidates).toHaveBeenNthCalledWith(
			2,
			"sonarr",
			"Next Title",
		);
		expect(setAutoResultMock).toHaveBeenCalledWith("sonarr", identity, {
			kind: "mapped",
			providerId: 450_001,
			matchedTitle: "Next Title",
		});
	});

	it("stores unmapped after DOM and AniList fallback miss", async () => {
		const deps = createDeps();
		const anilistId = parseAniListId(211_496);
		const identity = anilistSource(anilistId);
		deps.anilistMedia.fetchMediaWithRelations.mockResolvedValue(
			createMedia({
				id: anilistId,
				english: "Kagurabachi",
				romaji: "Kagurabachi Romaji",
			}),
		);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await resolve({
			provider: "sonarr",
			cacheIdentity: identity,
			canonicalAniListId: anilistId,
			rejectedProviderIds: [],
			title: "DOM Miss",
		});

		expect(deps.searchProviderCandidates).toHaveBeenCalledTimes(3);
		expect(setAutoResultMock).toHaveBeenCalledWith("sonarr", identity, {
			kind: "unmapped",
		});
	});

	it("filters rejected provider IDs before matching", async () => {
		const deps = createDeps();
		const anilistId = parseAniListId(211_496);
		const identity = anilistSource(anilistId);
		deps.searchProviderCandidates.mockResolvedValue([
			{ providerId: 450_000, title: "Kagurabachi", year: 2026 },
			{ providerId: 450_001, title: "Kagurabachi", year: 2026 },
		]);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await resolve({
			provider: "sonarr",
			cacheIdentity: identity,
			canonicalAniListId: anilistId,
			rejectedProviderIds: [450_000],
			title: "Kagurabachi",
		});

		expect(setAutoResultMock).toHaveBeenCalledWith("sonarr", identity, {
			kind: "mapped",
			providerId: 450_001,
			matchedTitle: "Kagurabachi",
		});
	});

	it("maps the real MAL 63816 hint identically for different cache identities", async () => {
		const identities = [
			{
				source: "mal",
				id: parseMyAnimeListId(63_816),
			} as const,
			anilistSource(parseAniListId(209_939)),
		];
		const searches: Array<Array<[string, string]>> = [];

		for (const cacheIdentity of identities) {
			const deps = createDeps();
			deps.searchProviderCandidates.mockResolvedValue([
				{
					providerId: 424_536,
					title: "Frieren: Beyond Journey's End",
					sortTitle: "frieren beyond journeys end",
					titleSlug: "frieren-beyond-journeys-end",
					alternateTitles: [],
					year: 2023,
					genres: ["Adventure", "Animation", "Anime", "Drama", "Fantasy"],
				},
			]);
			const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

			await expect(
				resolve({
					provider: "sonarr",
					cacheIdentity,
					canonicalAniListId: null,
					rejectedProviderIds: [],
					title: "Sousou no Frieren: Ougonkyou-hen",
					metadata: {
						titles: {
							romaji: "Sousou no Frieren: Ougonkyou-hen",
							english: "Frieren: Beyond Journey's End - Golden Land Arc",
							native: "葬送のフリーレン 黄金郷編",
						},
						synonyms: ["Frieren at the Funeral Season 3"],
					},
				}),
			).resolves.toBe(true);

			expect(deps.anilistMedia.fetchMediaWithRelations).not.toHaveBeenCalled();
			expect(deps.anilistMedia.iteratePrequelChain).not.toHaveBeenCalled();
			expect(setAutoResultMock).toHaveBeenLastCalledWith(
				"sonarr",
				cacheIdentity,
				{
					kind: "mapped",
					providerId: 424_536,
					matchedTitle: "Frieren: Beyond Journeys End",
				},
			);
			searches.push(
				deps.searchProviderCandidates.mock.calls.map(([provider, title]) => [
					provider,
					title,
				]),
			);
		}

		expect(searches[0]).toEqual(searches[1]);
		expect(searches[0]).toEqual([
			["sonarr", "Frieren: Beyond Journeys End - Golden Land Arc"],
			["sonarr", "Frieren: Beyond Journeys End"],
		]);
	});

	it("stores a MAL-only miss without fetching AniList relations", async () => {
		const deps = createDeps();
		const identity = {
			source: "mal",
			id: parseMyAnimeListId(63_816),
		} as const;
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await expect(
			resolve({
				provider: "radarr",
				cacheIdentity: identity,
				canonicalAniListId: null,
				rejectedProviderIds: [],
				title: "No Provider Match",
			}),
		).resolves.toBe(true);

		expect(deps.anilistMedia.fetchMediaWithRelations).not.toHaveBeenCalled();
		expect(deps.anilistMedia.iteratePrequelChain).not.toHaveBeenCalled();
		expect(setAutoResultMock).toHaveBeenCalledWith("radarr", identity, {
			kind: "unmapped",
		});
	});

	it("uses canonical metadata and prequel relations from explicit capabilities", async () => {
		const deps = createDeps();
		const anilistId = parseAniListId(211_496);
		const identity = anilistSource(anilistId);
		const media = {
			...createMedia({ id: anilistId, english: "Current Series" }),
			relations: { edges: [] },
		};
		const prequel = createMedia({
			id: parseAniListId(100),
			english: "Matching Prequel",
		});
		deps.anilistMedia.fetchMediaWithRelations.mockResolvedValue(media);
		deps.anilistMedia.iteratePrequelChain.mockImplementation(
			async function* () {
				yield prequel;
			},
		);
		deps.searchProviderCandidates.mockImplementation(
			async (_provider, title) =>
				title === "Matching Prequel"
					? [{ providerId: 450_002, title: "Matching Prequel", year: 2024 }]
					: [],
		);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await expect(
			resolve({
				provider: "sonarr",
				cacheIdentity: identity,
				canonicalAniListId: anilistId,
				rejectedProviderIds: [],
				title: "DOM Miss",
			}),
		).resolves.toBe(true);

		expect(deps.anilistMedia.fetchMediaWithRelations).toHaveBeenCalledWith(
			anilistId,
		);
		expect(deps.anilistMedia.iteratePrequelChain).toHaveBeenCalledWith(media);
		expect(setAutoResultMock).toHaveBeenCalledWith("sonarr", identity, {
			kind: "mapped",
			providerId: 450_002,
			matchedTitle: "Matching Prequel",
		});
	});

	it("uses relation IDs without sending the cache identity to AniList", async () => {
		const deps = createDeps();
		const identity = {
			source: "mal",
			id: parseMyAnimeListId(63_816),
		} as const;
		const prequelId = parseAniListId(52_991);
		deps.anilistMedia.fetchMediaWithRelations.mockResolvedValue(
			createMedia({ id: prequelId, english: "Matching Prequel" }),
		);
		deps.searchProviderCandidates.mockImplementation(
			async (_provider, title) =>
				title === "Matching Prequel"
					? [{ providerId: 450_003, title: "Matching Prequel", year: 2023 }]
					: [],
		);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await expect(
			resolve({
				provider: "sonarr",
				cacheIdentity: identity,
				canonicalAniListId: null,
				rejectedProviderIds: [],
				title: "Page Miss",
				metadata: { relationPrequelIds: [prequelId, -1] },
			}),
		).resolves.toBe(true);

		expect(deps.anilistMedia.fetchMediaWithRelations).toHaveBeenCalledOnce();
		expect(deps.anilistMedia.fetchMediaWithRelations).toHaveBeenCalledWith(
			prequelId,
		);
		expect(deps.anilistMedia.iteratePrequelChain).not.toHaveBeenCalled();
		expect(setAutoResultMock).toHaveBeenCalledWith("sonarr", identity, {
			kind: "mapped",
			providerId: 450_003,
			matchedTitle: "Matching Prequel",
		});
	});
});
