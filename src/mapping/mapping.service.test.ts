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

		await expect(service.getMapping("radarr", source)).resolves.toEqual({
			kind: "mapped",
			source: "manual",
			providerId: tmdb(20),
		});

		await service.clearManualMapping("radarr", source);
		await expect(service.getMapping("radarr", source)).resolves.toEqual({
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
			service.resolveMapping("sonarr", source, { title: "FMA" }),
		).resolves.toEqual({
			kind: "mapped",
			source: "auto",
			providerId: tvdb(78_874),
			matchedTitle: "Fullmetal Alchemist",
		});
		await expect(service.getMapping("sonarr", source)).resolves.toMatchObject({
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
		const pending = service.resolveMapping("sonarr", source);

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
		const pending = service.resolveMapping("sonarr", source);

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
			service.resolveMapping("radarr", source, { forceRetry: true }),
		).resolves.toEqual({
			kind: "ambiguous",
			targets: [
				{ provider: "radarr", providerId: tmdb(10) },
				{ provider: "radarr", providerId: tmdb(20) },
			],
		});
		expect(resolver).not.toHaveBeenCalled();
	});

	it("projects Seerr TV from shared facts without promoting pair evidence", async () => {
		const source = { source: "anilist", id: aid(3) } as const;
		await setManualSeerrTarget(source, {
			mediaType: "tv",
			tmdbId: tmdb(500),
			tvdbId: tvdb(700),
			seasons: [2],
		});
		const service = new MappingService(vi.fn());

		await expect(service.getSeerrTarget(source, "tv")).resolves.toMatchObject({
			mediaType: "tv",
			tmdbId: tmdb(500),
			tvdbId: tvdb(700),
			source: "manual",
		});
		await expect(service.getMapping("sonarr", source)).resolves.toEqual({
			kind: "unmapped",
			hadResolveAttempt: false,
		});
	});

	it("clearing Seerr TV retains an independent Sonarr fact", async () => {
		const source = { source: "anilist", id: aid(4) } as const;
		await setManualMapping("sonarr", source, { providerId: tvdb(900) });
		await setManualSeerrTarget(source, {
			mediaType: "tv",
			tmdbId: tmdb(800),
			tvdbId: tvdb(900),
		});
		await clearManualSeerrTarget(source, "tv");
		const service = new MappingService(vi.fn());

		await expect(service.getSeerrTarget(source, "tv")).resolves.toBeNull();
		await expect(service.getMapping("sonarr", source)).resolves.toMatchObject({
			kind: "mapped",
			providerId: tvdb(900),
		});
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
