/** Tests for browse-card provider resolution inputs. */
// src/content/browse/browse-card-overlay.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import type { MappingIdentity } from "@/rpc/types";
import type { HostMediaTarget } from "./types";
import { resolveBrowseCardProvider } from "./browse-card-provider";

const mountTarget = {} as HTMLElement;

function createTarget(format: HostMediaTarget["format"]): HostMediaTarget {
	return {
		anilistId: parseAniListId(210_031),
		title: "Example",
		format,
		mountTarget,
	};
}

describe("resolveBrowseCardProvider", () => {
	it("uses metadata format when host card format is unknown", () => {
		expect(
			resolveBrowseCardProvider({
				parsed: createTarget(null),
				metadata: {
					titles: null,
					synonyms: null,
					startYear: null,
					format: "TV",
					relationPrequelIds: null,
					coverImage: null,
				},
				mappedIdentities: [],
			}),
		).toBe("sonarr");
	});

	it("uses mapped identity when both host and metadata formats are unknown", () => {
		const mappedIdentities: MappingIdentity[] = [
			{
				anilistId: parseAniListId(210_031),
				provider: "sonarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: 123,
				},
			},
		];

		expect(
			resolveBrowseCardProvider({
				parsed: createTarget(null),
				metadata: null,
				mappedIdentities,
			}),
		).toBe("sonarr");
	});
});
