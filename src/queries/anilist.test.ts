/** Focused tests for AniList React Query cache helpers. */
// src/queries/anilist.test.ts

import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist";
import type { AniListMedia } from "@/anilist/schemas/media.schema";
import { prefetchAniListMediaQueries } from "./anilist";
import { queryKeys } from "./query-keys";

const apiMock = vi.hoisted(() => ({
	prefetchAniListMedia: vi.fn(),
}));

vi.mock("@/rpc", () => ({
	getAni2arrApi: () => apiMock,
}));

describe("prefetchAniListMediaQueries", () => {
	beforeEach(() => {
		apiMock.prefetchAniListMedia.mockReset();
	});

	it("skips cached ids and seeds fetched media", async () => {
		const queryClient = new QueryClient();
		const cachedId = parseAniListId(101);
		const fetchedId = parseAniListId(202);
		const cachedMedia = { id: cachedId } as AniListMedia;
		const fetchedMedia = { id: fetchedId } as AniListMedia;

		queryClient.setQueryData(queryKeys.aniListMedia(cachedId), cachedMedia);
		apiMock.prefetchAniListMedia.mockResolvedValue([[fetchedId, fetchedMedia]]);

		const count = await prefetchAniListMediaQueries(queryClient, [
			cachedId,
			fetchedId,
			fetchedId,
		]);

		expect(count).toBe(1);
		expect(apiMock.prefetchAniListMedia).toHaveBeenCalledWith([fetchedId]);
		expect(queryClient.getQueryData(queryKeys.aniListMedia(cachedId))).toBe(
			cachedMedia,
		);
		expect(queryClient.getQueryData(queryKeys.aniListMedia(fetchedId))).toBe(
			fetchedMedia,
		);
	});

	it("dedupes ids and caps one prefetch batch at 50", async () => {
		const queryClient = new QueryClient();
		const ids = Array.from({ length: 55 }, (_, index) =>
			parseAniListId(index + 1),
		);
		const expectedIds = ids.slice(0, 50);

		apiMock.prefetchAniListMedia.mockResolvedValue(
			expectedIds.map(id => [id, { id } as AniListMedia]),
		);

		const count = await prefetchAniListMediaQueries(queryClient, [
			...ids,
			parseAniListId(1),
			parseAniListId(2),
		]);

		expect(count).toBe(50);
		expect(apiMock.prefetchAniListMedia).toHaveBeenCalledWith(expectedIds);
		expect(queryClient.getQueryData(queryKeys.aniListMedia(parseAniListId(50)))).toEqual({
			id: parseAniListId(50),
		});
		expect(
			queryClient.getQueryData(queryKeys.aniListMedia(parseAniListId(51))),
		).toBeUndefined();
	});
});
