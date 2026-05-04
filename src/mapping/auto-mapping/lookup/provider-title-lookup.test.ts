// src/mapping/auto-mapping/lookup/provider-title-lookup.test.ts

import { describe, expect, it, vi } from "vitest";
import { parseTvdbId, type ProviderCredentials } from "@/providers";
import type {
	CacheHit,
	CacheWriteOptions,
	TtlCache,
} from "@/shared/cache/ttl-cache";
import type { TitleSearchTerm } from "@/mapping/auto-mapping/title/title-search";
import {
	createSonarrTitleLookup,
	createProviderTitleLookup,
	type ProviderTitleResult,
} from "./provider-title-lookup";
import { TITLE_LOOKUP_CACHE_TTL } from "./lookup.cache";

type TestResult = ProviderTitleResult & { id: number };

const TEST_CREDENTIALS: ProviderCredentials = {
	url: "http://localhost:8989",
	apiKey: "test-key",
};

const TERM: TitleSearchTerm = {
	canonical: "attack on titan",
	display: "Attack on Titan",
};

type MockCache<T> = TtlCache<T> & {
	read: ReturnType<typeof vi.fn<(key: string) => Promise<CacheHit<T> | null>>>;
	write: ReturnType<
		typeof vi.fn<
			(key: string, value: T, options: CacheWriteOptions) => Promise<void>
		>
	>;
	remove: ReturnType<typeof vi.fn<(key: string) => Promise<void>>>;
	clear: ReturnType<typeof vi.fn<() => Promise<void>>>;
};

function cacheHit<T>(value: T, stale = false): CacheHit<T> {
	return {
		value,
		stale,
		staleAt: Date.now() + 1000,
		expiresAt: Date.now() + 2000,
	};
}

function createCache<T>(initial: CacheHit<T> | null = null): MockCache<T> {
	let value = initial;
	return {
		read: vi.fn(async () => value),
		write: vi.fn(async (_key: string, next: T) => {
			value = cacheHit(next);
		}),
		remove: vi.fn(async () => {
			value = null;
		}),
		clear: vi.fn(async () => {
			value = null;
		}),
	};
}

function createLookup(input: {
	cache?: MockCache<TestResult[]>;
	fetch?: ReturnType<typeof vi.fn<(term: string) => Promise<TestResult[]>>>;
}) {
	const cache = input.cache ?? createCache<TestResult[]>();
	const fetchTitleResults =
		input.fetch ?? vi.fn(async () => [{ title: "Attack on Titan", id: 1 }]);
	const lookup = createProviderTitleLookup({
		provider: "sonarr",
		loggerName: "TestTitleLookup",
		caches: cache,
		fetchTitleResults,
		readProviderId: (result) => {
			const id = (result as { id?: unknown }).id;
			return typeof id === "number" ? parseTvdbId(id) : null;
		},
	});

	return { lookup, cache, fetchTitleResults };
}

describe("createProviderTitleLookup", () => {
	it("returns fresh cached empty results without fetching", async () => {
		const cached: TestResult[] = [];
		const { lookup, fetchTitleResults } = createLookup({
			cache: createCache(cacheHit(cached)),
		});

		await expect(lookup.lookupTitle(TERM, TEST_CREDENTIALS)).resolves.toBe(
			cached,
		);
		expect(fetchTitleResults).not.toHaveBeenCalled();
	});

	it.each([
		{
			name: "non-empty results",
			results: [{ title: "Attack on Titan", id: 1 }],
			ttl: TITLE_LOOKUP_CACHE_TTL.results,
		},
		{
			name: "empty results",
			results: [],
			ttl: TITLE_LOOKUP_CACHE_TTL.emptyResults,
		},
	])("writes $name with the matching TTL", async ({ results, ttl }) => {
		const { lookup, cache } = createLookup({
			fetch: vi.fn(async () => results),
		});

		await expect(lookup.lookupTitle(TERM, TEST_CREDENTIALS)).resolves.toBe(
			results,
		);
		expect(cache.write).toHaveBeenCalledWith(TERM.canonical, results, {
			staleMs: ttl.staleMs,
			hardMs: ttl.hardMs,
		});
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

	it("does not write old lookup results after reset", async () => {
		let resolveFetch!: (results: TestResult[]) => void;
		const fetchTitleResults = vi.fn(
			() =>
				new Promise<TestResult[]>((resolve) => {
					resolveFetch = resolve;
				}),
		);
		const { lookup, cache } = createLookup({ fetch: fetchTitleResults });

		const pending = lookup.lookupTitle(TERM, TEST_CREDENTIALS);
		await vi.waitFor(() => expect(fetchTitleResults).toHaveBeenCalledTimes(1));
		await lookup.reset();
		cache.write.mockClear();
		resolveFetch([{ title: "Attack on Titan", id: 1 }]);

		await expect(pending).resolves.toEqual([
			{ title: "Attack on Titan", id: 1 },
		]);
		expect(cache.clear).toHaveBeenCalledTimes(1);
		expect(cache.write).not.toHaveBeenCalled();
	});
});

describe("createSonarrTitleLookup", () => {
	it("looks up exact TVDB matches with Sonarr's term lookup", async () => {
		const lookupSeries = vi.fn(async () => [
			{ title: "Wrong Series", tvdbId: parseTvdbId(2) },
			{ title: "Attack on Titan", tvdbId: parseTvdbId(1) },
		]);
		const lookup = createSonarrTitleLookup(
			{ lookupSeries } as never,
			createCache(),
		);

		await expect(
			lookup.lookupByProviderId?.(parseTvdbId(1), TEST_CREDENTIALS),
		).resolves.toEqual({ title: "Attack on Titan", tvdbId: parseTvdbId(1) });

		expect(lookupSeries).toHaveBeenCalledWith("tvdb:1", TEST_CREDENTIALS);
	});
});
