/** Shared mapping composition behavior. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import {
	captureAutomaticWriteToken,
	clearAutoResults,
	setAutoResult,
} from "./auto.store";
import {
	clearManualFacts,
	clearManualMapping,
	clearManualSeerrTarget,
	setManualMapping,
	setManualSeerrTarget,
} from "./manual.store";
import { MappingService } from "./mapping.service";
import { clearUpstreamMappings } from "./upstream.store";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

const createDeferred = <T>() => {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
};

async function seedUpstream(records: Record<string, unknown>): Promise<void> {
	await browser.storage.local.set({
		"mapping:upstream": {
			version: 1,
			records,
			fetchedAt: Date.now(),
		},
	});
}

describe("MappingService", () => {
	beforeEach(async () => {
		await Promise.all([
			clearManualFacts(),
			clearAutoResults(),
			clearUpstreamMappings(),
		]);
	});

	it("applies manual, upstream, then automatic precedence", async () => {
		const source = { source: "anilist", id: aid(1) } as const;
		await seedUpstream({
			"anilist:1": { facts: { tmdbMovie: tmdb(10) } },
		});
		await setAutoResult(captureAutomaticWriteToken(), "radarr", source, {
			kind: "mapped",
			providerId: tmdb(30),
		});
		await setManualMapping("radarr", source, { providerId: tmdb(20) });
		const service = new MappingService(vi.fn());

		await expect(
			service.getMapping("radarr", source, source.id),
		).resolves.toEqual({
			kind: "mapped",
			source: "manual",
			providerId: tmdb(20),
		});

		await clearManualMapping("radarr", source);
		await expect(
			service.getMapping("radarr", source, source.id),
		).resolves.toEqual({
			kind: "mapped",
			source: "upstream",
			providerId: tmdb(10),
		});
	});

	it("stores and reuses an automatic result for an unlinked MAL source", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		const resolver = vi.fn(async ({ writeToken, provider, identity }) =>
			setAutoResult(writeToken, provider, identity, {
				kind: "mapped",
				providerId: tvdb(78_874),
				matchedTitle: "Fullmetal Alchemist",
			}),
		);
		const service = new MappingService(resolver);

		await expect(
			service.resolveMapping("sonarr", source, null, { title: "FMA" }),
		).resolves.toEqual({
			kind: "mapped",
			source: "auto",
			providerId: tvdb(78_874),
			matchedTitle: "Fullmetal Alchemist",
		});
		await expect(
			service.getMapping("sonarr", source, null),
		).resolves.toMatchObject({
			kind: "mapped",
			providerId: tvdb(78_874),
		});
		expect(resolver).toHaveBeenCalledOnce();
	});

	it("captures the automatic write token before mapping-state reads", async () => {
		const source = { source: "anilist", id: aid(2) } as const;
		let releaseStateRead!: () => void;
		const stateRead = new Promise<void>((resolve) => {
			releaseStateRead = resolve;
		});
		const originalGet = browser.storage.local.get.bind(browser.storage.local);
		vi.spyOn(browser.storage.local, "get").mockImplementationOnce(
			async (...args) => {
				await stateRead;
				return originalGet(...args);
			},
		);
		const resolver = vi.fn(async ({ writeToken, provider, identity }) =>
			setAutoResult(writeToken, provider, identity, {
				kind: "mapped",
				providerId: tvdb(78_874),
			}),
		);
		const service = new MappingService(resolver);
		const pending = service.resolveMapping("sonarr", source, source.id);

		await clearAutoResults();
		releaseStateRead();

		await expect(pending).resolves.toEqual({
			kind: "unmapped",
			hadResolveAttempt: false,
		});
		expect(resolver).toHaveReturnedWith(expect.any(Promise));
	});

	it("rejects an Arr provider result completed after a full clear", async () => {
		const source = { source: "anilist", id: aid(3) } as const;
		const providerResult = createDeferred<void>();
		const resolver = vi.fn(async ({ writeToken, provider, identity }) => {
			await providerResult.promise;
			return setAutoResult(writeToken, provider, identity, {
				kind: "mapped",
				providerId: tvdb(78_874),
			});
		});
		const service = new MappingService(resolver);
		const pending = service.resolveMapping("sonarr", source, source.id);

		await vi.waitFor(() => expect(resolver).toHaveBeenCalledOnce());
		await clearAutoResults();
		providerResult.resolve();

		await expect(pending).resolves.toEqual({
			kind: "unmapped",
			hadResolveAttempt: false,
		});
	});

	it("never resolves behind an upstream conflict", async () => {
		const source = { source: "anilist", id: aid(2) } as const;
		await seedUpstream({
			"anilist:2": {
				facts: {},
				conflicts: { tmdbMovie: [tmdb(10), tmdb(20)] },
			},
		});
		const resolver = vi.fn();
		const service = new MappingService(resolver);

		await expect(
			service.resolveMapping("radarr", source, source.id, { forceRetry: true }),
		).resolves.toEqual({
			kind: "ambiguous",
			targets: [
				{ provider: "radarr", providerId: tmdb(10) },
				{ provider: "radarr", providerId: tmdb(20) },
			],
		});
		expect(resolver).not.toHaveBeenCalled();
	});

	it("keeps manual Seerr TV independent from Sonarr", async () => {
		const source = { source: "anilist", id: aid(3) } as const;
		await setManualSeerrTarget(source, {
			mediaType: "tv",
			tmdbId: tmdb(500),
			seasons: [2],
		});
		const service = new MappingService(vi.fn());

		await expect(
			service.getSeerrTarget(source, "tv", source.id),
		).resolves.toMatchObject({
			mediaType: "tv",
			tmdbId: tmdb(500),
			source: "manual",
		});
		await expect(
			service.getMapping("sonarr", source, source.id),
		).resolves.toMatchObject({ kind: "unmapped" });
	});

	it("clearing Seerr TV retains an independent Sonarr fact", async () => {
		const source = { source: "anilist", id: aid(4) } as const;
		await setManualMapping("sonarr", source, { providerId: tvdb(900) });
		await setManualSeerrTarget(source, {
			mediaType: "tv",
			tmdbId: tmdb(800),
		});
		await clearManualSeerrTarget(source, "tv");
		const service = new MappingService(vi.fn());

		await expect(
			service.getSeerrTarget(source, "tv", source.id),
		).resolves.toBeNull();
		await expect(
			service.getMapping("sonarr", source, source.id),
		).resolves.toMatchObject({
			kind: "mapped",
			providerId: tvdb(900),
		});
	});

	it("covers Seerr bulk, list-all, and reverse-read surfaces", async () => {
		await setManualSeerrTarget(aid(10), {
			mediaType: "movie",
			tmdbId: tmdb(100),
		});
		await setManualSeerrTarget(aid(20), {
			mediaType: "movie",
			tmdbId: tmdb(200),
		});
		await seedUpstream({
			"anilist:30": { facts: { tmdbMovie: tmdb(100) } },
		});
		const service = new MappingService(vi.fn());

		await expect(
			service.listSeerrTargets([
				{ anilistId: aid(10), mediaType: "movie" },
				{ anilistId: aid(30), mediaType: "movie" },
			]),
		).resolves.toEqual([
			{
				anilistId: aid(10),
				source: "manual",
				mediaType: "movie",
				tmdbId: tmdb(100),
			},
			{
				anilistId: aid(30),
				source: "anibridge",
				mediaType: "movie",
				tmdbId: tmdb(100),
			},
		]);
		await expect(service.listAllSeerrTargets("movie")).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ anilistId: aid(20), tmdbId: tmdb(200) }),
				expect.objectContaining({ anilistId: aid(30), tmdbId: tmdb(100) }),
			]),
		);
		await expect(
			service.getLinkedAniListIds("radarr", tmdb(100)),
		).resolves.toEqual([aid(10), aid(30)]);
	});

	it("finds linked AniList IDs from the same effective records", async () => {
		await setManualMapping("radarr", aid(10), { providerId: tmdb(100) });
		await setManualMapping("radarr", aid(20), { providerId: tmdb(100) });
		const service = new MappingService(vi.fn());

		await expect(
			service.getLinkedAniListIds("radarr", tmdb(100)),
		).resolves.toEqual([aid(10), aid(20)]);
	});
});
