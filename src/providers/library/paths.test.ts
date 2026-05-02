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
	it("derives comparable paths for provider move decisions", () => {
		const separator = String.fromCodePoint(92);
		expect(
			normalizePathForCompare(["C:", "Media", "Series", ""].join(separator)),
		).toBe("c:/media/series");
		expect(
			joinRootAndSlug(["C:", "Media", "Series", ""].join(separator), "Show"),
		).toBe(["C:", "Media", "Series", "Show"].join(separator));

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
