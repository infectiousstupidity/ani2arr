/** Tests for background API service cache and revision workflows. */
// src/background/api-services.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultExtensionOptions } from "@/settings/schema";
import type { ExtensionOptions } from "@/settings/types";
import {
	anilistMetadataStore,
	clearPersistentCaches,
	handleProviderConnectionChanged,
	radarrLibrary,
	resetExtensionState,
	sonarrLibrary,
} from "./api-services";

const clearAutoResultsMock = vi.hoisted(() => vi.fn());
const clearManualFactsMock = vi.hoisted(() => vi.fn());
const clearManualSeerrTargetsMock = vi.hoisted(() => vi.fn());
const clearUpstreamMappingsMock = vi.hoisted(() => vi.fn());
const refreshMappingPipelineMock = vi.hoisted(() => vi.fn());
const clearAllTtlCachesMock = vi.hoisted(() => vi.fn());
const getExtensionOptionsSnapshotMock = vi.hoisted(() => vi.fn());
const resetAllSettingsSnapshotMock = vi.hoisted(() => vi.fn());
const bumpMappingsRevisionMock = vi.hoisted(() => vi.fn());
const bumpProviderLibraryRevisionMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/background/mapping-refresh", () => ({
	refreshMappingPipeline: refreshMappingPipelineMock,
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

vi.mock("@/shared/sync/revisions", () => ({
	bumpMappingsRevision: bumpMappingsRevisionMock,
	bumpProviderLibraryRevision: bumpProviderLibraryRevisionMock,
	resetAllRevisions: resetAllRevisionsMock,
}));

function createOptions(input: {
	sonarrConfigured?: boolean;
	radarrConfigured?: boolean;
	seerrConfigured?: boolean;
} = {}): ExtensionOptions {
	const options = createDefaultExtensionOptions();

	return {
		...options,
		providers: {
			sonarr: {
				...options.providers.sonarr,
				url: input.sonarrConfigured ? "https://sonarr.example" : "",
				apiKey: input.sonarrConfigured ? "sonarr-key" : "",
			},
			radarr: {
				...options.providers.radarr,
				url: input.radarrConfigured ? "https://radarr.example" : "",
				apiKey: input.radarrConfigured ? "radarr-key" : "",
			},
		},
		seerr: {
			url: input.seerrConfigured ? "https://seerr.example" : "",
			auth: input.seerrConfigured
				? { mode: "apiKey", apiKey: "seerr-key" }
				: { mode: "session" },
		},
	};
}

describe("api services", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		clearAutoResultsMock.mockImplementation(async () => {});
		clearManualFactsMock.mockImplementation(async () => {});
		clearManualSeerrTargetsMock.mockImplementation(async () => {});
		clearUpstreamMappingsMock.mockImplementation(async () => {});
		refreshMappingPipelineMock.mockResolvedValue(false);
		clearAllTtlCachesMock.mockImplementation(async () => {});
		getExtensionOptionsSnapshotMock.mockResolvedValue(createOptions());
		resetAllSettingsSnapshotMock.mockImplementation(async () => {});
		bumpMappingsRevisionMock.mockResolvedValue(1);
		bumpProviderLibraryRevisionMock.mockResolvedValue(1);
		resetAllRevisionsMock.mockImplementation(async () => {});
		clearLocalCacheMock.mockImplementation(async () => {});
		removeSeerrCsrfCookiePermissionMock.mockImplementation(async () => {});
		vi.spyOn(sonarrLibrary, "clearSeriesSnapshotCache").mockResolvedValue();
		vi.spyOn(sonarrLibrary, "refreshSeriesSnapshots").mockResolvedValue([]);
		vi.spyOn(radarrLibrary, "clearMovieSnapshotCache").mockResolvedValue();
		vi.spyOn(radarrLibrary, "refreshMovieSnapshots").mockResolvedValue([]);
	});

	it("clears Radarr library state and revisions when Radarr disconnects", async () => {
		const options = createOptions();

		await handleProviderConnectionChanged(options, {
			disconnectedProviders: ["radarr"],
		});

		expect(radarrLibrary.clearMovieSnapshotCache).toHaveBeenCalledTimes(1);
		expect(radarrLibrary.refreshMovieSnapshots).not.toHaveBeenCalled();
		expect(bumpMappingsRevisionMock).toHaveBeenCalledTimes(1);
		expect(bumpProviderLibraryRevisionMock).toHaveBeenCalledWith("radarr");
		expect(clearAutoResultsMock).not.toHaveBeenCalled();
	});

	it("dedupes providers across changed and disconnected inputs", async () => {
		const options = createOptions();

		await handleProviderConnectionChanged(options, {
			changedProviders: ["sonarr"],
			disconnectedProviders: ["sonarr"],
		});

		expect(sonarrLibrary.clearSeriesSnapshotCache).toHaveBeenCalledTimes(1);
		expect(bumpProviderLibraryRevisionMock).toHaveBeenCalledTimes(1);
		expect(bumpProviderLibraryRevisionMock).toHaveBeenCalledWith("sonarr");
		expect(clearAutoResultsMock).not.toHaveBeenCalled();
	});

	it("refreshes upstream mappings when only Seerr is configured", async () => {
		const options = createOptions({ seerrConfigured: true });

		await handleProviderConnectionChanged(options, {
			disconnectedProviders: ["radarr"],
		});

		expect(refreshMappingPipelineMock).toHaveBeenCalledTimes(1);
	});

	it("does not duplicate the mapping revision after changed upstream facts", async () => {
		const options = createOptions({ seerrConfigured: true });
		refreshMappingPipelineMock.mockResolvedValueOnce(true);

		await handleProviderConnectionChanged(options, {
			changedProviders: ["sonarr"],
		});

		expect(refreshMappingPipelineMock).toHaveBeenCalledOnce();
		expect(bumpMappingsRevisionMock).not.toHaveBeenCalled();
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
