/** Tests for background API service cache and revision workflows. */
// src/background/api-services.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
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
	getSeerrAutoResult: vi.fn(),
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
	bumpMappingsRevision: vi.fn(),
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
		setSeerrAutoResultMock.mockResolvedValue(true);
		automaticResolverMock.mockResolvedValue(true);
		vi.spyOn(sonarrLibrary, "clearSeriesSnapshotCache").mockResolvedValue();
		vi.spyOn(sonarrLibrary, "refreshSeriesSnapshots").mockResolvedValue([]);
		vi.spyOn(radarrLibrary, "clearMovieSnapshotCache").mockResolvedValue();
		vi.spyOn(radarrLibrary, "refreshMovieSnapshots").mockResolvedValue([]);
	});

	it.each([false, true])(
		"bumps the Arr mapping revision only when stored is %s",
		async (stored) => {
			automaticResolverMock.mockResolvedValue(stored);

			await mappingService.resolveMapping(
				"radarr",
				{ source: "anilist", id: parseAniListId(1) },
				{ title: "Perfect Blue" },
			);

			expect(bumpMappingsRevision).toHaveBeenCalledTimes(stored ? 1 : 0);
		},
	);

	it.each([false, true])(
		"bumps the Seerr mapping revision only when stored is %s",
		async (stored) => {
			setSeerrAutoResultMock.mockResolvedValue(stored);

			await seerrSetterAdapterMock(
				0,
				{ source: "anilist", id: parseAniListId(2) },
				"movie",
				{ kind: "unmapped" },
			);

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
