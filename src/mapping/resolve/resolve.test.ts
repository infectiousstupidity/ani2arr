/** Tests for automatic mapping resolver provider-first behavior. */
// src/mapping/resolve/resolve.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	parseAniListId,
	type AniListId,
	type AniListMedia,
} from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import type { SourceIdentity } from "@/mapping/source-identity";
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
		sonarr: {
			lookupSeries: vi.fn(),
		},
		radarr: {
			lookupMovies: vi.fn(),
		},
		getUniqueAniListIdForSource:
			undefined as ResolverDeps["getUniqueAniListIdForSource"],
		getCredentials: vi.fn(async () => ({
			url: "https://provider.example",
			apiKey: "secret",
		})),
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

function anilistSource(id: AniListId): SourceIdentity {
	return { source: "anilist", id };
}

describe("createAutomaticResolver", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("maps from title lookup before fetching AniList media", async () => {
		const deps = createDeps();
		const anilistId = parseAniListId(211_496);
		deps.sonarr.lookupSeries.mockResolvedValue([
			{ tvdbId: 450_000, title: "Kagurabachi", year: 2026 },
		]);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await resolve("sonarr", anilistSource(anilistId), [], {
			title: "Kagurabachi",
		});

		expect(deps.sonarr.lookupSeries).toHaveBeenCalledWith(
			"Kagurabachi",
			expect.any(Object),
		);
		expect(deps.anilistMedia.fetchMediaWithRelations).not.toHaveBeenCalled();
		expect(setAutoResultMock).toHaveBeenCalledWith(
			"sonarr",
			anilistSource(anilistId),
			{
				kind: "mapped",
				providerId: 450_000,
				matchedTitle: "Kagurabachi",
			},
		);
	});

	it("maps MAL sources from title lookup without AniList fallback", async () => {
		const deps = createDeps();
		const malSource = { source: "mal", id: parseMyAnimeListId(5114) } as const;
		deps.getUniqueAniListIdForSource = vi.fn(async () => null);
		deps.sonarr.lookupSeries.mockResolvedValue([
			{ tvdbId: 78_874, title: "Fullmetal Alchemist: Brotherhood", year: 2009 },
		]);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await resolve("sonarr", malSource, [], {
			title: "Fullmetal Alchemist: Brotherhood",
		});

		expect(deps.anilistMedia.fetchMediaWithRelations).not.toHaveBeenCalled();
		expect(deps.getUniqueAniListIdForSource).not.toHaveBeenCalled();
		expect(setAutoResultMock).toHaveBeenCalledWith("sonarr", malSource, {
			kind: "mapped",
			providerId: 78_874,
			matchedTitle: "Fullmetal Alchemist: Brotherhood",
		});
	});

	it("stores unmapped for MAL sources without a unique AniList crosswalk", async () => {
		const deps = createDeps();
		const malSource = { source: "mal", id: parseMyAnimeListId(5114) } as const;
		deps.getUniqueAniListIdForSource = vi.fn(async () => null);
		deps.sonarr.lookupSeries.mockResolvedValue([]);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await resolve("sonarr", malSource, [], {
			title: "Unknown",
		});

		expect(deps.getUniqueAniListIdForSource).toHaveBeenCalledWith(malSource);
		expect(deps.anilistMedia.fetchMediaWithRelations).not.toHaveBeenCalled();
		expect(setAutoResultMock).toHaveBeenCalledWith("sonarr", malSource, {
			kind: "unmapped",
		});
	});

	it("does not cache unmapped when AniList fallback fails", async () => {
		const deps = createDeps();
		const anilistId = parseAniListId(211_496);
		deps.sonarr.lookupSeries.mockResolvedValue([]);
		deps.anilistMedia.fetchMediaWithRelations.mockRejectedValue(
			new Error("AniList rate limit exceeded"),
		);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await expect(
			resolve("sonarr", anilistSource(anilistId), [], {
				title: "Kagurabachi",
			}),
		).resolves.toBeUndefined();

		expect(deps.anilistMedia.fetchMediaWithRelations).toHaveBeenCalledWith(
			anilistId,
		);
		expect(setAutoResultMock).not.toHaveBeenCalled();
	});

	it("falls back to AniList only after the DOM title misses", async () => {
		const deps = createDeps();
		const anilistId = parseAniListId(211_496);
		deps.sonarr.lookupSeries.mockImplementation(async (title: string) =>
			title === "Kagurabachi"
				? [{ tvdbId: 450_000, title: "Kagurabachi", year: 2026 }]
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

		await resolve("sonarr", anilistSource(anilistId), [], {
			title: "DOM Miss",
		});

		expect(deps.sonarr.lookupSeries).toHaveBeenNthCalledWith(
			1,
			"DOM Miss",
			expect.any(Object),
		);
		expect(deps.anilistMedia.fetchMediaWithRelations).toHaveBeenCalledWith(
			anilistId,
		);
		expect(deps.sonarr.lookupSeries).toHaveBeenNthCalledWith(
			2,
			"Kagurabachi",
			expect.any(Object),
		);
		expect(deps.sonarr.lookupSeries).toHaveBeenCalledTimes(2);
		expect(setAutoResultMock).toHaveBeenCalledWith(
			"sonarr",
			anilistSource(anilistId),
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
		deps.sonarr.lookupSeries.mockImplementation(async (title: string) =>
			title === "Next Title"
				? [{ tvdbId: 450_001, title: "Next Title", year: 2026 }]
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

		await resolve("sonarr", anilistSource(anilistId), [], {
			title: "Same Title",
		});

		expect(deps.sonarr.lookupSeries).toHaveBeenCalledTimes(2);
		expect(deps.sonarr.lookupSeries).toHaveBeenNthCalledWith(
			1,
			"Same Title",
			expect.any(Object),
		);
		expect(deps.sonarr.lookupSeries).toHaveBeenNthCalledWith(
			2,
			"Next Title",
			expect.any(Object),
		);
		expect(setAutoResultMock).toHaveBeenCalledWith(
			"sonarr",
			anilistSource(anilistId),
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
		deps.sonarr.lookupSeries.mockResolvedValue([]);
		deps.anilistMedia.fetchMediaWithRelations.mockResolvedValue(
			createMedia({
				id: anilistId,
				english: "Kagurabachi",
				romaji: "Kagurabachi Romaji",
			}),
		);
		const resolve = createAutomaticResolver(deps as unknown as ResolverDeps);

		await resolve("sonarr", anilistSource(anilistId), [], {
			title: "DOM Miss",
		});

		expect(deps.sonarr.lookupSeries).toHaveBeenCalledTimes(3);
		expect(setAutoResultMock).toHaveBeenCalledWith(
			"sonarr",
			anilistSource(anilistId),
			{
				kind: "unmapped",
			},
		);
	});
});
