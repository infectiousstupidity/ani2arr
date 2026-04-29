/** Tests current provider mapping projection from provider status responses. */
// src/features/media-modal/mapping-search/current-mapping.test.ts

import { parseRadarrMovieId, parseTmdbId, parseTvdbId, type RadarrMovieSnapshot } from "@/providers";
import type {
  CheckMovieStatusResponse,
  CheckSeriesStatusResponse,
} from "@/rpc/types";
import { describe, expect, it } from "vitest";
import { deriveCurrentMapping } from "./current-mapping";

const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const radarrMovieId = parseRadarrMovieId;

describe("deriveCurrentMapping", () => {
  it("uses the provider status id when available", () => {
    const status: CheckMovieStatusResponse = {
      providerId: tmdb(456),
      providerMappingState: "mapped",
      isInLibrary: true,
      movie: {
        id: radarrMovieId(1),
        tmdbId: tmdb(456),
        title: "Provider Movie",
      } satisfies RadarrMovieSnapshot,
      linkedAniListIds: [100],
    };

    const mapping = deriveCurrentMapping({
      provider: "radarr",
      baseUrl: "https://radarr.example",
      fallbackProviderId: tmdb(123),
      fallbackTitle: "Fallback Title",
      status,
    });

    expect(mapping).toMatchObject({
      provider: "radarr",
      providerId: 456,
      title: "Provider Movie (TMDB 456)",
      isInLibrary: true,
      linkedAniListIds: [100],
    });
  });

  it("falls back to the launcher provider id when status has no mapping id", () => {
    const status: CheckSeriesStatusResponse = {
      providerId: null,
      providerMappingState: "unmapped",
      isInLibrary: false,
      linkedAniListIds: [],
    };

    const mapping = deriveCurrentMapping({
      provider: "sonarr",
      baseUrl: "https://sonarr.example",
      fallbackProviderId: tvdb(789),
      fallbackTitle: "AniList Title",
      status,
    });

    expect(mapping).toMatchObject({
      provider: "sonarr",
      providerId: 789,
      title: "AniList Title (TVDB 789)",
      isInLibrary: false,
    });
  });
});
