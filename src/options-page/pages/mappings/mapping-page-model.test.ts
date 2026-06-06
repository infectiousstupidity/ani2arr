/** Tests for options mapping page grouping, filtering, and quick-action helpers. */
// src/options-page/pages/mappings/mapping-page-model.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist/types";
import { parseTvdbId } from "@/providers/schemas";
import type { MappingGroup, MappingRow } from "./mapping-page-model";
import {
	getMappingListModel,
	getMappingsInput,
	isMappingGroupExpanded,
	readTargetAniListIdFromHash,
} from "./mapping-page-model";

const aid = parseAniListId;
const tvdb = parseTvdbId;

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
		result: { kind: "unmapped", hadResolveAttempt: false },
		isInLibrary: null,
		mappingRowStatus: "unmapped",
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
		isInLibrary: null,
		...rest,
	};
};

describe("mapping page model", () => {
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

		expect(
			isMappingGroupExpanded(group, new Set(["sonarr:10"]), aid(2)),
		).toBe(true);
	});

	it("flattens loaded groups and only requests metadata for visible rows", () => {
		const expanded = createGroup({
			key: "sonarr:10",
			provider: "sonarr",
			providerId: tvdb(10),
			rows: [
				createRow({ anilistId: aid(1), provider: "sonarr" }),
				createRow({ anilistId: aid(2), provider: "sonarr" }),
			],
		});
		const collapsed = createGroup({
			key: "sonarr:20",
			provider: "sonarr",
			providerId: tvdb(20),
			rows: [createRow({ anilistId: aid(3), provider: "sonarr" })],
		});

		const result = getMappingListModel({
			groups: [expanded, collapsed],
			collapsedGroupKeys: new Set(["sonarr:20"]),
			highlightedAniListId: null,
		});

		expect(result.items.map((item) => item.kind)).toEqual([
			"group",
			"row",
			"row",
			"group",
		]);
		expect(
			result.items.map((item) =>
				item.kind === "row" ? item.parentProviderId : null,
			),
		).toEqual([null, tvdb(10), tvdb(10), null]);
		expect(result.loadedRowCount).toBe(3);
		expect(result.visibleAniListIds).toEqual([aid(1), aid(2)]);
	});

	it("reads target AniList ID from options-page hash query", () => {
		expect(readTargetAniListIdFromHash("#mappings?anilistId=123")).toBe(
			aid(123),
		);
		expect(readTargetAniListIdFromHash("#mappings")).toBeNull();
		expect(readTargetAniListIdFromHash("#mappings?anilistId=bad")).toBeNull();
	});

	it("builds mapping query input from active filters", () => {
		expect(
			getMappingsInput({
				provider: "sonarr",
				status: "can-add",
				source: "auto",
				search: "  123  ",
				limit: 50,
			}),
		).toEqual({
			limit: 50,
			providers: ["sonarr"],
			statuses: ["can-add"],
			source: "auto",
			query: "123",
		});
		expect(
			getMappingsInput({
				provider: "all",
				status: "all",
				source: "all",
				search: "  ",
				limit: 50,
			}),
		).toEqual({
			limit: 50,
		});
	});
});
