/** Tests for mapping-list provider library status composition. */
// src/providers/mappings-library-status.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import type { MappingList } from "@/mapping/list-mappings";
import { parseTvdbId } from "@/providers/schemas";
import type { SonarrSeriesId } from "@/providers/schemas";
import {
	composeSonarrMappingsLibraryStatus,
} from "./mappings-library-status";
import type { SonarrSeriesSnapshot } from "./sonarr/types";

const aid = parseAniListId;
const tvdb = parseTvdbId;
const sonarrSeriesId = (value: number): SonarrSeriesId =>
	value as SonarrSeriesId;

function series(tvdbId: number): SonarrSeriesSnapshot {
	return {
		id: sonarrSeriesId(tvdbId),
		tvdbId: tvdb(tvdbId),
		title: `Series ${tvdbId}`,
		titleSlug: `series-${tvdbId}`,
	};
}

describe("composeSonarrMappingsLibraryStatus", () => {
	it("marks mapped and ambiguous entries from provider ID lookup", () => {
		const mappings: MappingList = {
			provider: "sonarr",
			mapped: [
				{
					providerId: tvdb(100),
					entries: [
						{
							anilistId: aid(1),
							result: {
								kind: "mapped",
								source: "manual",
								providerId: tvdb(100),
							},
						},
					],
				},
			],
			ignored: [],
			ambiguous: [
				{
					anilistId: aid(2),
					result: {
						kind: "ambiguous",
						targets: [
							{ provider: "sonarr", providerId: tvdb(200) },
							{ provider: "sonarr", providerId: tvdb(201) },
						],
					},
				},
			],
			unmapped: [],
		};

		const result = composeSonarrMappingsLibraryStatus(mappings, [
			series(100),
			series(200),
		]);

		expect(result.mapped[0]).toMatchObject({
			isInLibrary: true,
			libraryItem: { tvdbId: tvdb(100) },
		});
		expect(result.ambiguous[0]?.activeTarget).toMatchObject({
			providerId: tvdb(200),
			isInLibrary: true,
		});
	});
});
