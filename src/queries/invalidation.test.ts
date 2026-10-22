/** Critical React Query invalidation tests. */
// src/queries/invalidation.test.ts

import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId } from "@/providers/schemas";
import {
	invalidateAfterMappingChange,
	invalidateAfterMappingsRevision,
	invalidateAfterProviderLibraryChange,
	invalidateAfterSeerrRequest,
} from "./invalidation";
import {
	normalizeMappingInspectionRequest,
	normalizeProviderLookupRequest,
	normalizeRadarrStatusRequest,
	normalizeSeerrMediaStatusRequest,
	normalizeSonarrStatusRequest,
	queryKeys,
} from "./query-keys";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;

function createClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});
}

function seed(client: QueryClient, keys: readonly QueryKey[]): void {
	for (const key of keys) {
		client.setQueryData(key, true);
	}
}

function isInvalidated(client: QueryClient, key: QueryKey): boolean {
	return client.getQueryState(key)?.isInvalidated === true;
}

describe("query invalidation", () => {
	it("invalidates one Radarr source and its dependent caches", () => {
		const client = createClient();
		const source = {
			source: "mal",
			id: mal(5114),
		} as const;

		const affected = [
			queryKeys.providerMediaStatus(
				"radarr",
				normalizeRadarrStatusRequest({ source, title: "Title A" }),
			),
			queryKeys.providerMediaStatus(
				"radarr",
				normalizeRadarrStatusRequest({ source, title: "Title B" }),
			),
			queryKeys.mappings(),
			queryKeys.mappingIdentities([aid(21)]),
			queryKeys.mappingInspection(
				normalizeMappingInspectionRequest("radarr", { source }),
			),
			queryKeys.providerLookup(
				"radarr",
				normalizeProviderLookupRequest({ term: "test" }),
			),
			queryKeys.seerrTargets([
				{ anilistId: aid(21), mediaType: "movie" },
			]),
			queryKeys.seerrLinkedAniListEntries({
				mediaType: "movie",
				tmdbId: tmdb(100),
			}),
		];
		const unaffected = [
			queryKeys.providerMediaStatus(
				"sonarr",
				normalizeSonarrStatusRequest({ source }),
			),
			queryKeys.providerMediaStatus(
				"radarr",
				normalizeRadarrStatusRequest({ anilistId: aid(22) }),
			),
		];

		seed(client, [...affected, ...unaffected]);

		invalidateAfterMappingChange(client, {
			provider: "radarr",
			source,
			anilistId: aid(21),
		});

		expect(affected.every((key) => isInvalidated(client, key))).toBe(true);
		expect(unaffected.some((key) => isInvalidated(client, key))).toBe(false);
	});

	it("invalidates all mapping-dependent caches after a revision", () => {
		const client = createClient();
		const affected = [
			queryKeys.mappings(),
			queryKeys.mappingInspection(
				normalizeMappingInspectionRequest("sonarr", aid(1)),
			),
			queryKeys.mappingIdentities([aid(1)]),
			queryKeys.seerrTargets([{ anilistId: aid(1), mediaType: "tv" }]),
			queryKeys.seerrLinkedAniListEntries({
				mediaType: "tv",
				tmdbId: tmdb(100),
			}),
			queryKeys.providerMediaStatus(
				"sonarr",
				normalizeSonarrStatusRequest({ anilistId: aid(1) }),
			),
			queryKeys.providerMediaStatus(
				"radarr",
				normalizeRadarrStatusRequest({ anilistId: aid(1) }),
			),
			queryKeys.providerLookup(
				"sonarr",
				normalizeProviderLookupRequest({ term: "test" }),
			),
			queryKeys.providerLookup(
				"radarr",
				normalizeProviderLookupRequest({ term: "test" }),
			),
		];

		seed(client, affected);
		invalidateAfterMappingsRevision(client);

		expect(affected.every((key) => isInvalidated(client, key))).toBe(true);
	});

	it("invalidates one provider's library-dependent caches", () => {
		const client = createClient();
		const affected = [
			queryKeys.providerMediaStatus(
				"sonarr",
				normalizeSonarrStatusRequest({ anilistId: aid(1) }),
			),
			queryKeys.providerLookup(
				"sonarr",
				normalizeProviderLookupRequest({ term: "test" }),
			),
			queryKeys.mappings(),
		];
		const unaffected = [
			queryKeys.providerMediaStatus(
				"radarr",
				normalizeRadarrStatusRequest({ anilistId: aid(1) }),
			),
			queryKeys.providerLookup(
				"radarr",
				normalizeProviderLookupRequest({ term: "test" }),
			),
		];

		seed(client, [...affected, ...unaffected]);
		invalidateAfterProviderLibraryChange(client, "sonarr");

		expect(affected.every((key) => isInvalidated(client, key))).toBe(true);
		expect(unaffected.some((key) => isInvalidated(client, key))).toBe(false);
	});

	it("invalidates every Seerr status scope and details for one media item", () => {
		const client = createClient();
		const statusKey = (
			mediaType: "movie" | "tv",
			tmdbId: ReturnType<typeof tmdb>,
			seasons?: number[],
		) =>
			queryKeys.seerrMediaStatus(
				normalizeSeerrMediaStatusRequest({
					mediaType,
					tmdbId,
					...(mediaType === "tv" && seasons !== undefined ? { seasons } : {}),
				}),
			);
		const affected = [
			statusKey("tv", tmdb(100)),
			statusKey("tv", tmdb(100), [1]),
			statusKey("tv", tmdb(100), [1, 2]),
			queryKeys.seerrMediaDetails({ mediaType: "tv", tmdbId: tmdb(100) }),
		];
		const unaffected = [
			statusKey("tv", tmdb(101), [1]),
			statusKey("movie", tmdb(100)),
			queryKeys.seerrMediaDetails({ mediaType: "tv", tmdbId: tmdb(101) }),
		];

		seed(client, [...affected, ...unaffected]);
		invalidateAfterSeerrRequest(client, {
			mediaType: "tv",
			tmdbId: tmdb(100),
		});

		expect(affected.every((key) => isInvalidated(client, key))).toBe(true);
		expect(unaffected.some((key) => isInvalidated(client, key))).toBe(false);
	});
});
