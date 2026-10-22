/** Tests for low-level provider path math helpers. */
import { describe, expect, it } from "vitest";
import {
	extractPathLeaf,
	extractRelativeFolder,
	joinRootAndFolder,
	normalizePathForCompare,
	shouldMoveProviderFiles,
} from "./provider-media-paths";

describe("provider library path helpers", () => {
	it("normalizes paths for comparison", () => {
		const separator = String.fromCodePoint(92);

		expect(normalizePathForCompare(`/Root/Path/Anime/`)).toBe(
			"/root/path/anime",
		);
		expect(
			normalizePathForCompare(["Root", "Path", "Anime", ""].join(separator)),
		).toBe("root/path/anime");
	});

	it("joins root folders with known provider folders", () => {
		const separator = String.fromCodePoint(92);

		expect(joinRootAndFolder("/rootpath/2/", "/anime1")).toBe(
			"/rootpath/2/anime1",
		);
		expect(
			joinRootAndFolder(["C:", "Media", "TV", ""].join(separator), "Anime1"),
		).toBe(["C:", "Media", "TV", "Anime1"].join(separator));
	});

	it("extracts relative folders and preserves nested suffixes", () => {
		expect(extractRelativeFolder("/media/tv/Anime1", "/media/tv")).toBe(
			"Anime1",
		);
		expect(extractRelativeFolder("/media/tv/A/Anime1", "/media/tv")).toBe(
			"A/Anime1",
		);
		expect(extractRelativeFolder("/other/tv/Anime1", "/media/tv")).toBeNull();
		expect(extractRelativeFolder("/media/tv", "/media/tv")).toBeNull();
	});

	it("extracts path leaves as edit-only fallback", () => {
		expect(extractPathLeaf("/path/to/anime1/")).toBe("anime1");
		expect(extractPathLeaf("")).toBeNull();
	});

	it("compares move destinations only when both paths exist", () => {
		expect(shouldMoveProviderFiles(null, "/media/tv/anime")).toBe(false);
		expect(shouldMoveProviderFiles("/media/tv/anime", null)).toBe(false);
		expect(
			shouldMoveProviderFiles("/media/tv/anime/", String.raw`\media\tv\anime`),
		).toBe(false);
		expect(shouldMoveProviderFiles("/media/tv/anime", "/media/4k/anime")).toBe(
			true,
		);
	});
});
