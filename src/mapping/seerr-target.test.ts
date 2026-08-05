/** Tests for Seerr projection from shared external-ID facts. */

import { describe, expect, it } from "vitest";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import { createExternalIdLayer } from "./external-id-facts";
import { projectSeerrTarget } from "./seerr-target";

const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

describe("Seerr target projection", () => {
	it("projects movie and TV slots independently when media type is known", () => {
		const layers = {
			upstream: createExternalIdLayer({
				tmdbMovie: [tmdb(100)],
				tmdbShow: [{ id: tmdb(200) }],
			}),
		};

		expect(projectSeerrTarget(layers)).toEqual({ kind: "conflict" });
		expect(projectSeerrTarget(layers, "movie")).toEqual({
			kind: "target",
			source: "upstream",
			target: { mediaType: "movie", tmdbId: tmdb(100) },
		});
		expect(projectSeerrTarget(layers, "tv")).toEqual({
			kind: "target",
			source: "upstream",
			target: { mediaType: "tv", tmdbId: tmdb(200) },
		});
	});

	it("uses compatible pair evidence and preserves its exact request scope", () => {
		const layers = {
			manual: createExternalIdLayer({
				tmdbShow: [{ id: tmdb(500) }],
			}),
			upstream: createExternalIdLayer({
				tmdbShow: [{ id: tmdb(500), seasons: [2, 0, 2] }],
				tvdbShow: [{ id: tvdb(700), seasons: [1, 0] }],
				tvShowPairs: [
					{
						tmdbShow: tmdb(500),
						tvdbShow: tvdb(700),
						tmdbSeasons: [2, 0],
						tvdbSeasons: [1, 0],
					},
				],
			}),
		};

		expect(projectSeerrTarget(layers, "tv")).toEqual({
			kind: "target",
			source: "manual",
			target: {
				mediaType: "tv",
				tmdbId: tmdb(500),
				tvdbId: tvdb(700),
				tmdbSeasons: [0, 2],
				tvdbSeasons: [0, 1],
				seasons: [0, 1, 2],
			},
		});
	});

	it("uses pair-only TVDB for Seerr when it matches the selected TMDB show", () => {
		const layers = {
			automatic: createExternalIdLayer({
				tmdbShow: [{ id: tmdb(500) }],
				tvShowPairs: [
					{
						tmdbShow: tmdb(500),
						tvdbShow: tvdb(700),
						tvdbSeasons: [2],
					},
				],
			}),
		};

		expect(projectSeerrTarget(layers, "tv")).toEqual({
			kind: "target",
			source: "automatic",
			target: {
				mediaType: "tv",
				tmdbId: tmdb(500),
				tvdbId: tvdb(700),
				tvdbSeasons: [2],
				seasons: [2],
			},
		});
	});

	it("rejects pair evidence that does not match effective independent IDs", () => {
		const layers = {
			manual: createExternalIdLayer({
				tmdbShow: [{ id: tmdb(500) }],
			}),
			upstream: createExternalIdLayer({
				tmdbShow: [{ id: tmdb(600), seasons: [1] }],
				tvdbShow: [{ id: tvdb(700), seasons: [2] }],
				tvShowPairs: [
					{
						tmdbShow: tmdb(600),
						tvdbShow: tvdb(700),
						tvdbSeasons: [2],
					},
				],
			}),
		};

		expect(projectSeerrTarget(layers, "tv")).toEqual({
			kind: "target",
			source: "manual",
			target: { mediaType: "tv", tmdbId: tmdb(500) },
		});
	});

	it("does not use lower pair evidence behind an upstream TVDB conflict", () => {
		const layers = {
			upstream: createExternalIdLayer({
				tmdbShow: [{ id: tmdb(500) }],
				tvdbShow: [{ id: tvdb(700) }, { id: tvdb(800) }],
			}),
			automatic: createExternalIdLayer({
				tmdbShow: [{ id: tmdb(500) }],
				tvShowPairs: [
					{ tmdbShow: tmdb(500), tvdbShow: tvdb(900) },
				],
			}),
		};

		expect(projectSeerrTarget(layers, "tv")).toEqual({
			kind: "target",
			source: "upstream",
			target: { mediaType: "tv", tmdbId: tmdb(500) },
		});
	});

	it("requires a TMDB show even when a TVDB fact exists", () => {
		expect(
			projectSeerrTarget(
				{
					upstream: createExternalIdLayer({
						tvdbShow: [{ id: tvdb(700), seasons: [1] }],
					}),
				},
				"tv",
			),
		).toEqual({ kind: "missing" });
	});
});
