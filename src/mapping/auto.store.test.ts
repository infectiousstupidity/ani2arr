/** Tests for automatic mapping result expiry behavior. */
// src/mapping/auto.store.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId } from "@/providers/schemas";
import { clearAutoResults, getAutoResult, setAutoResult } from "./auto.store";

const bumpMappingsRevisionMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/sync/revisions", () => ({
	bumpMappingsRevision: bumpMappingsRevisionMock,
}));

const aid = parseAniListId;
const tmdb = parseTmdbId;
const start = new Date("2026-01-01T00:00:00Z");

describe("auto mapping store", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(start);
		await clearAutoResults("radarr");
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("ignores expired results without deleting them on read", async () => {
		await setAutoResult("radarr", aid(1), {
			kind: "mapped",
			providerId: tmdb(10),
		});

		vi.setSystemTime(new Date("2026-02-02T00:00:00Z"));
		await expect(getAutoResult("radarr", aid(1))).resolves.toBeNull();

		vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
		await expect(getAutoResult("radarr", aid(1))).resolves.toEqual({
			kind: "mapped",
			providerId: tmdb(10),
		});
	});

	it("bumps mappings revision after storing auto result", async () => {
		await setAutoResult("radarr", aid(1), {
			kind: "mapped",
			providerId: tmdb(10),
		});

		expect(bumpMappingsRevisionMock).toHaveBeenCalledTimes(1);
	});
});
