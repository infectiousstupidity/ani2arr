/** Tests for automatic mapping resolver provider-first behavior. */
// src/mapping/resolve/resolve.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	parseAniListId,
	type AniListId,
	type AniListMedia,
} from "@/anilist/types";
import { createAutomaticResolver } from "./resolve";

const setAutoResultMock = vi.hoisted(() => vi.fn());
type ResolverDeps = Parameters<typeof createAutomaticResolver>[0];

vi.mock("../auto.store", () => ({
	setAutoResult: setAutoResultMock,
}));

function createDeps() {
	return {
		anilistMedia: {
			fetchMediaWithRelations: vi.fn(),
			iteratePrequelChain: vi.fn(async function* () {}),
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
		deps.searchProviderCandidates.mockResolvedValue([
			{ providerId: 450_000, title: "Kagurabachi", year: 2026 },
		]);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await expect(
			resolve("sonarr", anilistId, [], {
				title: "Kagurabachi",
			}),
		).resolves.toBe(true);

		expect(deps.searchProviderCandidates).toHaveBeenCalledWith(
			"sonarr",
			"Kagurabachi",
		);
		expect(deps.anilistMedia.fetchMediaWithRelations).not.toHaveBeenCalled();
		expect(setAutoResultMock).toHaveBeenCalledWith(
			"sonarr",
			anilistId,
			{
				kind: "mapped",
				providerId: 450_000,
				matchedTitle: "Kagurabachi",
			},
		);
	});

	it("does not cache unmapped when AniList fallback fails", async () => {
		const deps = createDeps();
		const anilistId = parseAniListId(211_496);
		deps.anilistMedia.fetchMediaWithRelations.mockRejectedValue(
			new Error("AniList rate limit exceeded"),
		);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await expect(
			resolve("sonarr", anilistId, [], {
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

		await resolve("sonarr", anilistId, [], {
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
		expect(setAutoResultMock).toHaveBeenCalledWith(
			"sonarr",
			anilistId,
			{
				kind: "mapped",
				providerId: 450_000,
				matchedTitle: "Kagurabachi",
			},
		);
	});

	it("does not repeat the DOM title during AniList fallback", async () => {
		const deps = createDeps();
		const anilistId = parseAniListId(211_496);
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

		await resolve("sonarr", anilistId, [], {
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
		expect(setAutoResultMock).toHaveBeenCalledWith(
			"sonarr",
			anilistId,
			{
				kind: "mapped",
				providerId: 450_001,
				matchedTitle: "Next Title",
			},
		);
	});

	it("stores unmapped after DOM and AniList fallback miss", async () => {
		const deps = createDeps();
		const anilistId = parseAniListId(211_496);
		deps.anilistMedia.fetchMediaWithRelations.mockResolvedValue(
			createMedia({
				id: anilistId,
				english: "Kagurabachi",
				romaji: "Kagurabachi Romaji",
			}),
		);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await resolve("sonarr", anilistId, [], {
			title: "DOM Miss",
		});

		expect(deps.searchProviderCandidates).toHaveBeenCalledTimes(3);
		expect(setAutoResultMock).toHaveBeenCalledWith(
			"sonarr",
			anilistId,
			{
				kind: "unmapped",
			},
		);
	});

	it("filters rejected provider IDs before matching", async () => {
		const deps = createDeps();
		const anilistId = parseAniListId(211_496);
		deps.searchProviderCandidates.mockResolvedValue([
			{ providerId: 450_000, title: "Kagurabachi", year: 2026 },
			{ providerId: 450_001, title: "Kagurabachi", year: 2026 },
		]);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await resolve("sonarr", anilistId, [450_000], {
			title: "Kagurabachi",
		});

		expect(setAutoResultMock).toHaveBeenCalledWith(
			"sonarr",
			anilistId,
			{
				kind: "mapped",
				providerId: 450_001,
				matchedTitle: "Kagurabachi",
			},
		);
	});
});
