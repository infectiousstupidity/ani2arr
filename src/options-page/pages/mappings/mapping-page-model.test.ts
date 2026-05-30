/** Tests for options mapping page grouping, filtering, and quick-action helpers. */
// src/options-page/pages/mappings/mapping-page-model.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist";
import {
	parseTmdbId,
	parseTvdbId,
} from "@/providers";
import type { MappingGroup, MappingRow } from "./mapping-page-model";
import {
	flattenMappingGroupsForVirtualList,
	getClearMatchAction,
	readTargetAniListIdFromHash,
} from "./mapping-page-model";

const aid = parseAniListId;
const tvdb = parseTvdbId;
const tmdb = parseTmdbId;

const createRow = (
	patch: Partial<MappingRow> & {
		anilistId: AniListId;
		provider: MappingRow["provider"];
	},
): MappingRow => {
	const { anilistId, provider, ...rest } = patch;
	return {
		anilistId,
		provider,
		providerId: null,
		providerMappingState: "unmapped",
		isInLibrary: null,
		mappingRowStatus: "unmapped",
		mappingEntryKind: "unmapped",
		...rest,
	};
};

const createGroup = (
	patch: Partial<MappingGroup> & {
		key: string;
		provider: MappingGroup["provider"];
		providerId: MappingGroup["providerId"];
		rows: MappingRow[];
	},
): MappingGroup => {
	const {
		key,
		provider,
		providerId,
		rows,
		linkedAniListIds: linkedAniListIdsPatch,
		...rest
	} = patch;
	const linkedAniListIds =
		linkedAniListIdsPatch ?? rows.map((row) => row.anilistId);
	return {
		key,
		provider,
		providerId,
		rows,
		linkedAniListIds,
		linkedCount: linkedAniListIds.length,
		isInLibrary: null,
		...rest,
	};
};

describe("mapping page model", () => {
	it("flattens expanded groups into virtual headers and rows", () => {
		const collapsedGroup = createGroup({
			key: "sonarr:10",
			provider: "sonarr",
			providerId: tvdb(10),
			rows: [
				createRow({ anilistId: aid(1), provider: "sonarr" }),
				createRow({ anilistId: aid(2), provider: "sonarr" }),
			],
		});
		const expandedGroup = createGroup({
			key: "radarr:20",
			provider: "radarr",
			providerId: tmdb(20),
			rows: [createRow({ anilistId: aid(3), provider: "radarr" })],
		});

		const items = flattenMappingGroupsForVirtualList({
			groups: [collapsedGroup, expandedGroup],
			collapsedGroupKeys: new Set(["sonarr:10"]),
			highlightedAniListId: null,
		});

		expect(items.map((item) => item.key)).toEqual([
			"group:sonarr:10",
			"group:radarr:20",
			"row:radarr:20:radarr:3",
		]);
	});

	it("keeps highlighted collapsed groups expanded", () => {
		const group = createGroup({
			key: "sonarr:10",
			provider: "sonarr",
			providerId: tvdb(10),
			rows: [
				createRow({ anilistId: aid(1), provider: "sonarr" }),
				createRow({ anilistId: aid(2), provider: "sonarr" }),
			],
		});

		const items = flattenMappingGroupsForVirtualList({
			groups: [group],
			collapsedGroupKeys: new Set(["sonarr:10"]),
			highlightedAniListId: aid(2),
		});

		expect(items).toHaveLength(3);
	});

	it("resolves clear-match actions only for persistent user-owned decisions", () => {
		const manual = createRow({
			anilistId: aid(1),
			provider: "sonarr",
			providerId: tvdb(100),
			mappingEntryKind: "manual",
			providerMappingState: "mapped",
		});
		const auto = createRow({
			anilistId: aid(2),
			provider: "sonarr",
			providerId: tvdb(200),
			mappingEntryKind: "auto",
			providerMappingState: "mapped",
		});
		const rejected = createRow({
			anilistId: aid(3),
			provider: "radarr",
			mappingEntryKind: "rejected",
			suppressedProviderId: tmdb(300),
		});
		const upstream = createRow({
			anilistId: aid(4),
			provider: "radarr",
			providerId: tmdb(400),
			mappingEntryKind: "upstream",
			providerMappingState: "mapped",
		});

		expect(getClearMatchAction(manual)).toMatchObject({
			kind: "clear-manual",
			anilistId: aid(1),
		});
		expect(getClearMatchAction(auto)).toMatchObject({
			kind: "reject-candidate",
			providerId: tvdb(200),
		});
		expect(getClearMatchAction(rejected)).toMatchObject({
			kind: "clear-rejected",
			providerId: tmdb(300),
		});
		expect(getClearMatchAction(upstream)).toBeNull();
	});

	it("reads target AniList ID from options-page hash query", () => {
		expect(readTargetAniListIdFromHash("#mappings?anilistId=123")).toBe(
			aid(123),
		);
		expect(readTargetAniListIdFromHash("#mappings")).toBeNull();
		expect(readTargetAniListIdFromHash("#mappings?anilistId=bad")).toBeNull();
	});
});
