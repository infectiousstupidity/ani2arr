// src/mapping/auto-mapping/lookup/provider-title-lookup.test.ts

import { describe, expect, it, vi } from "vitest";
import { parseTvdbId, type ProviderCredentials } from "@/providers";
import type { CacheHit, TtlCache } from "@/shared/cache/ttl-cache";
import type { TitleSearchTerm } from "@/mapping/auto-mapping/title/title-search";
import {
	createProviderTitleLookup,
	createSonarrTitleLookup,
	type ProviderTitleResult,
} from "./provider-title-lookup";

type TestResult = ProviderTitleResult & { id: number };

const TEST_CREDENTIALS: ProviderCredentials = {
	url: "http://localhost:8989",
	apiKey: "test-key",
};

const TERM: TitleSearchTerm = {
	canonical: "attack on titan",
	display: "Attack on Titan",
};

function createCache<T>(initial: CacheHit<T> | null = null): TtlCache<T> & {
	read: ReturnType<typeof vi.fn<(key: string) => Promise<CacheHit<T> | null>>>;
	write: ReturnType<typeof vi.fn<(key: string, value: T) => Promise<void>>>;
	remove: ReturnType<typeof vi.fn<(key: string) => Promise<void>>>;
	clear: ReturnType<typeof vi.fn<() => Promise<void>>>;
} {
	let value = initial;
	return {
		read: vi.fn(async () => value),
		write: vi.fn(async (_key: string, next: T) => {
			value = {
				value: next,
				stale: false,
				staleAt: Date.now() + 1000,
				expiresAt: Date.now() + 2000,
			};
		}),
		remove: vi.fn(async () => {
			value = null;
		}),
		clear: vi.fn(async () => {
			value = null;
		}),
	};
}

function cacheHit<T>(value: T, stale = false): CacheHit<T> {
	return {
		value,
		stale,
		staleAt: Date.now() + 1000,
		expiresAt: Date.now() + 2000,
	};
}

function createLookup(input: {
	positive?: CacheHit<TestResult[]>;
	negative?: CacheHit<boolean>;
	fetch?: ReturnType<typeof vi.fn<(term: string) => Promise<TestResult[]>>>;
}) {
	const positive = createCache<TestResult[]>(input.positive);
	const negative = createCache<boolean>(input.negative);
	const fetchTitleResults =
		input.fetch ?? vi.fn(async () => [{ title: "Attack on Titan", id: 1 }]);
	const lookup = createProviderTitleLookup({
		provider: "sonarr",
		loggerName: "TestTitleLookup",
		caches: { positive, negative },
		fetchTitleResults,
		readProviderId: (result) => {
			const id = (result as { id?: unknown }).id;
			return typeof id === "number" ? parseTvdbId(id) : null;
		},
	});

	return { lookup, positive, negative, fetchTitleResults };
}

describe("createProviderTitleLookup", () => {
	it("returns fresh positive cache without fetching", async () => {
		const cached = [{ title: "Attack on Titan", id: 1 }];
		const { lookup, fetchTitleResults } = createLookup({
			positive: cacheHit(cached),
		});

		await expect(lookup.lookupTitle(TERM, TEST_CREDENTIALS)).resolves.toBe(
			cached,
		);
		expect(fetchTitleResults).not.toHaveBeenCalled();
	});

	it("returns fresh negative cache without fetching", async () => {
		const { lookup, fetchTitleResults } = createLookup({
			negative: cacheHit(true),
		});

		await expect(lookup.lookupTitle(TERM, TEST_CREDENTIALS)).resolves.toEqual(
			[],
		);
		expect(fetchTitleResults).not.toHaveBeenCalled();
	});

	it("reuses concurrent lookups for the same canonical title", async () => {
		let resolveFetch!: (results: TestResult[]) => void;
		const fetchTitleResults = vi.fn(
			() =>
				new Promise<TestResult[]>((resolve) => {
					resolveFetch = resolve;
				}),
		);
		const { lookup } = createLookup({ fetch: fetchTitleResults });

		const first = lookup.lookupTitle(TERM, TEST_CREDENTIALS);
		const second = lookup.lookupTitle(TERM, TEST_CREDENTIALS);
		await vi.waitFor(() => expect(fetchTitleResults).toHaveBeenCalledTimes(1));
		resolveFetch([{ title: "Attack on Titan", id: 1 }]);

		await expect(Promise.all([first, second])).resolves.toEqual([
			[{ title: "Attack on Titan", id: 1 }],
			[{ title: "Attack on Titan", id: 1 }],
		]);
		expect(fetchTitleResults).toHaveBeenCalledTimes(1);
	});

	it("forceNetwork bypasses a fresh cache hit", async () => {
		const { lookup, fetchTitleResults } = createLookup({
			positive: cacheHit([{ title: "Cached", id: 1 }]),
			fetch: vi.fn(async () => [{ title: "Network", id: 2 }]),
		});

		await expect(
			lookup.lookupTitle(TERM, TEST_CREDENTIALS, { forceNetwork: true }),
		).resolves.toEqual([{ title: "Network", id: 2 }]);
		expect(fetchTitleResults).toHaveBeenCalledTimes(1);
	});

	it("forceNetwork does not reuse a normal lookup pending on cache", async () => {
		const cached = [{ title: "Cached", id: 1 }];
		const network = [{ title: "Network", id: 2 }];
		let releaseCacheRead!: () => void;
		let markCacheReadStarted!: () => void;
		const cacheReadStarted = new Promise<void>((resolve) => {
			markCacheReadStarted = resolve;
		});
		const blockedCacheRead = new Promise<void>((resolve) => {
			releaseCacheRead = resolve;
		});
		const { lookup, positive, fetchTitleResults } = createLookup({
			positive: cacheHit(cached),
			fetch: vi.fn(async () => network),
		});
		positive.read.mockImplementationOnce(async () => {
			markCacheReadStarted();
			await blockedCacheRead;
			return cacheHit(cached);
		});

		const normal = lookup.lookupTitle(TERM, TEST_CREDENTIALS);
		await cacheReadStarted;
		const force = lookup.lookupTitle(TERM, TEST_CREDENTIALS, {
			forceNetwork: true,
		});
		await vi.waitFor(() => expect(fetchTitleResults).toHaveBeenCalledTimes(1));
		releaseCacheRead();

		await expect(Promise.all([normal, force])).resolves.toEqual([
			cached,
			network,
		]);
		expect(fetchTitleResults).toHaveBeenCalledTimes(1);
	});

	it("reset clears caches", async () => {
		const { lookup, positive, negative } = createLookup({});

		await lookup.reset();

		expect(positive.clear).toHaveBeenCalledTimes(1);
		expect(negative.clear).toHaveBeenCalledTimes(1);
	});

	it("readCachedTitleLookup returns inflight results", async () => {
		let resolveFetch!: (results: TestResult[]) => void;
		const fetchTitleResults = vi.fn(
			() =>
				new Promise<TestResult[]>((resolve) => {
					resolveFetch = resolve;
				}),
		);
		const { lookup } = createLookup({ fetch: fetchTitleResults });

		const pending = lookup.lookupTitle(TERM, TEST_CREDENTIALS);
		await vi.waitFor(() => expect(fetchTitleResults).toHaveBeenCalledTimes(1));
		const cached = lookup.readCachedTitleLookup(TERM.canonical);
		resolveFetch([{ title: "Attack on Titan", id: 1 }]);

		await expect(pending).resolves.toEqual([
			{ title: "Attack on Titan", id: 1 },
		]);
		await expect(cached).resolves.toEqual({
			results: [{ title: "Attack on Titan", id: 1 }],
			hit: "inflight",
		});
	});
});

describe("createSonarrTitleLookup", () => {
	it("lookupByProviderId calls Sonarr exact TVDB lookup", async () => {
		const lookupSeriesByTvdbId = vi.fn(async () => ({
			title: "Attack on Titan",
			tvdbId: parseTvdbId(267_440),
		}));
		const lookup = createSonarrTitleLookup(
			{
				lookupSeriesByTerm: vi.fn(async () => []),
				lookupSeriesByTvdbId,
			} as never,
			{
				positive: createCache(),
				negative: createCache(),
			},
		);

		await expect(
			lookup.lookupByProviderId?.(parseTvdbId(267_440), TEST_CREDENTIALS),
		).resolves.toMatchObject({ title: "Attack on Titan" });
		expect(lookupSeriesByTvdbId).toHaveBeenCalledWith(
			parseTvdbId(267_440),
			TEST_CREDENTIALS,
		);
	});
});
