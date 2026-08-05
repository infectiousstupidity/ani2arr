/** Focused behavior tests for source-native Seerr automatic resolution. */
// src/mapping/resolve/seerr-auto-resolver.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type AniListMediaFormat, parseAniListId } from "@/anilist/types";
import {
	clearAutoResults,
	getSeerrAutoResult,
	setSeerrAutoResult,
	type SeerrAutoResult,
} from "@/mapping/auto.store";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import { createSeerrAutoResolver } from "./seerr-auto-resolver";

const source = {
	source: "anilist",
	id: parseAniListId(21_003),
} as const;

const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

function movie(tmdbId = 10_494, title = "Perfect Blue", year = 1998) {
	return {
		mediaType: "movie" as const,
		tmdbId: tmdb(tmdbId),
		title,
		year,
	};
}

function tv(tmdbId: number, title: string, year: number) {
	return {
		mediaType: "tv" as const,
		tmdbId: tmdb(tmdbId),
		title,
		year,
	};
}

function tvDetails(input: {
	tmdbId: number;
	title: string;
	tvdbId?: number;
	seasons?: number[];
}) {
	return {
		mediaType: "tv" as const,
		tmdbId: tmdb(input.tmdbId),
		...(input.tvdbId === undefined ? {} : { tvdbId: tvdb(input.tvdbId) }),
		title: input.title,
		status: "unknown" as const,
		seasons: (input.seasons ?? []).map((seasonNumber) => ({
			seasonNumber,
			status: "not-requested" as const,
			requestable: true,
		})),
	};
}

function request(
	title?: string,
	metadata?: {
		format: AniListMediaFormat;
		startYear?: number;
	},
	mediaType: "movie" | "tv" = metadata?.format === "MOVIE" ? "movie" : "tv",
) {
	return {
		source,
		mediaType,
		...(title === undefined ? {} : { title }),
		...(metadata === undefined ? {} : { metadata }),
	};
}

const createDeferred = <T>() => {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
};

function requireMappedResult(
	result: SeerrAutoResult | null,
): Extract<SeerrAutoResult, { kind: "mapped" }> {
	if (result?.kind !== "mapped") {
		throw new Error("Expected a mapped result.");
	}
	return result;
}

describe("Seerr automatic resolver", () => {
	let cached: SeerrAutoResult | null;
	const getEffectiveTarget = vi.fn();
	const getAutoResult = vi.fn();
	const setAutoResult = vi.fn();
	const loadAniListMedia = vi.fn();
	const loadMyAnimeListMetadata = vi.fn();
	const searchMedia = vi.fn();
	const getTvDetails = vi.fn();

	const resolve = createSeerrAutoResolver({
		getEffectiveTarget,
		getAutoResult,
		setAutoResult,
		loadAniListMedia,
		loadMyAnimeListMetadata,
		searchMedia,
		getTvDetails,
	});

	beforeEach(() => {
		vi.clearAllMocks();
		cached = null;
		getEffectiveTarget.mockResolvedValue(null);
		getAutoResult.mockImplementation(async () => cached);
		setAutoResult.mockImplementation(
			async (
				_token: unknown,
				_source: unknown,
				_mediaType: unknown,
				result: SeerrAutoResult,
			) => {
				cached = result;
				return true;
			},
		);
		loadAniListMedia.mockRejectedValue(new Error("not needed"));
		loadMyAnimeListMetadata.mockRejectedValue(new Error("not needed"));
	});

	it("stores one confident movie search result", async () => {
		searchMedia.mockResolvedValue([tv(100, "Perfect Blue", 1998), movie()]);

		await expect(
			resolve(
				request("Perfect Blue", {
					format: "MOVIE",
					startYear: 1998,
				}),
			),
		).resolves.toEqual({
			source: "automatic",
			mediaType: "movie",
			tmdbId: tmdb(10_494),
		});

		expect(cached).toEqual({
			kind: "mapped",
			target: {
				mediaType: "movie",
				tmdbId: tmdb(10_494),
			},
			matchedTitle: "Perfect Blue",
		});
		expect(getTvDetails).not.toHaveBeenCalled();
	});

	it("returns null when a mapped automatic write is rejected", async () => {
		searchMedia.mockResolvedValue([movie()]);
		setAutoResult.mockResolvedValue(false);

		await expect(
			resolve(
				request("Perfect Blue", {
					format: "MOVIE",
					startYear: 1998,
				}),
			),
		).resolves.toBeNull();
	});

	it("captures before effective-target reads and rejects a stale real-store write", async () => {
		await clearAutoResults();
		const effectiveRead = createDeferred<null>();
		const realResolve = createSeerrAutoResolver({
			getEffectiveTarget: () => effectiveRead.promise,
			getAutoResult: getSeerrAutoResult,
			setAutoResult: setSeerrAutoResult,
			loadAniListMedia,
			loadMyAnimeListMetadata,
			searchMedia,
			getTvDetails,
		});
		searchMedia.mockResolvedValue([movie()]);
		const pending = realResolve(
			request("Perfect Blue", {
				format: "MOVIE",
				startYear: 1998,
			}),
		);

		await clearAutoResults();
		effectiveRead.resolve(null);

		await expect(pending).resolves.toBeNull();
		await expect(getSeerrAutoResult(source, "movie")).resolves.toBeNull();
	});

	it("rejects a Seerr provider result completed after a full clear", async () => {
		await clearAutoResults();
		const providerResult = createDeferred<ReturnType<typeof movie>[]>();
		const realResolve = createSeerrAutoResolver({
			getEffectiveTarget: vi.fn().mockResolvedValue(null),
			getAutoResult: getSeerrAutoResult,
			setAutoResult: setSeerrAutoResult,
			loadAniListMedia,
			loadMyAnimeListMetadata,
			searchMedia: () => providerResult.promise,
			getTvDetails,
		});
		const pending = realResolve(
			request("Perfect Blue", {
				format: "MOVIE",
				startYear: 1998,
			}),
		);

		await clearAutoResults();
		providerResult.resolve([movie()]);

		await expect(pending).resolves.toBeNull();
		await expect(getSeerrAutoResult(source, "movie")).resolves.toBeNull();
	});

	it("fetches TV details and stores the TVDB ID", async () => {
		searchMedia.mockResolvedValue([
			tv(209_867, "Frieren: Beyond Journey's End", 2023),
		]);
		getTvDetails.mockResolvedValue(
			tvDetails({
				tmdbId: 209_867,
				tvdbId: 424_536,
				title: "Frieren: Beyond Journey's End",
			}),
		);

		await expect(
			resolve(
				request("Frieren: Beyond Journey's End", {
					format: "TV",
					startYear: 2023,
				}),
			),
		).resolves.toMatchObject({
			mediaType: "tv",
			tmdbId: tmdb(209_867),
			tvdbId: tvdb(424_536),
		});

		expect(getTvDetails).toHaveBeenCalledWith(tmdb(209_867));
		expect(cached).toMatchObject({
			kind: "mapped",
			target: { tvdbId: tvdb(424_536) },
		});
	});

	it("retains an explicit season only when TV details contain it", async () => {
		searchMedia.mockResolvedValue([tv(31_911, "Fullmetal Alchemist", 2003)]);
		getTvDetails.mockResolvedValue(
			tvDetails({
				tmdbId: 31_911,
				title: "Fullmetal Alchemist",
				seasons: [1, 3],
			}),
		);

		await resolve(
			request("Fullmetal Alchemist S3", {
				format: "TV",
				startYear: 2003,
			}),
		);

		expect(cached).toMatchObject({
			kind: "mapped",
			target: { seasons: [3] },
		});

		cached = null;
		getTvDetails.mockResolvedValue(
			tvDetails({
				tmdbId: 31_911,
				title: "Fullmetal Alchemist",
				seasons: [1],
			}),
		);

		await resolve({
			...request("Fullmetal Alchemist Season 3", {
				format: "TV",
				startYear: 2003,
			}),
			source: {
				source: "anilist",
				id: parseAniListId(21_004),
			},
		});

		expect(requireMappedResult(cached).target).not.toHaveProperty("seasons");
	});

	it("stores an unclear part title as a show-only target", async () => {
		searchMedia.mockResolvedValue([tv(1429, "Attack on Titan", 2013)]);
		getTvDetails.mockResolvedValue(
			tvDetails({
				tmdbId: 1429,
				title: "Attack on Titan",
				seasons: [2],
			}),
		);

		await resolve(
			request("Attack on Titan Part 2", {
				format: "TV",
				startYear: 2013,
			}),
		);

		expect(cached).toMatchObject({
			kind: "mapped",
			target: {
				mediaType: "tv",
				tmdbId: tmdb(1429),
			},
		});
		expect(requireMappedResult(cached).target).not.toHaveProperty("seasons");
	});

	it("returns fresh mapped results without another search", async () => {
		cached = {
			kind: "mapped",
			target: {
				mediaType: "movie",
				tmdbId: tmdb(10_494),
			},
		};

		await expect(
			resolve(
				request("Perfect Blue", {
					format: "MOVIE",
				}),
			),
		).resolves.toEqual({
			source: "automatic",
			mediaType: "movie",
			tmdbId: tmdb(10_494),
		});

		expect(searchMedia).not.toHaveBeenCalled();
	});

	it("retries after metadata enrichment changes an earlier null result", async () => {
		searchMedia.mockResolvedValue([]);

		await expect(resolve(request("Unknown anime"))).resolves.toBeNull();
		expect(cached).toEqual({ kind: "unmapped" });

		searchMedia.mockResolvedValue([movie()]);

		await expect(
			resolve(
				request("Perfect Blue", {
					format: "MOVIE",
					startYear: 1998,
				}),
			),
		).resolves.toMatchObject({
			tmdbId: tmdb(10_494),
		});
		expect(searchMedia).toHaveBeenCalledWith("Perfect Blue");
	});

	it("uses forceRetry to retry a cached null result without new hints", async () => {
		cached = { kind: "unmapped" };
		loadAniListMedia.mockResolvedValue({
			id: source.id,
			format: "MOVIE",
			title: { english: "Perfect Blue" },
			synonyms: [],
			seasonYear: 1998,
		});
		searchMedia.mockResolvedValue([movie()]);

		await expect(
			resolve(request(undefined, undefined, "movie")),
		).resolves.toBeNull();
		expect(loadAniListMedia).not.toHaveBeenCalled();
		expect(searchMedia).not.toHaveBeenCalled();

		await expect(
			resolve({
				...request(undefined, undefined, "movie"),
				forceRetry: true,
			}),
		).resolves.toMatchObject({
			tmdbId: tmdb(10_494),
		});

		expect(loadAniListMedia).toHaveBeenCalledOnce();
		expect(searchMedia).toHaveBeenCalledWith("Perfect Blue");
	});
});
