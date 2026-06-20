/** Tests for ids.moe cached fallback lookups. */
// src/mapping/idsmoe.store.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId } from "@/providers/schemas";
import {
	clearIdsMoeCache,
	getCachedIdsMoeTarget,
	resolveIdsMoeTarget,
} from "./idsmoe.store";

const bumpMappingsRevisionMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/sync/revisions", () => ({
	bumpMappingsRevision: bumpMappingsRevisionMock,
}));

const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const start = new Date("2026-01-01T00:00:00Z");

function jsonResponse(body: unknown, status = 200): Response {
	return Response.json(body, { status });
}

describe("ids.moe store", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
		vi.setSystemTime(start);
		await clearIdsMoeCache();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("fetches and caches Radarr TMDB targets by source identity", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		const fetchFn = vi.fn(async () =>
			jsonResponse({ title: "Example", themoviedb: tmdb(300) }),
		);

		await expect(
			resolveIdsMoeTarget("radarr", source, { fetchFn }),
		).resolves.toEqual({
			provider: "radarr",
			providerId: tmdb(300),
		});
		await expect(getCachedIdsMoeTarget("radarr", source)).resolves.toEqual({
			provider: "radarr",
			providerId: tmdb(300),
		});

		expect(fetchFn).toHaveBeenCalledWith(
			"https://api.ids.moe/ids/5114?p=mal",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(bumpMappingsRevisionMock).toHaveBeenCalledTimes(1);
	});

	it("uses cached misses without fetching again", async () => {
		const source = { source: "mal", id: mal(1) } as const;
		const fetchFn = vi.fn(async () => jsonResponse({ themoviedb: null }));

		await expect(
			resolveIdsMoeTarget("radarr", source, { fetchFn }),
		).resolves.toBeNull();
		await expect(
			resolveIdsMoeTarget("radarr", source, { fetchFn }),
		).resolves.toBeNull();

		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it("returns null on failures and caches the miss", async () => {
		const source = { source: "mal", id: mal(404) } as const;
		const fetchFn = vi.fn(async () => jsonResponse({ error: "missing" }, 404));

		await expect(
			resolveIdsMoeTarget("radarr", source, { fetchFn }),
		).resolves.toBeNull();
		await expect(
			resolveIdsMoeTarget("radarr", source, { fetchFn }),
		).resolves.toBeNull();

		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it("does not call ids.moe for Sonarr because public ids.moe has no TVDB field", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		const fetchFn = vi.fn(async () => jsonResponse({ themoviedb: tmdb(300) }));

		await expect(
			resolveIdsMoeTarget("sonarr", source, { fetchFn }),
		).resolves.toBeNull();

		expect(fetchFn).not.toHaveBeenCalled();
	});
});
