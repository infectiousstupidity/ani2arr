/** Tests for automatic mapping resolver provider-first behavior. */
// src/mapping/resolve/resolve.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type AniListId,
	type AniListMedia,
	parseAniListId,
} from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { captureAutomaticWriteToken } from "../auto.store";
import { createAutomaticResolver } from "./resolve";

const setAutoResultMock = vi.hoisted(() => vi.fn());
type ResolverDeps = Parameters<typeof createAutomaticResolver>[0];
type ResolveRequest = Parameters<ReturnType<typeof createAutomaticResolver>>[0];

const defaultAniListId = parseAniListId(211_496);
const anilistSource = (id: AniListId) => ({ source: "anilist", id }) as const;
const defaultIdentity = anilistSource(defaultAniListId);
const malIdentity = {
	source: "mal",
	id: parseMyAnimeListId(63_816),
} as const;

vi.mock("../auto.store", () => ({
	captureAutomaticWriteToken: vi.fn(() => 0),
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
		loadMyAnimeListMetadata: vi
			.fn<ResolverDeps["loadMyAnimeListMetadata"]>()
			.mockResolvedValue(null),
		searchProviderCandidates: vi
			.fn<ResolverDeps["searchProviderCandidates"]>()
			.mockResolvedValue([]),
	};
}

function setup(defaults: Partial<ResolveRequest> = {}) {
	const deps = createDeps();
	const identity = defaults.identity ?? defaultIdentity;
	const request: ResolveRequest = {
		writeToken: defaults.writeToken ?? captureAutomaticWriteToken(),
		provider: defaults.provider ?? "sonarr",
		identity,
		anilistId:
			defaults.anilistId === undefined
				? (identity.source === "anilist"
					? identity.id
					: null)
				: defaults.anilistId,
		rejectedProviderIds: defaults.rejectedProviderIds ?? [],
		...(defaults.title === undefined ? {} : { title: defaults.title }),
		...(defaults.metadata === undefined ? {} : { metadata: defaults.metadata }),
	};
	const resolver = createAutomaticResolver(deps as unknown as ResolverDeps);

	return {
		deps,
		identity: request.identity,
		anilistId: request.anilistId,
		resolve: (overrides: Partial<ResolveRequest> = {}) =>
			resolver({ ...request, ...overrides }),
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
		setAutoResultMock.mockResolvedValue(true);
	});

	it("maps from title lookup before fetching AniList media", async () => {
		const { deps, identity, resolve } = setup({ title: "Kagurabachi" });
		deps.searchProviderCandidates.mockResolvedValue([
			{ providerId: 450_000, title: "Kagurabachi", year: 2026 },
		]);

		await expect(resolve()).resolves.toBe(true);

		expect(deps.searchProviderCandidates).toHaveBeenCalledWith(
			"sonarr",
			"Kagurabachi",
		);
		expect(deps.anilistMedia.fetchMediaWithRelations).not.toHaveBeenCalled();
		expect(setAutoResultMock).toHaveBeenCalledWith(0, "sonarr", identity, {
			kind: "mapped",
			providerId: 450_000,
			matchedTitle: "Kagurabachi",
		});
	});

	it("keeps a distinct page title and metadata title in the same search", async () => {
		const { deps, resolve } = setup({
			identity: malIdentity,
			title: "Page Match",
			metadata: { titles: { romaji: "Metadata Miss" } },
		});
		deps.searchProviderCandidates.mockImplementation(
			async (_provider, title) =>
				title === "Page Match"
					? [{ providerId: 450_010, title: "Page Match", year: 2026 }]
					: [],
		);

		await resolve();

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

	it("reports a guarded store rejection", async () => {
		const { deps, resolve } = setup({ title: "Kagurabachi" });
		deps.searchProviderCandidates.mockResolvedValue([
			{ providerId: 450_000, title: "Kagurabachi", year: 2026 },
		]);
		setAutoResultMock.mockResolvedValue(false);

		await expect(resolve()).resolves.toBe(false);
	});

	it("does not cache unmapped when AniList fallback fails", async () => {
		const { deps, anilistId, resolve } = setup({ title: "Kagurabachi" });
		deps.anilistMedia.fetchMediaWithRelations.mockRejectedValue(
			new Error("AniList rate limit exceeded"),
		);

		await expect(resolve()).resolves.toBe(false);

		expect(deps.anilistMedia.fetchMediaWithRelations).toHaveBeenCalledWith(
			anilistId,
		);
		expect(setAutoResultMock).not.toHaveBeenCalled();
	});

	it("falls back to AniList without repeating the page title", async () => {
		const { deps, identity, anilistId, resolve } = setup({
			title: "Same Title",
		});
		deps.searchProviderCandidates.mockImplementation(
			async (_provider, title) =>
				title === "Next Title"
					? [{ providerId: 450_001, title: "Next Title", year: 2026 }]
					: [],
		);
		deps.anilistMedia.fetchMediaWithRelations.mockResolvedValue(
			createMedia({
				id: defaultAniListId,
				english: "Same Title",
				romaji: "Next Title",
			}),
		);

		await expect(resolve()).resolves.toBe(true);

		expect(deps.searchProviderCandidates).toHaveBeenNthCalledWith(
			1,
			"sonarr",
			"Same Title",
		);
		expect(deps.anilistMedia.fetchMediaWithRelations).toHaveBeenCalledWith(
			anilistId,
		);
		expect(deps.searchProviderCandidates).toHaveBeenNthCalledWith(
			2,
			"sonarr",
			"Next Title",
		);
		expect(deps.searchProviderCandidates).toHaveBeenCalledTimes(2);
		expect(setAutoResultMock).toHaveBeenCalledWith(0, "sonarr", identity, {
			kind: "mapped",
			providerId: 450_001,
			matchedTitle: "Next Title",
		});
	});

	it("stores unmapped after page and AniList fallback miss", async () => {
		const { deps, identity, resolve } = setup({ title: "Page Miss" });
		deps.anilistMedia.fetchMediaWithRelations.mockResolvedValue(
			createMedia({
				id: defaultAniListId,
				english: "Kagurabachi",
				romaji: "Kagurabachi Romaji",
			}),
		);

		await resolve();

		expect(deps.searchProviderCandidates).toHaveBeenCalledTimes(3);
		expect(setAutoResultMock).toHaveBeenCalledWith(0, "sonarr", identity, {
			kind: "unmapped",
		});
	});

	it("filters rejected provider IDs before matching", async () => {
		const { deps, identity, resolve } = setup({
			title: "Kagurabachi",
			rejectedProviderIds: [450_000],
		});
		deps.searchProviderCandidates.mockResolvedValue([
			{ providerId: 450_000, title: "Kagurabachi", year: 2026 },
			{ providerId: 450_001, title: "Kagurabachi", year: 2026 },
		]);

		await resolve();

		expect(setAutoResultMock).toHaveBeenCalledWith(0, "sonarr", identity, {
			kind: "mapped",
			providerId: 450_001,
			matchedTitle: "Kagurabachi",
		});
	});

	it("maps the real MAL 63816 title hint after removing the arc suffix", async () => {
		const { deps, identity, resolve } = setup({
			identity: malIdentity,
			metadata: {
				titles: {
					english: "Frieren: Beyond Journey's End - Golden Land Arc",
				},
			},
		});
		deps.searchProviderCandidates.mockResolvedValue([
			{
				providerId: 424_536,
				title: "Frieren: Beyond Journey's End",
				year: 2023,
			},
		]);

		await expect(resolve()).resolves.toBe(true);

		expect(deps.searchProviderCandidates.mock.calls).toEqual([
			["sonarr", "Frieren: Beyond Journeys End - Golden Land Arc"],
			["sonarr", "Frieren: Beyond Journeys End"],
		]);
		expect(deps.loadMyAnimeListMetadata).not.toHaveBeenCalled();
		expect(deps.anilistMedia.fetchMediaWithRelations).not.toHaveBeenCalled();
		expect(setAutoResultMock).toHaveBeenCalledWith(0, "sonarr", identity, {
			kind: "mapped",
			providerId: 424_536,
			matchedTitle: "Frieren: Beyond Journeys End",
		});
	});

	it("uses MAL metadata after the page hint misses without an AniList ID", async () => {
		const { deps, identity, resolve } = setup({
			identity: malIdentity,
			title: "Page Miss",
		});
		deps.loadMyAnimeListMetadata.mockResolvedValue({
			titles: { english: "Jikan Match" },
			synonyms: ["Jikan Alias"],
			startYear: 2026,
			format: "TV",
		});
		deps.searchProviderCandidates.mockImplementation(
			async (_provider, title) =>
				title === "Jikan Match"
					? [{ providerId: 450_020, title: "Jikan Match", year: 2026 }]
					: [],
		);

		await expect(resolve()).resolves.toBe(true);

		expect(deps.searchProviderCandidates).toHaveBeenNthCalledWith(
			1,
			"sonarr",
			"Page Miss",
		);
		expect(deps.loadMyAnimeListMetadata).toHaveBeenCalledWith(identity.id);
		expect(deps.searchProviderCandidates).toHaveBeenNthCalledWith(
			2,
			"sonarr",
			"Jikan Match",
		);
		expect(deps.anilistMedia.fetchMediaWithRelations).not.toHaveBeenCalled();
		expect(deps.anilistMedia.iteratePrequelChain).not.toHaveBeenCalled();
		expect(setAutoResultMock).toHaveBeenCalledWith(0, "sonarr", identity, {
			kind: "mapped",
			providerId: 450_020,
			matchedTitle: "Jikan Match",
		});
	});

	it("uses canonical prequel relations only for Sonarr", async () => {
		const { deps, identity, resolve } = setup({ title: "Page Miss" });
		const media = {
			...createMedia({
				id: defaultAniListId,
				english: "Current Series",
			}),
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

		await expect(resolve()).resolves.toBe(true);

		expect(deps.anilistMedia.iteratePrequelChain).toHaveBeenCalledWith(media);
		expect(setAutoResultMock).toHaveBeenLastCalledWith(0, "sonarr", identity, {
			kind: "mapped",
			providerId: 450_002,
			matchedTitle: "Matching Prequel",
		});

		deps.anilistMedia.iteratePrequelChain.mockClear();
		setAutoResultMock.mockClear();

		await expect(resolve({ provider: "radarr" })).resolves.toBe(true);

		expect(deps.anilistMedia.iteratePrequelChain).not.toHaveBeenCalled();
		expect(setAutoResultMock).toHaveBeenCalledWith(0, "radarr", identity, {
			kind: "unmapped",
		});
	});

	it("uses relation IDs without sending the source identity to AniList", async () => {
		const prequelId = parseAniListId(52_991);
		const { deps, identity, resolve } = setup({
			identity: malIdentity,
			title: "Page Miss",
			metadata: { relationPrequelIds: [prequelId, -1] },
		});
		deps.anilistMedia.fetchMediaWithRelations.mockResolvedValue(
			createMedia({ id: prequelId, english: "Matching Prequel" }),
		);
		deps.searchProviderCandidates.mockImplementation(
			async (_provider, title) =>
				title === "Matching Prequel"
					? [{ providerId: 450_003, title: "Matching Prequel", year: 2023 }]
					: [],
		);

		await expect(resolve()).resolves.toBe(true);

		expect(deps.anilistMedia.fetchMediaWithRelations).toHaveBeenCalledOnce();
		expect(deps.anilistMedia.fetchMediaWithRelations).toHaveBeenCalledWith(
			prequelId,
		);
		expect(deps.anilistMedia.iteratePrequelChain).not.toHaveBeenCalled();
		expect(setAutoResultMock).toHaveBeenCalledWith(0, "sonarr", identity, {
			kind: "mapped",
			providerId: 450_003,
			matchedTitle: "Matching Prequel",
		});
	});
});
