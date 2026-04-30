/** Tests for mapping-service precedence between exact truth, cached auto results, and candidate suppression. */
// src/mapping/mapping.service.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist";
import type { ProviderId } from "@/providers";
import {
	clearAutoMappingFailures,
	removeAutoMappingFailure,
	writeAutoMappingFailure,
} from "@/mapping/auto-mapping/failure.cache";
import { createError, ErrorCode } from "@/shared/errors";
import { MappingService } from "./mapping.service";

const aid = parseAniListId;

vi.mock("@/mapping/auto-mapping/failure.cache", () => ({
	clearAutoMappingFailures: vi.fn(async () => {}),
	readAutoMappingFailure: vi.fn(async () => null),
	removeAutoMappingFailure: vi.fn(async () => {}),
	writeAutoMappingFailure: vi.fn(async () => {}),
}));

vi.mock("@/debug/metrics", () => ({
	incrementCounter: vi.fn(),
}));

vi.mock("@/options", () => ({
	getExtensionOptionsSnapshot: vi.fn(async () => ({
		sonarr: { url: "http://localhost:8989", apiKey: "test-key" },
	})),
	getProviderCredentials: vi.fn(
		(
			options: { sonarr?: { url: string; apiKey: string } },
			provider: string,
		) => (provider === "sonarr" ? (options.sonarr ?? null) : null),
	),
}));

type StubManualMappings = {
	isIgnored: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	clear: ReturnType<typeof vi.fn>;
	getCandidateSuppression: ReturnType<typeof vi.fn>;
};

type StubAutoMappingStore = {
	get: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
	clear: ReturnType<typeof vi.fn>;
};

type StubAniListApi = {
	fetchMediaWithRelations: ReturnType<typeof vi.fn>;
	prioritize: ReturnType<typeof vi.fn>;
	removeMediaFromCache: ReturnType<typeof vi.fn>;
};

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	return { promise, resolve, reject };
}

const createService = () => {
	const anilistApi: StubAniListApi = {
		fetchMediaWithRelations: vi.fn(async () => {
			throw new Error("Unexpected AniList fetch");
		}),
		prioritize: vi.fn(),
		removeMediaFromCache: vi.fn(async () => {}),
	};
	const manualMappings: StubManualMappings = {
		isIgnored: vi.fn(() => false),
		get: vi.fn(() => null),
		clear: vi.fn(async () => {}),
		getCandidateSuppression: vi.fn(() => null),
	};
	const anibridgeMappingStore = {
		getSonarrCandidates: vi.fn<(anilistId: AniListId) => number[]>(() => []),
		getRadarrCandidates: vi.fn<(anilistId: AniListId) => number[]>(() => []),
		init: vi.fn(async () => {}),
	};
	const autoMappingStore: StubAutoMappingStore = {
		get: vi.fn(async () => null),
		set: vi.fn(async () => true),
		delete: vi.fn(async () => false),
		clear: vi.fn(async () => false),
	};
	const lookupClients = {
		sonarr: { reset: vi.fn(async () => {}) },
		radarr: { reset: vi.fn(async () => {}) },
	};
	const notifyMappingsChanged = vi.fn();

	const service = new MappingService(
		anilistApi as never,
		anibridgeMappingStore as never,
		lookupClients as never,
		autoMappingStore as never,
		manualMappings as never,
		notifyMappingsChanged,
	);

	return {
		anilistApi,
		service,
		manualMappings,
		anibridgeMappingStore,
		autoMappingStore,
		lookupClients,
		notifyMappingsChanged,
	};
};

describe("MappingService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("collapses a matching manual mapping into exact upstream truth", async () => {
		const { service, manualMappings, anibridgeMappingStore, autoMappingStore } =
			createService();
		manualMappings.get.mockReturnValue(222);
		anibridgeMappingStore.getSonarrCandidates.mockReturnValue([222]);

		const result = await service.resolveProviderId("sonarr", aid(1));

		expect(result).toMatchObject({ providerId: 222, reason: "exact-upstream" });
		expect(manualMappings.clear).toHaveBeenCalledWith("sonarr", 1);
		expect(autoMappingStore.set).toHaveBeenCalledWith(
			"sonarr",
			1,
			expect.objectContaining({
				state: "mapped",
				providerId: 222,
				acceptedEvidence: expect.objectContaining({
					source: "upstream",
					reason: "exact-upstream",
				}),
			}),
			expect.any(Object),
		);
	});

	it("keeps a manual mapping effective when it disagrees with exact upstream truth", async () => {
		const { service, manualMappings, anibridgeMappingStore, autoMappingStore } =
			createService();
		manualMappings.get.mockReturnValue(222);
		anibridgeMappingStore.getSonarrCandidates.mockReturnValue([999]);

		const result = await service.resolveProviderId("sonarr", aid(1));

		expect(result).toMatchObject({
			providerId: 222,
			reason: "manual-override",
		});
		expect(manualMappings.clear).not.toHaveBeenCalled();
		expect(autoMappingStore.set).not.toHaveBeenCalled();
	});

	it("does not let rejected candidates suppress exact upstream truth", async () => {
		const { service, manualMappings, anibridgeMappingStore, autoMappingStore } =
			createService();
		manualMappings.getCandidateSuppression.mockImplementation(
			(_provider: string, _anilistId: AniListId, providerId: ProviderId) =>
				providerId === 444 ? "rejected" : null,
		);
		anibridgeMappingStore.getSonarrCandidates.mockReturnValue([444]);

		const result = await service.resolveProviderId("sonarr", aid(7));

		expect(result).toMatchObject({ providerId: 444, reason: "exact-upstream" });
		expect(autoMappingStore.set).toHaveBeenCalledWith(
			"sonarr",
			7,
			expect.objectContaining({
				state: "mapped",
				providerId: 444,
				acceptedEvidence: expect.objectContaining({
					source: "upstream",
					reason: "exact-upstream",
				}),
			}),
			expect.any(Object),
		);
	});

	it("prefers exact upstream over a cached auto mapping", async () => {
		const { service, anibridgeMappingStore, autoMappingStore } =
			createService();
		anibridgeMappingStore.getSonarrCandidates.mockReturnValue([333]);
		autoMappingStore.get.mockResolvedValue({
			state: "mapped",
			providerId: 999,
			acceptedEvidence: {
				source: "auto",
				reason: "fuzzy-match",
			},
			updatedAt: 10,
		});

		const result = await service.resolveProviderId("sonarr", aid(5));

		expect(result).toMatchObject({ providerId: 333, reason: "exact-upstream" });
		expect(autoMappingStore.get).not.toHaveBeenCalled();
	});

	it("records upstream ambiguity instead of selecting one Sonarr candidate", async () => {
		const { service, anibridgeMappingStore, autoMappingStore, anilistApi } =
			createService();
		anibridgeMappingStore.getSonarrCandidates.mockReturnValue([333, 444]);

		const result = await service.resolveProviderId("sonarr", aid(6));

		expect(result).toBeNull();
		expect(autoMappingStore.set).toHaveBeenCalledWith(
			"sonarr",
			6,
			{ state: "ambiguous" },
			expect.any(Object),
		);
		expect(anilistApi.fetchMediaWithRelations).not.toHaveBeenCalled();
	});

	it("uses Radarr TMDB upstream candidates without reading Sonarr candidates", async () => {
		const { service, anibridgeMappingStore, autoMappingStore } =
			createService();
		anibridgeMappingStore.getRadarrCandidates.mockReturnValue([12_345]);

		const result = await service.resolveProviderId("radarr", aid(8));

		expect(result).toMatchObject({
			providerId: 12_345,
			reason: "exact-upstream",
		});
		expect(anibridgeMappingStore.getSonarrCandidates).not.toHaveBeenCalled();
		expect(autoMappingStore.set).toHaveBeenCalledWith(
			"radarr",
			8,
			expect.objectContaining({
				state: "mapped",
				providerId: 12_345,
				acceptedEvidence: expect.objectContaining({
					source: "upstream",
					reason: "exact-upstream",
				}),
			}),
			expect.any(Object),
		);
	});

	it("records recent evaluation trace candidates across rejected hint and accepted pipeline results", async () => {
		const manualMappings: StubManualMappings = {
			isIgnored: vi.fn(() => false),
			get: vi.fn(() => null),
			clear: vi.fn(async () => {}),
			getCandidateSuppression: vi.fn(
				(_provider: string, _anilistId: AniListId, providerId: ProviderId) =>
					providerId === 101 ? "rejected" : null,
			),
		};
		const anibridgeMappingStore = {
			getSonarrCandidates: vi.fn(() => []),
			getRadarrCandidates: vi.fn(() => []),
		};
		const autoMappingStore: StubAutoMappingStore = {
			get: vi.fn(async () => null),
			set: vi.fn(async () => true),
			delete: vi.fn(async () => false),
			clear: vi.fn(async () => false),
		};
		const lookupClient = {
			provider: "sonarr" as const,
			reset: vi.fn(async () => {}),
			readCachedTitleLookup: vi.fn(async () => ({ results: [], hit: "none" as const })),
			lookupTitle: vi.fn(async (term: { display: string }) => {
				if (term.display === "Rejected Hint") {
					return [{ title: "Rejected Hint", tvdbId: 101, year: 2013 }];
				}
				return [
					{ title: "Attack on Titan", tvdbId: 202, year: 2013 },
					{ title: "Attack Titan", tvdbId: 303, year: 2013 },
				];
			}),
			readProviderId: vi.fn(
				(result: { tvdbId?: number }) => result.tvdbId ?? null,
			),
		};

		const service = new MappingService(
			{
				fetchMediaWithRelations: vi.fn(async () => ({
					id: aid(77),
					format: "TV",
					title: { english: "Attack on Titan" },
					synonyms: [],
					startDate: { year: 2013 },
				})),
				iteratePrequelChain: async function* () {
					yield* [];
				},
			} as never,
			anibridgeMappingStore as never,
			{
				sonarr: lookupClient,
				radarr: { reset: vi.fn(async () => {}) },
			} as never,
			autoMappingStore as never,
			manualMappings as never,
		);

		const result = await service.resolveProviderId("sonarr", aid(77), {
			hints: {
				primaryTitle: "Rejected Hint",
			},
		});

		expect(result).toMatchObject({
			providerId: 202,
			reason: "exact-title-match",
		});
		expect(autoMappingStore.set).toHaveBeenCalledWith(
			"sonarr",
			77,
			expect.objectContaining({
				state: "mapped",
				providerId: 202,
				acceptedEvidence: expect.objectContaining({
					source: "auto",
					reason: "exact-title-match",
				}),
				recentEvaluation: expect.objectContaining({
					searchTerms: ["Rejected Hint", "Attack on Titan"],
					candidates: expect.arrayContaining([
						expect.objectContaining({ providerId: 101, status: "rejected" }),
						expect.objectContaining({ providerId: 202, status: "accepted" }),
						expect.objectContaining({
							providerId: 303,
							status: "not-accepted",
						}),
					]),
				}),
			}),
			expect.any(Object),
		);
	});

	it("resolves from metadata hints before fetching AniList media", async () => {
		const manualMappings: StubManualMappings = {
			isIgnored: vi.fn(() => false),
			get: vi.fn(() => null),
			clear: vi.fn(async () => {}),
			getCandidateSuppression: vi.fn(() => null),
		};
		const anibridgeMappingStore = {
			getSonarrCandidates: vi.fn(() => []),
			getRadarrCandidates: vi.fn(() => []),
		};
		const autoMappingStore: StubAutoMappingStore = {
			get: vi.fn(async () => null),
			set: vi.fn(async () => true),
			delete: vi.fn(async () => false),
			clear: vi.fn(async () => false),
		};
		const fetchMediaWithRelations = vi.fn(async () => {
			throw new Error("Unexpected AniList fetch");
		});
		const lookupClient = {
			provider: "sonarr" as const,
			reset: vi.fn(async () => {}),
			readCachedTitleLookup: vi.fn(async () => ({ results: [], hit: "none" as const })),
			lookupTitle: vi.fn(async () => [
				{ title: "Attack on Titan", tvdbId: 202, year: 2013 },
			]),
			readProviderId: vi.fn(
				(result: { tvdbId?: number }) => result.tvdbId ?? null,
			),
		};

		const service = new MappingService(
			{
				fetchMediaWithRelations,
				iteratePrequelChain: async function* () {
					yield* [];
				},
			} as never,
			anibridgeMappingStore as never,
			{
				sonarr: lookupClient,
				radarr: { reset: vi.fn(async () => {}) },
			} as never,
			autoMappingStore as never,
			manualMappings as never,
		);

		const result = await service.resolveProviderId("sonarr", aid(77), {
			hints: {
				domMedia: {
					titles: { english: "Attack on Titan" },
					startYear: 2013,
					format: "TV",
				},
			},
		});

		expect(result).toMatchObject({
			providerId: 202,
			reason: "exact-title-match",
		});
		expect(fetchMediaWithRelations).not.toHaveBeenCalled();
	});

	it("does not reuse a default in-flight request for force lookups", async () => {
		const manualMappings: StubManualMappings = {
			isIgnored: vi.fn(() => false),
			get: vi.fn(() => null),
			clear: vi.fn(async () => {}),
			getCandidateSuppression: vi.fn(() => null),
		};
		const anibridgeMappingStore = {
			getSonarrCandidates: vi.fn(() => []),
			getRadarrCandidates: vi.fn(() => []),
		};
		const autoMappingStore: StubAutoMappingStore = {
			get: vi.fn(async () => null),
			set: vi.fn(async () => true),
			delete: vi.fn(async () => false),
			clear: vi.fn(async () => false),
		};
		const defaultMedia = {
			id: aid(78),
			format: "TV",
			title: { english: "Default Result" },
			synonyms: [],
		};
		const forceMedia = {
			id: aid(78),
			format: "TV",
			title: { english: "Force Result" },
			synonyms: [],
		};
		const defaultFetch = createDeferred<typeof defaultMedia>();
		let fetchCount = 0;
		const fetchMediaWithRelations = vi.fn(async () => {
			fetchCount += 1;
			if (fetchCount === 1) {
				return defaultFetch.promise;
			}
			return forceMedia;
		});
		const lookupClient = {
			provider: "sonarr" as const,
			reset: vi.fn(async () => {}),
			readCachedTitleLookup: vi.fn(async () => ({
				results: [],
				hit: "none" as const,
			})),
			lookupTitle: vi.fn(async (term: { display: string }) => {
				if (term.display === "Default Result") {
					return [{ title: "Default Result", tvdbId: 101, year: 2020 }];
				}
				if (term.display === "Force Result") {
					return [{ title: "Force Result", tvdbId: 202, year: 2020 }];
				}
				return [];
			}),
			readProviderId: vi.fn(
				(result: { tvdbId?: number }) => result.tvdbId ?? null,
			),
		};

		const service = new MappingService(
			{
				fetchMediaWithRelations,
				iteratePrequelChain: async function* () {
					yield* [];
				},
			} as never,
			anibridgeMappingStore as never,
			{
				sonarr: lookupClient,
				radarr: { reset: vi.fn(async () => {}) },
			} as never,
			autoMappingStore as never,
			manualMappings as never,
		);

		const defaultRequest = service.resolveProviderId("sonarr", aid(78));
		await vi.waitFor(() => {
			expect(fetchMediaWithRelations).toHaveBeenCalledTimes(1);
		});

		const forceRequest = service.resolveProviderId("sonarr", aid(78), {
			forceLookupNetwork: true,
		});

		await vi.waitFor(() => {
			expect(fetchMediaWithRelations).toHaveBeenCalledTimes(2);
		});
		await expect(forceRequest).resolves.toMatchObject({
			providerId: 202,
			reason: "exact-title-match",
		});

		defaultFetch.resolve(defaultMedia);
		await expect(defaultRequest).resolves.toMatchObject({
			providerId: 101,
			reason: "exact-title-match",
		});
	});

	it("falls back to a borrowed base-title lookup after inherited verification rejects the relation candidate", async () => {
		const manualMappings: StubManualMappings = {
			isIgnored: vi.fn(() => false),
			get: vi.fn((provider: string, anilistId: AniListId) =>
				provider === "sonarr" && anilistId === 88 ? 111 : null,
			),
			clear: vi.fn(async () => {}),
			getCandidateSuppression: vi.fn(() => null),
		};
		const anibridgeMappingStore = {
			getSonarrCandidates: vi.fn(() => []),
			getRadarrCandidates: vi.fn(() => []),
		};
		const autoMappingStore: StubAutoMappingStore = {
			get: vi.fn(async () => null),
			set: vi.fn(async () => true),
			delete: vi.fn(async () => false),
			clear: vi.fn(async () => false),
		};
		const fetchMediaWithRelations = vi.fn(async (anilistId: AniListId) => {
			if (anilistId === 77) {
				return {
					id: aid(77),
					format: "TV",
					title: { english: "Bleach: Thousand-Year Blood War" },
					synonyms: [],
					relations: {
						edges: [{ relationType: "PREQUEL", node: { id: aid(88) } }],
					},
				};
			}
			if (anilistId === 88) {
				return {
					id: aid(88),
					format: "TV",
					title: { english: "Bleach Season 2" },
					synonyms: [],
					relations: { edges: [] },
				};
			}
			throw new Error(`Unexpected AniList fetch ${anilistId}`);
		});
		const lookupClient = {
			provider: "sonarr" as const,
			reset: vi.fn(async () => {}),
			readCachedTitleLookup: vi.fn(async () => ({ results: [], hit: "none" as const })),
			lookupTitle: vi.fn(async (term: { display: string }) => {
				if (term.display === "Bleach") {
					return [{ title: "Bleach", tvdbId: 222, year: 2004 }];
				}
				return [];
			}),
			lookupByProviderId: vi.fn(async () => ({
				title: "Naruto",
				tvdbId: 111,
			})),
			readProviderId: vi.fn(
				(result: { tvdbId?: number }) => result.tvdbId ?? null,
			),
		};

		const service = new MappingService(
			{
				fetchMediaWithRelations,
			} as never,
			anibridgeMappingStore as never,
			{
				sonarr: lookupClient,
				radarr: { reset: vi.fn(async () => {}) },
			} as never,
			autoMappingStore as never,
			manualMappings as never,
		);

		const result = await service.resolveProviderId("sonarr", aid(77));

		expect(result).toMatchObject({
			providerId: 222,
			reason: "borrowed-base-title-fallback",
		});
		expect(autoMappingStore.set).toHaveBeenCalledWith(
			"sonarr",
			77,
			expect.objectContaining({
				state: "mapped",
				providerId: 222,
				acceptedEvidence: expect.objectContaining({
					source: "auto",
					reason: "borrowed-base-title-fallback",
				}),
				recentEvaluation: expect.objectContaining({
					candidates: expect.arrayContaining([
						expect.objectContaining({
							providerId: 111,
							status: "not-accepted",
							reason: "verified-inherited",
						}),
						expect.objectContaining({
							providerId: 222,
							status: "accepted",
							reason: "borrowed-base-title-fallback",
						}),
					]),
				}),
			}),
			expect.any(Object),
		);
	});

	it("records verification-failed instead of auto-accepting an inherited relation candidate when exact verification cannot complete", async () => {
		const manualMappings: StubManualMappings = {
			isIgnored: vi.fn(() => false),
			get: vi.fn(() => null),
			clear: vi.fn(async () => {}),
			getCandidateSuppression: vi.fn(() => null),
		};
		const anibridgeMappingStore = {
			getSonarrCandidates: vi.fn((anilistId: AniListId) =>
				anilistId === 91 ? [333] : [],
			),
			getRadarrCandidates: vi.fn(() => []),
		};
		const autoMappingStore: StubAutoMappingStore = {
			get: vi.fn(async () => null),
			set: vi.fn(async () => true),
			delete: vi.fn(async () => false),
			clear: vi.fn(async () => false),
		};
		const fetchMediaWithRelations = vi.fn(async (anilistId: AniListId) => {
			if (anilistId === 90) {
				return {
					id: aid(90),
					format: "TV",
					title: { english: "Attack on Titan Final Season" },
					synonyms: [],
					relations: {
						edges: [{ relationType: "PREQUEL", node: { id: aid(91) } }],
					},
				};
			}
			if (anilistId === 91) {
				return {
					id: aid(91),
					format: "TV",
					title: { english: "Attack on Titan Season 3" },
					synonyms: [],
					relations: { edges: [] },
				};
			}
			throw new Error(`Unexpected AniList fetch ${anilistId}`);
		});
		const lookupClient = {
			provider: "sonarr" as const,
			reset: vi.fn(async () => {}),
			readCachedTitleLookup: vi.fn(async () => ({ results: [], hit: "none" as const })),
			lookupTitle: vi.fn(async () => [
				{ title: "Attack on Titan", tvdbId: 444, year: 2013 },
			]),
			lookupByProviderId: vi.fn(async () => {
				throw createError(
					ErrorCode.NETWORK_ERROR,
					"Timed out reaching Sonarr.",
					"Unable to verify the inherited series right now.",
				);
			}),
			readProviderId: vi.fn(
				(result: { tvdbId?: number }) => result.tvdbId ?? null,
			),
		};

		const service = new MappingService(
			{
				fetchMediaWithRelations,
			} as never,
			anibridgeMappingStore as never,
			{
				sonarr: lookupClient,
				radarr: { reset: vi.fn(async () => {}) },
			} as never,
			autoMappingStore as never,
			manualMappings as never,
		);

		const result = await service.resolveProviderId("sonarr", aid(90));

		expect(result).toBeNull();
		expect(autoMappingStore.set).toHaveBeenCalledWith(
			"sonarr",
			90,
			expect.objectContaining({
				state: "verification-failed",
				recentEvaluation: expect.objectContaining({
					candidates: expect.arrayContaining([
						expect.objectContaining({
							providerId: 333,
							reason: "verified-inherited",
							status: "not-accepted",
						}),
					]),
				}),
			}),
			expect.any(Object),
		);

		const persistedState = autoMappingStore.set.mock.calls[0]?.[2];
		expect(persistedState).not.toHaveProperty("reviewNeeded");
		expect(persistedState).not.toHaveProperty("reviewSummary");
		expect(persistedState).not.toHaveProperty("reviewItems");
	});

	it("resets lookup clients, failure cache, resolver state, and notifications", async () => {
		const { service, lookupClients, autoMappingStore, notifyMappingsChanged } =
			createService();

		await service.resetLookupState();

		expect(lookupClients.sonarr.reset).toHaveBeenCalledTimes(1);
		expect(lookupClients.radarr.reset).toHaveBeenCalledTimes(1);
		expect(clearAutoMappingFailures).toHaveBeenCalledTimes(1);
		expect(autoMappingStore.clear).toHaveBeenCalledTimes(1);
		expect(notifyMappingsChanged).toHaveBeenCalledTimes(1);
	});

	it("delegates provider mapping initialization to the Anibridge mapping store", async () => {
		const { service, anibridgeMappingStore } = createService();

		await service.initAnibridgeMappings();

		expect(anibridgeMappingStore.init).toHaveBeenCalledTimes(1);
	});

	it("prioritizes AniList media through the optional API with the requested scheduling mode", () => {
		const { service, anilistApi } = createService();

		service.prioritizeAniListMedia(aid(99), { schedule: true });

		expect(anilistApi.prioritize).toHaveBeenCalledWith(99, { schedule: true });
	});

	it("evicts resolved state, clears the failure cache, evicts AniList media, and notifies listeners", async () => {
		const { service, anilistApi, autoMappingStore, notifyMappingsChanged } =
			createService();

		await service.evictResolved(aid(44), "radarr");

		expect(autoMappingStore.delete).toHaveBeenCalledWith("radarr", 44);
		expect(removeAutoMappingFailure).toHaveBeenCalledWith("radarr", 44);
		expect(anilistApi.removeMediaFromCache).toHaveBeenCalledWith(44);
		expect(notifyMappingsChanged).toHaveBeenCalledTimes(1);
	});

	it("caches network failures with the shorter network TTLs", async () => {
		const { service, anilistApi } = createService();
		const error = createError(
			ErrorCode.NETWORK_ERROR,
			"Timed out reaching AniList.",
			"Unable to connect right now.",
		);
		anilistApi.fetchMediaWithRelations.mockRejectedValue(error);

		await expect(
			service.resolveProviderId("sonarr", aid(12)),
		).rejects.toMatchObject({
			code: ErrorCode.NETWORK_ERROR,
		});

		expect(writeAutoMappingFailure).toHaveBeenCalledWith("sonarr", 12, error);
	});

	it("caches configuration failures with the default failure TTLs", async () => {
		const { service } = createService();

		await expect(
			service.resolveProviderId("radarr", aid(18)),
		).rejects.toMatchObject({
			code: ErrorCode.CONFIGURATION_ERROR,
		});

		expect(writeAutoMappingFailure).toHaveBeenCalledWith(
			"radarr",
			18,
			expect.objectContaining({ code: ErrorCode.CONFIGURATION_ERROR }),
		);
	});
});
