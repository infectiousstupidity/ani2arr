/** Highest-value MappingService tests for precedence, concurrency, and resolver safety. */
// src/mapping/mapping.service.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist";
import { writeAutoMappingFailure } from "@/mapping/auto-mapping/failure.cache";
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

type LookupResult = {
	title: string;
	tvdbId: number;
	year?: number;
};

type StubSonarrLookupClient = {
	provider: "sonarr";
	reset: ReturnType<typeof vi.fn>;
	readCachedTitleLookup: ReturnType<typeof vi.fn>;
	lookupTitle: ReturnType<
		typeof vi.fn<(term: { display: string }) => Promise<LookupResult[]>>
	>;
	lookupByProviderId: ReturnType<typeof vi.fn>;
	readProviderId: ReturnType<typeof vi.fn>;
};

type TestService = ReturnType<typeof createService>;

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
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
	const sonarrLookupClient: StubSonarrLookupClient = {
			provider: "sonarr" as const,
			reset: vi.fn(async () => {}),
			readCachedTitleLookup: vi.fn(async () => ({
				results: [] as LookupResult[],
				hit: "none" as const,
			})),
			lookupTitle: vi.fn(async (_term: { display: string }) => []),
			lookupByProviderId: vi.fn(async () => null),
			readProviderId: vi.fn(
				(result: { tvdbId?: number }) => result.tvdbId ?? null,
			),
	};
	const lookupClients = {
		sonarr: sonarrLookupClient,
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

function configureMediaFetch(
	{ anilistApi }: TestService,
	mediaById: Record<number, unknown>,
): void {
	anilistApi.fetchMediaWithRelations.mockImplementation(
		async (anilistId: AniListId) => {
			const media = mediaById[anilistId];
			if (!media) {
				throw new Error(`Unexpected AniList fetch ${anilistId}`);
			}
			return media;
		},
	);
}

describe("MappingService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("keeps a user manual mapping when upstream disagrees", async () => {
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

	it("records upstream ambiguity instead of selecting a random candidate", async () => {
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

	it("does not reuse a default in-flight request for force lookups", async () => {
		const context = createService();
		const { service, anilistApi, lookupClients } = context;
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
		anilistApi.fetchMediaWithRelations.mockImplementation(async () => {
			fetchCount += 1;
			return fetchCount === 1 ? defaultFetch.promise : forceMedia;
		});
		lookupClients.sonarr.lookupTitle.mockImplementation(
			async (term: { display: string }) => {
				if (term.display === "Default Result") {
					return [{ title: "Default Result", tvdbId: 101, year: 2020 }];
				}
				if (term.display === "Force Result") {
					return [{ title: "Force Result", tvdbId: 202, year: 2020 }];
				}
				return [];
			},
		);

		const defaultRequest = service.resolveProviderId("sonarr", aid(78));
		await vi.waitFor(() => {
			expect(anilistApi.fetchMediaWithRelations).toHaveBeenCalledTimes(1);
		});

		const forceRequest = service.resolveProviderId("sonarr", aid(78), {
			forceLookupNetwork: true,
		});

		await vi.waitFor(() => {
			expect(anilistApi.fetchMediaWithRelations).toHaveBeenCalledTimes(2);
		});
		await expect(forceRequest).resolves.toMatchObject({ providerId: 202 });

		defaultFetch.resolve(defaultMedia);
		await expect(defaultRequest).resolves.toMatchObject({ providerId: 101 });
	});

	it("falls through to title search when inherited verification cannot complete", async () => {
		const context = createService();
		const { service, anibridgeMappingStore, autoMappingStore, lookupClients } =
			context;
		anibridgeMappingStore.getSonarrCandidates.mockImplementation(
			(anilistId: AniListId) => (anilistId === 91 ? [333] : []),
		);
		configureMediaFetch(context, {
			90: {
				id: aid(90),
				format: "TV",
				title: { english: "Attack on Titan Final Season" },
				synonyms: [],
				relations: {
					edges: [{ relationType: "PREQUEL", node: { id: aid(91) } }],
				},
			},
			91: {
				id: aid(91),
				format: "TV",
				title: { english: "Attack on Titan Season 3" },
				synonyms: [],
				relations: { edges: [] },
			},
		});
		lookupClients.sonarr.lookupTitle.mockResolvedValue([
			{ title: "Attack on Titan Final Season", tvdbId: 444, year: 2013 },
		]);
		lookupClients.sonarr.lookupByProviderId = vi.fn(async () => {
			throw createError(
				ErrorCode.NETWORK_ERROR,
				"Timed out reaching Sonarr.",
				"Unable to verify the inherited series right now.",
			);
		});

		const result = await service.resolveProviderId("sonarr", aid(90));

		expect(result).toMatchObject({ providerId: 444 });
		expect(autoMappingStore.set).toHaveBeenCalledWith(
			"sonarr",
			90,
			expect.objectContaining({
				state: "mapped",
				providerId: 444,
				recentEvaluation: expect.objectContaining({
					candidates: expect.arrayContaining([
						expect.objectContaining({
							providerId: 333,
							reason: "verified-inherited",
							status: "not-accepted",
						}),
						expect.objectContaining({
							providerId: 444,
							status: "accepted",
						}),
					]),
				}),
			}),
			expect.any(Object),
		);
	});

	it("caches retryable network failures", async () => {
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
});
