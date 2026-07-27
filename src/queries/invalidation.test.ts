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
} from "./invalidation";
import { queryKeys } from "./query-keys";

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
			queryKeys.providerMediaStatus("radarr", {
				source,
				title: "Title A",
			}),
			queryKeys.providerMediaStatus("radarr", {
				source,
				title: "Title B",
			}),
			queryKeys.mappings(),
			queryKeys.mappingIdentities([aid(21)]),
			queryKeys.mappingInspection("radarr", source),
			queryKeys.providerLookup("radarr", "test"),
			queryKeys.seerrTargets([aid(21)]),
			queryKeys.seerrLinkedAniListEntries({
				mediaType: "movie",
				tmdbId: tmdb(100),
			}),
		];
		const unaffected = [
			queryKeys.providerMediaStatus("sonarr", {
				source,
			}),
			queryKeys.providerMediaStatus("radarr", {
				anilistId: aid(22),
			}),
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
			queryKeys.mappingInspection("sonarr", aid(1)),
			queryKeys.mappingIdentities([aid(1)]),
			queryKeys.seerrTargets([aid(1)]),
			queryKeys.seerrLinkedAniListEntries({
				mediaType: "tv",
				tmdbId: tmdb(100),
			}),
			queryKeys.providerMediaStatus("sonarr", {
				anilistId: aid(1),
			}),
			queryKeys.providerMediaStatus("radarr", {
				anilistId: aid(1),
			}),
			queryKeys.providerLookup("sonarr", "test"),
			queryKeys.providerLookup("radarr", "test"),
		];

		seed(client, affected);
		invalidateAfterMappingsRevision(client);

		expect(affected.every((key) => isInvalidated(client, key))).toBe(true);
	});
});
