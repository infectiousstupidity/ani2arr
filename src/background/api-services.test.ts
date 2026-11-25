/** Tests for background API service cache and revision workflows. */
// src/background/api-services.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { maintenanceHandlers } from "@/rpc/handlers/maintenance.handlers";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId } from "@/providers/schemas";
import { bumpMappingsRevision } from "@/rpc/revision-signals";
import { createDefaultExtensionOptions } from "@/settings/schema";
import { commitProviderConnection } from "./connection-workflows";
import {
	anilistMetadataStore,
	clearPersistentCaches,
	radarrLibrary,
	mappingService,
	resetExtensionState,
	scheduleLibraryRefresh,
	sonarrLibrary,
} from "./api-services";

const clearAutoResultsMock = vi.hoisted(() => vi.fn());
const clearManualFactsMock = vi.hoisted(() => vi.fn());
const clearUpstreamMappingsMock = vi.hoisted(() => vi.fn());
const refreshUpstreamMappingsMock = vi.hoisted(() => vi.fn());
const consolidateMappingAliasesMock = vi.hoisted(() => vi.fn());
const saveProviderConnectionSnapshotMock = vi.hoisted(() => vi.fn());
const clearAllTtlCachesMock = vi.hoisted(() => vi.fn());
const getExtensionOptionsSnapshotMock = vi.hoisted(() => vi.fn());
const resetAllSettingsSnapshotMock = vi.hoisted(() => vi.fn());
const resetAllRevisionsMock = vi.hoisted(() => vi.fn());
const clearLocalCacheMock = vi.hoisted(() => vi.fn());
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
	refreshUpstreamMappings: refreshUpstreamMappingsMock,
}));

vi.mock("@/mapping/migrate", () => ({
	consolidateMappingAliases: consolidateMappingAliasesMock,
}));

vi.mock("@/providers/seerr/csrf-token", () => ({
	getSeerrXsrfToken: vi.fn(),
}));

vi.mock("@/settings/store", () => ({
	getExtensionOptionsSnapshot: getExtensionOptionsSnapshotMock,
	resetAllSettingsSnapshot: resetAllSettingsSnapshotMock,
	saveProviderConnectionSnapshot: saveProviderConnectionSnapshotMock,
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
		resetAllSettingsSnapshotMock.mockResolvedValue(
			createDefaultExtensionOptions(),
		);
		refreshUpstreamMappingsMock.mockResolvedValue(false);
		resetAllRevisionsMock.mockImplementation(async () => {});
		clearLocalCacheMock.mockImplementation(async () => {});
		vi.spyOn(browser.permissions, "remove").mockResolvedValue(false as never);
		vi.spyOn(browser.permissions, "contains").mockResolvedValue(false as never);
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
		"does not bump the revision for a Seerr miss when stored is %s",
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
			expect(bumpMappingsRevision).not.toHaveBeenCalled();
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

	it("clears auto mappings and reports success when permissions are already absent", async () => {
		const options = createDefaultExtensionOptions();
		options.providers.sonarr.url = "https://arr.example/sonarr";
		resetAllSettingsSnapshotMock.mockResolvedValue(options);

		await expect(maintenanceHandlers.resetExtensionState()).resolves.toEqual({
			ok: true,
			permissionsCleared: true,
		});

		expect(clearManualFactsMock).toHaveBeenCalledTimes(1);
		expect(clearAutoResultsMock).toHaveBeenCalledOnce();
		expect(clearAutoResultsMock).toHaveBeenCalledWith();
		expect(sonarrLibrary.clearSeriesSnapshotCache).toHaveBeenCalledTimes(1);
		expect(radarrLibrary.clearMovieSnapshotCache).toHaveBeenCalledTimes(1);
		expect(resetAllSettingsSnapshotMock).toHaveBeenCalledTimes(1);
	});

	it.each(["host", "cookies"])(
		"reports incomplete %s cleanup after a successful local reset",
		async (failure) => {
			const options = createDefaultExtensionOptions();
			options.providers.sonarr.url = "https://arr.example/sonarr";
			options.providers.radarr.url = "https://arr.example/radarr";
			resetAllSettingsSnapshotMock.mockResolvedValue(options);
			vi.mocked(browser.permissions.remove).mockImplementation(
				async (permission) => {
					if (failure === "cookies" && permission.permissions)
						throw new Error("browser error");
					return failure !== "host" || !permission.origins;
				},
			);
			vi.mocked(browser.permissions.contains).mockResolvedValue(true as never);

			await expect(maintenanceHandlers.resetExtensionState()).resolves.toEqual({
				ok: true,
				permissionsCleared: false,
			});
			expect(resetAllSettingsSnapshotMock).toHaveBeenCalledOnce();
			expect(browser.permissions.remove).toHaveBeenCalledTimes(2);
			expect(browser.permissions.remove).toHaveBeenCalledWith({
				origins: ["https://arr.example/*"],
			});
			expect(browser.permissions.remove).toHaveBeenCalledWith({
				permissions: ["cookies"],
			});
		},
	);

	it("does not broadcast an automatic mapping revision queued before reset", async () => {
		vi.useFakeTimers();
		await seerrSetterAdapterMock(
			0,
			{ source: "anilist", id: parseAniListId(2) },
			"movie",
			{
				kind: "mapped",
				target: { mediaType: "movie", tmdbId: parseTmdbId(20) },
			},
		);

		await resetExtensionState();
		await vi.runAllTimersAsync();
		expect(bumpMappingsRevision).not.toHaveBeenCalled();
	});

	it("does not save an Arr connection whose settings read straddles reset", async () => {
		const options = createDefaultExtensionOptions();
		const staleRead = Promise.withResolvers<typeof options>();
		getExtensionOptionsSnapshotMock.mockReturnValueOnce(staleRead.promise);
		const save = commitProviderConnection("sonarr", {
			url: "https://arr.example",
			apiKey: "key",
		});

		await resetExtensionState();
		staleRead.resolve(options);
		await expect(save).rejects.toThrow(
			"Connection save interrupted by extension reset.",
		);
		expect(saveProviderConnectionSnapshotMock).not.toHaveBeenCalled();
	});

	it("skips late refresh effects when reset interrupts connection warming", async () => {
		const options = createDefaultExtensionOptions();
		const credentials = { url: "https://arr.example", apiKey: "key" };
		Object.assign(options.providers.sonarr, credentials);
		saveProviderConnectionSnapshotMock.mockResolvedValue(options);
		const started = Promise.withResolvers<void>();
		const aliasConsolidation = Promise.withResolvers<void>();
		refreshUpstreamMappingsMock.mockResolvedValueOnce(true);
		consolidateMappingAliasesMock.mockImplementationOnce(() => {
			started.resolve();
			return aliasConsolidation.promise;
		});
		const save = commitProviderConnection("sonarr", credentials);
		await started.promise;

		await resetExtensionState();
		aliasConsolidation.resolve();
		await save;
		expect(bumpMappingsRevision).not.toHaveBeenCalled();
		expect(sonarrLibrary.refreshSeriesSnapshots).not.toHaveBeenCalled();
	});

	it("does not refresh an Arr library using settings read before reset", async () => {
		vi.useFakeTimers();
		const options = createDefaultExtensionOptions();
		options.providers.sonarr.url = "https://arr.example";
		options.providers.sonarr.apiKey = "key";
		const staleRead = Promise.withResolvers<typeof options>();
		getExtensionOptionsSnapshotMock.mockReturnValueOnce(staleRead.promise);
		scheduleLibraryRefresh("sonarr");
		await vi.advanceTimersByTimeAsync(15_000);
		expect(getExtensionOptionsSnapshotMock).toHaveBeenCalledOnce();

		await resetExtensionState();
		staleRead.resolve(options);
		await vi.runAllTimersAsync();
		expect(sonarrLibrary.refreshSeriesSnapshots).not.toHaveBeenCalled();
	});
});
