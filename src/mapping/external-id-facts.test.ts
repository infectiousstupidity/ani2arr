/** Tests for shared external-ID precedence and Arr projections. */

import { describe, expect, it } from "vitest";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import {
	createExternalIdLayer,
	projectRadarrTarget,
	projectSonarrTarget,
	selectExternalIdFacts,
} from "./external-id-facts";

const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

describe("external ID facts", () => {
	it("selects each slot independently with manual, upstream, automatic precedence", () => {
		const layers = {
			manual: createExternalIdLayer({ tmdbMovie: [tmdb(10)] }),
			upstream: createExternalIdLayer({
				tmdbMovie: [tmdb(20)],
				tmdbShow: [{ id: tmdb(30) }],
			}),
			automatic: createExternalIdLayer({
				tmdbMovie: [tmdb(40)],
				tmdbShow: [{ id: tmdb(50) }],
				tvdbShow: [{ id: tvdb(60) }],
			}),
		};

		expect(selectExternalIdFacts(layers)).toEqual({
			facts: {
				tmdbMovie: tmdb(10),
				tmdbShow: tmdb(30),
				tvdbShow: tvdb(60),
			},
			sources: {
				tmdbMovie: "manual",
				tmdbShow: "upstream",
				tvdbShow: "automatic",
			},
		});
		expect(projectRadarrTarget(layers)).toEqual({
			kind: "target",
			source: "manual",
			target: { tmdbId: tmdb(10) },
		});
	});

	it("blocks automatic fallback with a sorted deduplicated upstream conflict", () => {
		const layers = {
			upstream: createExternalIdLayer({
				tmdbMovie: [tmdb(300), tmdb(100), tmdb(300)],
			}),
			automatic: createExternalIdLayer({ tmdbMovie: [tmdb(999)] }),
		};

		expect(selectExternalIdFacts(layers)).toEqual({
			facts: {},
			sources: {},
			conflicts: { tmdbMovie: [tmdb(100), tmdb(300)] },
		});
		expect(projectRadarrTarget(layers)).toEqual({
			kind: "conflict",
			candidates: [tmdb(100), tmdb(300)],
		});
	});

	it("keeps exact show seasons while projecting Sonarr scope", () => {
		const singleSeason = {
			upstream: createExternalIdLayer({
				tvdbShow: [
					{ id: tvdb(700), seasons: [1] },
					{ id: tvdb(700), seasons: [1] },
				],
			}),
		};
		const multipleSeasons = {
			upstream: createExternalIdLayer({
				tvdbShow: [
					{ id: tvdb(700), seasons: [2, 1, 2] },
					{ id: tvdb(700), seasons: [0] },
				],
			}),
		};
		const explicitlyUnscoped = {
			upstream: createExternalIdLayer({
				tvdbShow: [
					{ id: tvdb(700) },
					{ id: tvdb(700), seasons: [1] },
				],
			}),
		};

		expect(projectSonarrTarget(singleSeason)).toEqual({
			kind: "target",
			source: "upstream",
			target: { tvdbId: tvdb(700), season: 1 },
		});
		expect(multipleSeasons.upstream).toEqual({
			facts: { tvdbShow: tvdb(700) },
			scopes: { tvdbShow: { id: tvdb(700), seasons: [0, 1, 2] } },
		});
		expect(projectSonarrTarget(multipleSeasons)).toEqual({
			kind: "target",
			source: "upstream",
			target: { tvdbId: tvdb(700) },
		});
		expect(projectSonarrTarget(explicitlyUnscoped)).toEqual({
			kind: "target",
			source: "upstream",
			target: { tvdbId: tvdb(700) },
		});
	});

	it("keeps different show IDs as scoped conflicts", () => {
		const layers = {
			upstream: createExternalIdLayer({
				tvdbShow: [
					{ id: tvdb(200), seasons: [2] },
					{ id: tvdb(100), seasons: [1] },
				],
			}),
			automatic: createExternalIdLayer({
				tvdbShow: [{ id: tvdb(200), seasons: [3] }],
			}),
		};

		expect(projectSonarrTarget(layers)).toEqual({
			kind: "conflict",
			candidates: [
				{ id: tvdb(100), seasons: [1] },
				{ id: tvdb(200), seasons: [2] },
			],
		});
	});

	it("does not expose TVDB pair evidence to Sonarr", () => {
		const layers = {
			automatic: createExternalIdLayer({
				tmdbShow: [{ id: tmdb(500) }],
				tvShowPairs: [
					{ tmdbShow: tmdb(500), tvdbShow: tvdb(700) },
				],
			}),
		};

		expect(projectSonarrTarget(layers)).toEqual({ kind: "missing" });
	});
});
