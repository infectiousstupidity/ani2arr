/** Tests for provider library path and slug helpers. */
// src/providers/library/paths.test.ts

import { describe, expect, it } from "vitest";
import { parseTvdbId } from "@/providers";
import {
	buildProviderFolderSlugFromTitle,
	extractProviderRootFolderPath,
	getProviderRouteSlug,
	joinRootAndSlug,
	normalizePathForCompare,
} from "./paths";

const tvdb = parseTvdbId;

describe("provider library path helpers", () => {
	it("normalizes path strings for comparison", () => {
		const separator = String.fromCodePoint(92);
		expect(
			normalizePathForCompare(["C:", "Media", "Series", ""].join(separator)),
		).toBe("c:/media/series");
		expect(normalizePathForCompare("/mnt/media/series/")).toBe(
			"/mnt/media/series",
		);
	});

	it("joins roots and slugs without changing the existing separator style", () => {
		const separator = String.fromCodePoint(92);
		expect(
			joinRootAndSlug(["C:", "Media", "Series", ""].join(separator), "Show"),
		).toBe(["C:", "Media", "Series", "Show"].join(separator));
		expect(joinRootAndSlug("/mnt/media/series/", "Show")).toBe(
			"/mnt/media/series/Show",
		);
	});

	it("prefers path metadata over title fallbacks when deriving slugs and roots", () => {
		expect(
			getProviderRouteSlug("sonarr", {
				path: "/library/Series/Season 1",
				rootFolderPath: "/library",
			}),
		).toBe("Series/Season 1");

		expect(
			extractProviderRootFolderPath(
				{ path: "/library/Series/Season 1" },
				"Series/Season 1",
			),
		).toBe("/library");
		expect(
			buildProviderFolderSlugFromTitle("My Show", { tvdbId: tvdb(123) }),
		).toBe("My Show [tvdb-123]");
	});
});
