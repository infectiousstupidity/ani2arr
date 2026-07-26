/** Tests for source identity and optional AniList resolution at the RPC boundary. */
// src/rpc/source-input.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { getUniqueAniListIdForSource } from "@/mapping/upstream.store";
import { parseMyAnimeListId } from "@/myanimelist/types";
import {
	getDirectAniListId,
	resolveAniListIdFromInput,
	sourceFromInput,
} from "./source-input";

vi.mock("@/mapping/upstream.store", () => ({
	getUniqueAniListIdForSource: vi.fn(),
}));

const aid = parseAniListId;
const mal = parseMyAnimeListId;

describe("source RPC input", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("uses an AniList source directly", async () => {
		const input = { source: { source: "anilist", id: aid(10) } } as const;

		expect(getDirectAniListId(input)).toBe(aid(10));
		await expect(resolveAniListIdFromInput(input)).resolves.toBe(aid(10));
		expect(getUniqueAniListIdForSource).not.toHaveBeenCalled();
	});

	it("prefers a supplied AniList ID for a MAL source", async () => {
		const input = {
			source: { source: "mal", id: mal(5114) },
			anilistId: aid(20),
		} as const;

		await expect(resolveAniListIdFromInput(input)).resolves.toBe(aid(20));
		expect(getUniqueAniListIdForSource).not.toHaveBeenCalled();
	});

	it("resolves a MAL-only source through the crosswalk", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		vi.mocked(getUniqueAniListIdForSource).mockResolvedValue(aid(20));

		await expect(resolveAniListIdFromInput({ source })).resolves.toBe(aid(20));
		expect(getUniqueAniListIdForSource).toHaveBeenCalledWith(source);
	});

	it("returns null for a MAL read without a crosswalk", async () => {
		vi.mocked(getUniqueAniListIdForSource).mockResolvedValue(null);

		await expect(
			resolveAniListIdFromInput({
				source: { source: "mal", id: mal(5114) },
			}),
		).resolves.toBeNull();
	});

	it("keeps the supplied source as the mapping identity", () => {
		const source = { source: "mal", id: mal(5114) } as const;

		expect(sourceFromInput({ source, anilistId: aid(20) })).toEqual(source);
		expect(sourceFromInput({ source })).toEqual(source);
		expect(sourceFromInput({ anilistId: aid(20) })).toEqual({
			source: "anilist",
			id: aid(20),
		});
		expect(getUniqueAniListIdForSource).not.toHaveBeenCalled();
	});

});
