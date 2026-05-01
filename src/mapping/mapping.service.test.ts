/** Highest-value MappingService tests for precedence, concurrency, and resolver safety. */
// src/mapping/mapping.service.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist";
import { createError, ErrorCode } from "@/shared/errors";
import { MappingService } from "./mapping.service";

const aid = parseAniListId;

vi.mock("@/debug/metrics", () => ({
	incrementCounter: vi.fn(),
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
	const getConfiguredCredentials = vi.fn(async () => ({
		url: "http://localhost:8989",
		apiKey: "test-key",
	}));

	const service = new MappingService({
		anilistApi: anilistApi as never,
		anibridgeMappingStore: anibridgeMappingStore as never,
		lookupClients: lookupClients as never,
		autoMappingStore: autoMappingStore as never,
		getConfiguredCredentials,
		manualMappings: manualMappings as never,
		notifyMappingsChanged,
	});

	return {
		anilistApi,
		service,
		manualMappings,
		anibridgeMappingStore,
		autoMappingStore,
		lookupClients,
		getConfiguredCredentials,
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

	it("does not let an old resolver write after provider reset", async () => {
		const context = createService();
		const {
			service,
			anilistApi,
			lookupClients,
			autoMappingStore,
			notifyMappingsChanged,
		} = context;
		const media = {
			id: aid(79),
			format: "TV",
			title: { english: "Old Credentials Result" },
			synonyms: [],
		};
		const pendingFetch = createDeferred<typeof media>();
		anilistApi.fetchMediaWithRelations.mockResolvedValue(pendingFetch.promise);
		lookupClients.sonarr.lookupTitle.mockResolvedValue([
			{ title: "Old Credentials Result", tvdbId: 303, year: 2020 },
		]);

		const request = service.resolveProviderId("sonarr", aid(79));
		await vi.waitFor(() => {
			expect(anilistApi.fetchMediaWithRelations).toHaveBeenCalledTimes(1);
		});
		notifyMappingsChanged.mockClear();

		await service.resetLookupState("sonarr");
		expect(notifyMappingsChanged).toHaveBeenCalledTimes(1);
		notifyMappingsChanged.mockClear();

		pendingFetch.resolve(media);
		await expect(request).resolves.toBeNull();
		expect(autoMappingStore.set).not.toHaveBeenCalled();
		expect(notifyMappingsChanged).not.toHaveBeenCalled();
	});

	it("bypasses stored mapped auto results for force lookups", async () => {
		const context = createService();
		const { service, anilistApi, autoMappingStore, lookupClients } = context;
		autoMappingStore.get.mockResolvedValue({
			state: "mapped",
			providerId: 101,
			acceptedEvidence: {
				source: "auto",
				reason: "exact-title-match",
			},
			updatedAt: Date.now(),
		});
		configureMediaFetch(context, {
			78: {
				id: aid(78),
				format: "TV",
				title: { english: "Fresh Result" },
				synonyms: [],
			},
		});
		lookupClients.sonarr.lookupTitle.mockResolvedValue([
			{ title: "Fresh Result", tvdbId: 202, year: 2020 },
		]);

		const result = await service.resolveProviderId("sonarr", aid(78), {
			forceLookupNetwork: true,
		});

		expect(result).toMatchObject({ providerId: 202 });
		expect(anilistApi.fetchMediaWithRelations).toHaveBeenCalledTimes(1);
		expect(autoMappingStore.set).toHaveBeenCalledWith(
			"sonarr",
			78,
			expect.objectContaining({
				state: "mapped",
				providerId: 202,
			}),
			expect.any(Object),
		);
	});

	it("bypasses stored terminal auto results for force lookups", async () => {
		const context = createService();
		const { service, anilistApi, autoMappingStore, lookupClients } = context;
		autoMappingStore.get.mockResolvedValue({
			state: "unresolved",
			updatedAt: Date.now(),
		});
		configureMediaFetch(context, {
			81: {
				id: aid(81),
				format: "TV",
				title: { english: "Recovered Result" },
				synonyms: [],
			},
		});
		lookupClients.sonarr.lookupTitle.mockResolvedValue([
			{ title: "Recovered Result", tvdbId: 404, year: 2020 },
		]);

		const result = await service.resolveProviderId("sonarr", aid(81), {
			forceLookupNetwork: true,
		});

		expect(result).toMatchObject({ providerId: 404 });
		expect(anilistApi.fetchMediaWithRelations).toHaveBeenCalledTimes(1);
		expect(autoMappingStore.set).toHaveBeenCalledWith(
			"sonarr",
			81,
			expect.objectContaining({
				state: "mapped",
				providerId: 404,
			}),
			expect.any(Object),
		);
	});

	it("retries resolution after a retryable network failure", async () => {
		const { service, anilistApi, lookupClients } = createService();
		const error = createError(
			ErrorCode.NETWORK_ERROR,
			"Timed out reaching AniList.",
			"Unable to connect right now.",
		);
		const media = {
			id: aid(12),
			format: "TV",
			title: { english: "Recovered Result" },
			synonyms: [],
		};
		anilistApi.fetchMediaWithRelations
			.mockRejectedValueOnce(error)
			.mockResolvedValueOnce(media);
		lookupClients.sonarr.lookupTitle.mockResolvedValue([
			{ title: "Recovered Result", tvdbId: 1212, year: 2020 },
		]);

		await expect(
			service.resolveProviderId("sonarr", aid(12)),
		).rejects.toMatchObject({
			code: ErrorCode.NETWORK_ERROR,
		});

		await expect(service.resolveProviderId("sonarr", aid(12))).resolves.toMatchObject({
			providerId: 1212,
		});
		expect(anilistApi.fetchMediaWithRelations).toHaveBeenCalledTimes(2);
	});
});
