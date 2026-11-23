import { vi } from "vitest";
import type { CacheHit, TtlCache } from "@/shared/cache/ttl-cache";

export function createMemoryCache<T>(
	initialEntries: ReadonlyArray<readonly [string, T]> = [],
): TtlCache<T> & {
	value: (key: string) => T | undefined;
	keys: () => string[];
} {
	const values = new Map<string, T>(initialEntries);

	return {
		read: vi.fn(async (key: string): Promise<CacheHit<T> | null> => {
			const value = values.get(key);
			return value === undefined
				? null
				: {
						value,
						stale: false,
						staleAt: Date.now() + 60_000,
						expiresAt: Date.now() + 120_000,
					};
		}),
		write: vi.fn(async (key: string, value: T) => {
			values.set(key, value);
		}),
		remove: vi.fn(async (key: string) => {
			values.delete(key);
		}),
		clear: vi.fn(async () => {
			values.clear();
		}),
		value: (key: string) => values.get(key),
		keys: () => [...values.keys()],
	};
}

export function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
}
