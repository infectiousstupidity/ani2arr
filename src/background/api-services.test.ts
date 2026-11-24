/** Tests for background API service cache and revision workflows. */
// src/background/api-services.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId } from "@/providers/schemas";
import { bumpMappingsRevision } from "@/rpc/revision-signals";
import { createDefaultExtensionOptions } from "@/settings/schema";
import {
	anilistMetadataStore,
	clearPersistentCaches,
	radarrLibrary,
	mappingService,
	resetExtensionState,
	sonarrLibrary,
} from "./api-services";

const clearAutoResultsMock = vi.hoisted(() => vi.fn());
const clearManualFactsMock = vi.hoisted(() => vi.fn());
const clearUpstreamMappingsMock = vi.hoisted(() => vi.fn());
const clearAllTtlCachesMock = vi.hoisted(() => vi.fn());
const getExtensionOptionsSnapshotMock = vi.hoisted(() => vi.fn());
const resetAllSettingsSnapshotMock = vi.hoisted(() => vi.fn());
const resetAllRevisionsMock = vi.hoisted(() => vi.fn());
const clearLocalCacheMock = vi.hoisted(() => vi.fn());
const removeSeerrCsrfCookiePermissionMock = vi.hoisted(() => vi.fn());
const getSeerrAutoResultMock = vi.hoisted(() => vi.fn());
const setSeerrAutoResultMock = vi.hoisted(() => vi.fn());
const automaticResolverMock = vi.hoisted(() => vi.fn());
const seerrSetterAdapterMock = vi.hoisted(() => vi.fn());
const arrResolverAdapterMock = vi.hoisted(() => vi.fn());

vi.mock("@/anilist/metadata.store", () => ({
	AniListMetadataStore: vi.fn(function AniListMetadataStore() {
		return {
			clearLocalCache: clearLocalCacheMock,
		};
	}),
}));

vi.mock("@/mapping/auto.store", () => ({
	captureAutomaticWriteToken: vi.fn(() => 0),
	clearAutoResults: clearAutoResultsMock,
	getSeerrAutoResult: getSeerrAutoResultMock,
	setSeerrAutoResult: setSeerrAutoResultMock,
}));

vi.mock("@/mapping/resolve/resolve", () => ({
	createAutomaticResolver: vi.fn(() => automaticResolverMock),
}));

vi.mock("@/mapping/resolve/seerr-auto-resolver", () => ({
	createSeerrAutoResolver: vi.fn((dependencies) => {
		seerrSetterAdapterMock.mockImplementation(dependencies.setAutoResult);
		return vi.fn();
	}),
}));

vi.mock("@/mapping/manual.store", () => ({
	clearManualFacts: clearManualFactsMock,
}));

vi.mock("@/mapping/mapping.service", () => ({
	MappingService: vi.fn(function MappingService(resolveAutomaticMapping) {
		arrResolverAdapterMock.mockImplementation(resolveAutomaticMapping);
		return {
			getMapping: vi.fn(),
			getSeerrTarget: vi.fn(),
			resolveMapping: vi.fn((provider, identity) =>
				arrResolverAdapterMock({
					writeToken: 0,
					provider,
					identity,
					anilistId: identity.source === "anilist" ? identity.id : null,
					rejectedProviderIds: [],
				}),
			),
		};
	}),
}));

vi.mock("@/mapping/upstream.store", () => ({
	clearUpstreamMappings: clearUpstreamMappingsMock,
}));

vi.mock("@/providers/seerr/csrf-token", () => ({
	getSeerrXsrfToken: vi.fn(),
}));

vi.mock("@/settings/provider-permissions", () => ({
	removeSeerrCsrfCookiePermission: removeSeerrCsrfCookiePermissionMock,
}));

vi.mock("@/settings/store", () => ({
	getExtensionOptionsSnapshot: getExtensionOptionsSnapshotMock,
	resetAllSettingsSnapshot: resetAllSettingsSnapshotMock,
}));

vi.mock("@/shared/cache/ttl-cache", () => ({
	clearAllTtlCaches: clearAllTtlCachesMock,
	createTtlCache: () => ({
		read: vi.fn(),
		remove: vi.fn(),
		write: vi.fn(),
	}),
}));

vi.mock("@/rpc/revision-signals", () => ({
	bumpMappingsRevision: vi.fn().mockResolvedValue("revision"),
	bumpProviderLibraryRevision: vi.fn(),
	resetAllRevisions: resetAllRevisionsMock,
}));

describe("api services", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		clearAutoResultsMock.mockImplementation(async () => {});
		clearManualFactsMock.mockImplementation(async () => {});
		clearUpstreamMappingsMock.mockImplementation(async () => {});
		clearAllTtlCachesMock.mockImplementation(async () => {});
		getExtensionOptionsSnapshotMock.mockResolvedValue(
			createDefaultExtensionOptions(),
		);
		resetAllSettingsSnapshotMock.mockImplementation(async () => {});
		resetAllRevisionsMock.mockImplementation(async () => {});
		clearLocalCacheMock.mockImplementation(async () => {});
		removeSeerrCsrfCookiePermissionMock.mockImplementation(async () => {});
		getSeerrAutoResultMock.mockResolvedValue(null);
		setSeerrAutoResultMock.mockResolvedValue(true);
		automaticResolverMock.mockResolvedValue(true);
		vi.mocked(mappingService.getMapping).mockResolvedValue({
			kind: "unmapped",
			hadResolveAttempt: true,
		});
		vi.spyOn(sonarrLibrary, "clearSeriesSnapshotCache").mockResolvedValue();
		vi.spyOn(sonarrLibrary, "refreshSeriesSnapshots").mockResolvedValue([]);
		vi.spyOn(radarrLibrary, "clearMovieSnapshotCache").mockResolvedValue();
		vi.spyOn(radarrLibrary, "refreshMovieSnapshots").mockResolvedValue([]);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("coalesces stored Arr and Seerr matches into one trailing revision", async () => {
		vi.useFakeTimers();
		vi.mocked(mappingService.getMapping).mockResolvedValue({
			kind: "mapped",
			source: "auto",
			providerId: 10,
		});

		await mappingService.resolveMapping(
			"radarr",
			{ source: "anilist", id: parseAniListId(1) },
			parseAniListId(1),
			{ title: "Perfect Blue" },
		);
		await vi.advanceTimersByTimeAsync(500);
		await seerrSetterAdapterMock(
			0,
			{ source: "anilist", id: parseAniListId(2) },
			"movie",
			{
				kind: "mapped",
				target: { mediaType: "movie", tmdbId: parseTmdbId(20) },
			},
		);

		await vi.advanceTimersByTimeAsync(999);
		expect(bumpMappingsRevision).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(bumpMappingsRevision).toHaveBeenCalledOnce();
		// The bump names the changed entries so tabs refetch only those cards.
		expect(bumpMappingsRevision).toHaveBeenCalledWith([
			parseAniListId(1),
			parseAniListId(2),
		]);
	});

	it("does not bump the revision for stored Arr and Seerr misses", async () => {
		vi.useFakeTimers();

		await mappingService.resolveMapping(
			"radarr",
			{ source: "anilist", id: parseAniListId(1) },
			parseAniListId(1),
		);
		await seerrSetterAdapterMock(
			0,
			{ source: "anilist", id: parseAniListId(2) },
			"movie",
			{ kind: "unmapped" },
		);

		await vi.runAllTimersAsync();
		expect(bumpMappingsRevision).not.toHaveBeenCalled();
	});

	it.each([false, true])(
		"bumps the revision for a removed Seerr match only when stored is %s",
		async (stored) => {
			vi.useFakeTimers();
			getSeerrAutoResultMock.mockResolvedValue({
				kind: "mapped",
				target: { mediaType: "movie", tmdbId: parseTmdbId(20) },
			});
			setSeerrAutoResultMock.mockResolvedValue(stored);

			await seerrSetterAdapterMock(
				0,
				{ source: "anilist", id: parseAniListId(2) },
				"movie",
				{ kind: "unmapped" },
			);

			await vi.runAllTimersAsync();
			expect(bumpMappingsRevision).toHaveBeenCalledTimes(stored ? 1 : 0);
		},
	);

	it("preserves auto mappings when clearing persistent caches", async () => {
		await clearPersistentCaches();

		expect(anilistMetadataStore.clearLocalCache).toHaveBeenCalledTimes(1);
		expect(clearLocalCacheMock).toHaveBeenCalledTimes(1);
		expect(clearUpstreamMappingsMock).toHaveBeenCalledTimes(1);
		expect(sonarrLibrary.clearSeriesSnapshotCache).toHaveBeenCalledTimes(1);
		expect(radarrLibrary.clearMovieSnapshotCache).toHaveBeenCalledTimes(1);
		expect(clearAllTtlCachesMock).toHaveBeenCalledTimes(1);
		expect(resetAllRevisionsMock).toHaveBeenCalledTimes(1);
		expect(clearAutoResultsMock).not.toHaveBeenCalled();
	});

	it("clears auto mappings only during full extension reset", async () => {
		await resetExtensionState();

		expect(clearManualFactsMock).toHaveBeenCalledTimes(1);
		expect(clearAutoResultsMock).toHaveBeenCalledOnce();
		expect(clearAutoResultsMock).toHaveBeenCalledWith();
		expect(sonarrLibrary.clearSeriesSnapshotCache).toHaveBeenCalledTimes(1);
		expect(radarrLibrary.clearMovieSnapshotCache).toHaveBeenCalledTimes(1);
		expect(resetAllSettingsSnapshotMock).toHaveBeenCalledTimes(1);
		expect(removeSeerrCsrfCookiePermissionMock).toHaveBeenCalledTimes(1);
	});
});
