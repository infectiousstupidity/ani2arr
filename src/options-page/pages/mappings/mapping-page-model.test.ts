/** Tests for options mapping page grouping, filtering, and quick-action helpers. */
// src/options-page/pages/mappings/mapping-page-model.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist/types";
import { parseTvdbId } from "@/providers/schemas";
import type { MappingGroup, MappingRow } from "./mapping-page-model";
import {
	getFilteredMappingGroups,
	getMappingListModel,
	isMappingGroupExpanded,
	readTargetAniListIdFromHash,
} from "./mapping-page-model";

const aid = parseAniListId;
const tvdb = parseTvdbId;
const anilistSource = (anilistId: AniListId) =>
	({ source: "anilist", id: anilistId }) as const;

const createRow = (
	patch: Partial<MappingRow> & {
		anilistId: AniListId;
		provider: MappingRow["provider"];
	},
): MappingRow => {
	const { anilistId, provider, ...rest } = patch;
	return {
		source: anilistSource(anilistId),
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

	it("applies combined filters while preserving source-matched relationships", () => {
		const matching = createGroup({
			key: "sonarr:10",
			provider: "sonarr",
			providerId: tvdb(10),
			providerMeta: { title: "Combined target" },
			rows: [
				createRow({
					anilistId: aid(1),
					provider: "sonarr",
					providerId: tvdb(10),
					result: { kind: "mapped", source: "manual", providerId: tvdb(10) },
					mappingRowStatus: "can-add",
				}),
				createRow({
					anilistId: aid(2),
					provider: "sonarr",
					providerId: tvdb(10),
					result: { kind: "mapped", source: "auto", providerId: tvdb(10) },
					mappingRowStatus: "needs-review",
				}),
			],
		});
		const wrongProvider = createGroup({
			key: "radarr:20",
			provider: "radarr",
			providerId: tvdb(20),
			providerMeta: { title: "Combined target" },
			rows: [
				createRow({
					anilistId: aid(3),
					provider: "radarr",
					result: { kind: "mapped", source: "auto", providerId: tvdb(20) },
					mappingRowStatus: "needs-review",
				}),
			],
		});
		const sourceEmpty = createGroup({
			key: "sonarr:30",
			provider: "sonarr",
			providerId: tvdb(30),
			providerMeta: { title: "Combined target" },
			rows: [
				createRow({
					anilistId: aid(4),
					provider: "sonarr",
					result: { kind: "mapped", source: "manual", providerId: tvdb(30) },
					mappingRowStatus: "needs-review",
				}),
			],
		});
		const input = [matching, wrongProvider, sourceEmpty];

		const result = getFilteredMappingGroups({
			groups: input,
			provider: "sonarr",
			status: "needs-review",
			source: "auto",
			search: "  COMBINED  ",
			limit: 50,
		});

		expect(result.total).toBe(1);
		expect(result.groups).toHaveLength(1);
		expect(result.groups[0]?.rows.map((row) => row.anilistId)).toEqual([
			aid(2),
		]);
		expect(result.groups[0]?.linkedAniListIds).toEqual([aid(2)]);
		expect(matching.rows.map((row) => row.anilistId)).toEqual([aid(1), aid(2)]);
		expect(matching.linkedAniListIds).toEqual([aid(1), aid(2)]);
	});

	it("uses row status to admit groups without removing sibling rows", () => {
		const group = createGroup({
			key: "sonarr:10",
			provider: "sonarr",
			providerId: tvdb(10),
			rows: [
				createRow({
					anilistId: aid(1),
					provider: "sonarr",
					mappingRowStatus: "can-add",
				}),
				createRow({
					anilistId: aid(2),
					provider: "sonarr",
					mappingRowStatus: "needs-review",
				}),
			],
		});

		const result = getFilteredMappingGroups({
			groups: [group],
			provider: "all",
			status: "needs-review",
			source: "all",
			search: "",
			limit: 50,
		});

		expect(result.groups[0]).toBe(group);
		expect(result.groups[0]?.rows).toHaveLength(2);
	});

	it.each([
		["group title", "COWBOY BEBOP"],
		["group provider ID", "777"],
		["AniList ID", "42"],
		["row title", "ROW ALIAS"],
		["row provider ID", "888"],
	])("searches %s", (_field, search) => {
		const group = createGroup({
			key: "sonarr:777",
			provider: "sonarr",
			providerId: tvdb(777),
			providerMeta: { title: "Cowboy Bebop" },
			rows: [
				createRow({
					anilistId: aid(42),
					provider: "sonarr",
					providerId: tvdb(888),
					providerMeta: { title: "Row Alias" },
				}),
			],
		});

		expect(
			getFilteredMappingGroups({
				groups: [group],
				provider: "all",
				status: "all",
				source: "all",
				search,
				limit: 50,
			}).groups,
		).toEqual([group]);
	});

	it("returns total matching groups before applying the visible limit", () => {
		const groups = [10, 20, 30].map((providerId) =>
			createGroup({
				key: `sonarr:${providerId}`,
				provider: "sonarr",
				providerId: tvdb(providerId),
				rows: [
					createRow({
						anilistId: aid(providerId),
						provider: "sonarr",
					}),
				],
			}),
		);
		const input = {
			groups,
			provider: "all" as const,
			status: "all" as const,
			source: "all" as const,
			search: "",
		};

		const limited = getFilteredMappingGroups({ ...input, limit: 2 });
		const expanded = getFilteredMappingGroups({ ...input, limit: 50 });

		expect(limited.total).toBe(3);
		expect(limited.groups.map((group) => group.key)).toEqual([
			"sonarr:10",
			"sonarr:20",
		]);
		expect(expanded.groups).toEqual(groups);
	});

});
