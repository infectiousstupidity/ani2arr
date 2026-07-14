/** Tests for shared React Query invalidation helpers and prefix safety. */
// src/queries/invalidation.test.ts

import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { AniListId } from "@/anilist/types";
import {
	invalidateAfterMappingChange,
	invalidateAfterMappingsRevision,
	invalidateAfterProviderLibraryChange,
	resetAfterProviderConnectionChange,
} from "@/queries/invalidation";
import { queryKeys } from "@/queries/query-keys";

const aid = (value: number): AniListId => value as AniListId;

const createQueryClient = (): QueryClient =>
	new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

const seed = (queryClient: QueryClient, queryKey: QueryKey): void => {
	queryClient.setQueryData(queryKey, { ok: true });
};

const isInvalidated = (
	queryClient: QueryClient,
	queryKey: QueryKey,
): boolean => queryClient.getQueryState(queryKey)?.isInvalidated === true;

describe("query invalidation helpers", () => {
	it("removes all provider-root queries on provider reset", () => {
		const queryClient = createQueryClient();
		const sonarrStatus = queryKeys.providerMediaStatus("sonarr", {
			anilistId: aid(1),
		});
		const sonarrLookup = queryKeys.providerLookup("sonarr", "test");
		const radarrStatus = queryKeys.providerMediaStatus("radarr", {
			anilistId: aid(1),
		});
		seed(queryClient, sonarrStatus);
		seed(queryClient, sonarrLookup);
		seed(queryClient, radarrStatus);

		resetAfterProviderConnectionChange(queryClient, "sonarr");

		expect(queryClient.getQueryData(sonarrStatus)).toBeUndefined();
		expect(queryClient.getQueryData(sonarrLookup)).toBeUndefined();
		expect(queryClient.getQueryData(radarrStatus)).toEqual({ ok: true });
	});

	it("invalidates the relevant provider caches for mapping changes", () => {
		const queryClient = createQueryClient();
		const changedStatus = queryKeys.providerMediaStatus("sonarr", {
			anilistId: aid(1),
			title: "A",
		});
		const changedStatusVariant = queryKeys.providerMediaStatus("sonarr", {
			anilistId: aid(1),
			title: "B",
		});
		const otherProviderStatus = queryKeys.providerMediaStatus("radarr", {
			anilistId: aid(1),
		});
		const otherItemStatus = queryKeys.providerMediaStatus("sonarr", {
			anilistId: aid(2),
		});
		const mappings = queryKeys.mappings();
		const identities = queryKeys.mappingIdentities([aid(1)]);
		const inspection = queryKeys.mappingInspection("sonarr", aid(1));
		const changedProviderLookup = queryKeys.providerLookup("sonarr", "test");
		const otherProviderLookup = queryKeys.providerLookup("radarr", "test");
		for (const queryKey of [
			changedStatus,
			changedStatusVariant,
			otherProviderStatus,
			otherItemStatus,
			mappings,
			identities,
			inspection,
			changedProviderLookup,
			otherProviderLookup,
		]) {
			seed(queryClient, queryKey);
		}

		invalidateAfterMappingChange(queryClient, {
			provider: "sonarr",
			anilistId: aid(1),
		});

		expect(isInvalidated(queryClient, changedStatus)).toBe(true);
		expect(isInvalidated(queryClient, changedStatusVariant)).toBe(true);
		expect(isInvalidated(queryClient, mappings)).toBe(true);
		expect(isInvalidated(queryClient, identities)).toBe(true);
		expect(isInvalidated(queryClient, inspection)).toBe(true);
		expect(isInvalidated(queryClient, changedProviderLookup)).toBe(true);
		expect(isInvalidated(queryClient, otherProviderStatus)).toBe(false);
		expect(isInvalidated(queryClient, otherItemStatus)).toBe(false);
		expect(isInvalidated(queryClient, otherProviderLookup)).toBe(false);
	});

	it("invalidates mapping roots and all provider statuses for mapping revisions", () => {
		const queryClient = createQueryClient();
		const mappings = queryKeys.mappings();
		const inspection = queryKeys.mappingInspection("sonarr", aid(1));
		const identities = queryKeys.mappingIdentities([aid(1)]);
		const sonarrStatus = queryKeys.providerMediaStatus("sonarr", {
			anilistId: aid(1),
		});
		const radarrStatus = queryKeys.providerMediaStatus("radarr", {
			anilistId: aid(1),
		});
		const sonarrLookup = queryKeys.providerLookup("sonarr", "test");
		for (const queryKey of [
			mappings,
			inspection,
			identities,
			sonarrStatus,
			radarrStatus,
			sonarrLookup,
		]) {
			seed(queryClient, queryKey);
		}

		invalidateAfterMappingsRevision(queryClient);

		expect(isInvalidated(queryClient, mappings)).toBe(true);
		expect(isInvalidated(queryClient, inspection)).toBe(true);
		expect(isInvalidated(queryClient, identities)).toBe(true);
		expect(isInvalidated(queryClient, sonarrStatus)).toBe(true);
		expect(isInvalidated(queryClient, radarrStatus)).toBe(true);
		expect(isInvalidated(queryClient, sonarrLookup)).toBe(false);
	});

	it("invalidates provider library-dependent queries for library changes", () => {
		const queryClient = createQueryClient();
		const sonarrStatus = queryKeys.providerMediaStatus("sonarr", {
			anilistId: aid(1),
		});
		const sonarrLookup = queryKeys.providerLookup("sonarr", "test");
		const mappings = queryKeys.mappings();
		const radarrStatus = queryKeys.providerMediaStatus("radarr", {
			anilistId: aid(1),
		});
		for (const queryKey of [sonarrStatus, sonarrLookup, mappings, radarrStatus]) {
			seed(queryClient, queryKey);
		}

		invalidateAfterProviderLibraryChange(queryClient, "sonarr");

		expect(isInvalidated(queryClient, sonarrStatus)).toBe(true);
		expect(isInvalidated(queryClient, sonarrLookup)).toBe(true);
		expect(isInvalidated(queryClient, mappings)).toBe(true);
		expect(isInvalidated(queryClient, radarrStatus)).toBe(false);
	});
});
