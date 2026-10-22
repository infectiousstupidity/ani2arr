/** Tests for mapping source identity helper behavior. */
// src/mapping/source-identity.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import {
	normalizeSourceIdentity,
	parseSourceIdentityKey,
	sourceIdentityKey,
} from "@/mapping/source-identity";

describe("sourceIdentityKey", () => {
	it("round-trips AniList source identities", () => {
		const identity = { source: "anilist", id: parseAniListId(21) } as const;

		expect(sourceIdentityKey(identity)).toBe("anilist:21");
		expect(parseSourceIdentityKey("anilist:21")).toEqual(identity);
	});

	it("round-trips MyAnimeList source identities", () => {
		const identity = { source: "mal", id: parseMyAnimeListId(5114) } as const;

		expect(sourceIdentityKey(identity)).toBe("mal:5114");
		expect(parseSourceIdentityKey("mal:5114")).toEqual(identity);
	});

	it("normalizes legacy AniList ID inputs", () => {
		const id = parseAniListId(21);

		expect(normalizeSourceIdentity(id)).toEqual({ source: "anilist", id });
	});

	it("rejects invalid keys", () => {
		expect(parseSourceIdentityKey(21)).toBeNull();
		expect(parseSourceIdentityKey("anilist")).toBeNull();
		expect(parseSourceIdentityKey("anilist:0")).toBeNull();
		expect(parseSourceIdentityKey("anilist:-1")).toBeNull();
		expect(parseSourceIdentityKey("mal:1.5")).toBeNull();
		expect(parseSourceIdentityKey("tvdb:100")).toBeNull();
		expect(parseSourceIdentityKey("mal:001")).toBeNull();
	});
});
