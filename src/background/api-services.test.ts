/** Tests for background API service cache and revision workflows. */
// src/background/api-services.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultExtensionOptions } from "@/settings/schema";
import {
	anilistMetadataStore,
	clearPersistentCaches,
	radarrLibrary,
	resetExtensionState,
	sonarrLibrary,
} from "./api-services";

const clearAutoResultsMock = vi.hoisted(() => vi.fn());
const clearManualFactsMock = vi.hoisted(() => vi.fn());
const clearManualSeerrTargetsMock = vi.hoisted(() => vi.fn());
const clearUpstreamMappingsMock = vi.hoisted(() => vi.fn());
const clearAllTtlCachesMock = vi.hoisted(() => vi.fn());
const getExtensionOptionsSnapshotMock = vi.hoisted(() => vi.fn());
const resetAllSettingsSnapshotMock = vi.hoisted(() => vi.fn());
const resetAllRevisionsMock = vi.hoisted(() => vi.fn());
const clearLocalCacheMock = vi.hoisted(() => vi.fn());
const removeSeerrCsrfCookiePermissionMock = vi.hoisted(() => vi.fn());

vi.mock("@/anilist/metadata.store", () => ({
	AniListMetadataStore: vi.fn(function AniListMetadataStore() {
		return {
			clearLocalCache: clearLocalCacheMock,
		};
	}),
}));

vi.mock("@/mapping/auto.store", () => ({
	clearAutoResults: clearAutoResultsMock,
}));

vi.mock("@/mapping/manual.store", () => ({
	clearManualFacts: clearManualFactsMock,
}));

vi.mock("@/mapping/seerr-target.store", () => ({
	clearManualSeerrTargets: clearManualSeerrTargetsMock,
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
	bumpMappingsRevision: vi.fn(),
	bumpProviderLibraryRevision: vi.fn(),
	resetAllRevisions: resetAllRevisionsMock,
}));

describe("api services", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		clearAutoResultsMock.mockImplementation(async () => {});
		clearManualFactsMock.mockImplementation(async () => {});
		clearManualSeerrTargetsMock.mockImplementation(async () => {});
		clearUpstreamMappingsMock.mockImplementation(async () => {});
		clearAllTtlCachesMock.mockImplementation(async () => {});
		getExtensionOptionsSnapshotMock.mockResolvedValue(
			createDefaultExtensionOptions(),
		);
		resetAllSettingsSnapshotMock.mockImplementation(async () => {});
		resetAllRevisionsMock.mockImplementation(async () => {});
		clearLocalCacheMock.mockImplementation(async () => {});
		removeSeerrCsrfCookiePermissionMock.mockImplementation(async () => {});
		vi.spyOn(sonarrLibrary, "clearSeriesSnapshotCache").mockResolvedValue();
		vi.spyOn(sonarrLibrary, "refreshSeriesSnapshots").mockResolvedValue([]);
		vi.spyOn(radarrLibrary, "clearMovieSnapshotCache").mockResolvedValue();
		vi.spyOn(radarrLibrary, "refreshMovieSnapshots").mockResolvedValue([]);
	});

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
		expect(clearManualSeerrTargetsMock).toHaveBeenCalledTimes(1);
		expect(clearAutoResultsMock).toHaveBeenCalledTimes(2);
		expect(clearAutoResultsMock).toHaveBeenCalledWith("sonarr");
		expect(clearAutoResultsMock).toHaveBeenCalledWith("radarr");
		expect(sonarrLibrary.clearSeriesSnapshotCache).toHaveBeenCalledTimes(1);
		expect(radarrLibrary.clearMovieSnapshotCache).toHaveBeenCalledTimes(1);
		expect(resetAllSettingsSnapshotMock).toHaveBeenCalledTimes(1);
		expect(removeSeerrCsrfCookiePermissionMock).toHaveBeenCalledTimes(1);
	});
});
