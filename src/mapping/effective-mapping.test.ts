/** Focused direct-selector behavior. */

import { describe, expect, it } from "vitest";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import {
	selectArrMapping,
	selectSeerrMapping,
	type MappingSelectionRecords,
} from "./effective-mapping";
import { createMappingRecord } from "./mapping-record";

const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const records = (
	input: Partial<MappingSelectionRecords>,
): MappingSelectionRecords => ({
	manual: null,
	direct: null,
	canonical: null,
	automatic: null,
	...input,
});

describe("effective mapping selectors", () => {
	it("preserves per-slot precedence, canonical fallback, and real origins", () => {
		const input = records({
			manual: createMappingRecord({ tmdbMovie: [tmdb(10)] }),
			direct: createMappingRecord({ tmdbShow: [{ id: tmdb(20) }] }),
			canonical: createMappingRecord({
				tmdbMovie: [tmdb(30)],
				tvdbShow: [{ id: tvdb(40), seasons: [2] }],
			}),
		});
		expect(selectArrMapping("radarr", input)).toMatchObject({
			kind: "mapped",
			providerId: tmdb(10),
			source: "manual",
		});
		expect(selectArrMapping("sonarr", input)).toEqual({
			kind: "mapped",
			providerId: tvdb(40),
			season: 2,
			source: "upstream",
		});
		expect(selectSeerrMapping("tv", input)).toMatchObject({
			kind: "mapped",
			source: "upstream",
			target: { tmdbId: tmdb(20) },
		});
		expect(selectSeerrMapping("tv", input)).not.toMatchObject({
			target: { tvdbId: expect.any(Number) },
		});
	});

	it("keeps conflicts distinct and blocks automatic fallback", () => {
		const input = records({
			direct: createMappingRecord({ tmdbMovie: [tmdb(20), tmdb(10)] }),
			automatic: createMappingRecord({ tmdbMovie: [tmdb(30)] }),
		});
		expect(selectArrMapping("radarr", input)).toEqual({
			kind: "ambiguous",
			targets: [
				{ provider: "radarr", providerId: tmdb(10) },
				{ provider: "radarr", providerId: tmdb(20) },
			],
		});
	});

	it("honors ignore, automatic rejection, and provider-specific attempts", () => {
		const automatic = {
			...createMappingRecord({ tmdbMovie: [tmdb(30)] }),
			slotMeta: { tmdbMovie: { expiresAt: Number.MAX_SAFE_INTEGER } },
			attempts: {
				radarrTmdbMovie: { expiresAt: Number.MAX_SAFE_INTEGER },
			},
		};
		expect(
			selectArrMapping(
				"radarr",
				records({
					manual: { facts: {}, decisions: { radarr: { ignored: true } } },
					automatic,
				}),
			),
		).toEqual({ kind: "ignored" });
		expect(
			selectArrMapping(
				"radarr",
				records({
					manual: {
						facts: {},
						decisions: { radarr: { rejectedTmdbMovie: [tmdb(30)] } },
					},
					automatic,
				}),
			),
		).toEqual({
			kind: "unmapped",
			hadResolveAttempt: true,
			rejectedProviderIds: [tmdb(30)],
		});
	});

	it("finds Sonarr seasons for the selected TVDB ID across layers", () => {
		const input = records({
			manual: createMappingRecord({ tvdbShow: [{ id: tvdb(700) }] }),
			direct: createMappingRecord({
				tvdbShow: [{ id: tvdb(700), seasons: [2] }],
			}),
		});
		expect(selectArrMapping("sonarr", input)).toEqual({
			kind: "mapped",
			source: "manual",
			providerId: tvdb(700),
			season: 2,
		});
	});

	it("keeps TMDB and TVDB series evidence independent", () => {
		const input = records({
			direct: createMappingRecord({
				tmdbShow: [{ id: tmdb(500), seasons: [2] }],
				tvdbShow: [{ id: tvdb(700), seasons: [3] }],
			}),
		});
		expect(selectSeerrMapping("tv", input)).toEqual({
			kind: "mapped",
			source: "upstream",
			target: { mediaType: "tv", tmdbId: tmdb(500), seasons: [2] },
		});
		expect(selectArrMapping("sonarr", input)).toEqual({
			kind: "mapped",
			source: "upstream",
			providerId: tvdb(700),
			season: 3,
		});
	});

	it("does not let TVDB ambiguity block a clear Seerr TV mapping", () => {
		const input = records({
			direct: createMappingRecord({
				tmdbShow: [{ id: tmdb(1), seasons: [2] }],
				tvdbShow: [{ id: tvdb(1) }, { id: tvdb(2) }],
			}),
		});
		expect(selectSeerrMapping("tv", input)).toEqual({
			kind: "mapped",
			source: "upstream",
			target: { mediaType: "tv", tmdbId: tmdb(1), seasons: [2] },
		});
		expect(selectArrMapping("sonarr", input).kind).toBe("ambiguous");
	});

	it("does not let TMDB-series ambiguity block a clear Sonarr mapping", () => {
		const input = records({
			direct: createMappingRecord({
				tmdbShow: [{ id: tmdb(1) }, { id: tmdb(2) }],
				tvdbShow: [{ id: tvdb(7), seasons: [3] }],
			}),
		});
		expect(selectSeerrMapping("tv", input)).toEqual({ kind: "conflict" });
		expect(selectArrMapping("sonarr", input)).toEqual({
			kind: "mapped",
			source: "upstream",
			providerId: tvdb(7),
			season: 3,
		});
		expect(selectSeerrMapping("movie", input)).toEqual({ kind: "missing" });
	});

	it("uses only an ID-matched unique Sonarr scope", () => {
		const scoped = createMappingRecord({
			tvdbShow: [{ id: tvdb(7), seasons: [1, 2] }],
		});
		expect(selectArrMapping("sonarr", records({ direct: scoped }))).toEqual({
			kind: "mapped",
			source: "upstream",
			providerId: tvdb(7),
		});
		const mismatched = {
			...scoped,
			scopes: { tvdbShow: { id: tvdb(8), seasons: [4] } },
		};
		expect(selectArrMapping("sonarr", records({ direct: mismatched }))).toEqual(
			{
				kind: "mapped",
				source: "upstream",
				providerId: tvdb(7),
			},
		);
	});
});
