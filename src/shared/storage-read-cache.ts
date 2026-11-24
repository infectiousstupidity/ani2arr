/** Keeps one decoded copy of storage values per context until those keys change. */

import { browser } from "wxt/browser";

type StorageAreaName = "local" | "sync";

export interface StorageReadCache<T> {
	/** Cached decoded value; loads from storage on first use or after a change. */
	read(): Promise<T>;
	/** Store a value this context just wrote, so the next read skips storage. */
	prime(value: T): void;
	/** Drop the cached value. */
	clear(): void;
}

/**
 * `storage.*.get` deserializes the whole value on every call, which is costly
 * for multi-megabyte mapping stores. Callers must treat the returned value as
 * read-only and clone before mutating.
 */
export function createStorageReadCache<T>(input: {
	keys: Partial<Record<StorageAreaName, readonly string[]>>;
	load: () => Promise<T>;
	/** Called when a registered change listener disappeared (test browser reset). */
	onListenerLost?: () => void;
}): StorageReadCache<T> {
	let cached: Promise<T> | null = null;
	let registered = false;

	const onChanged = (
		changes: Record<string, unknown>,
		areaName: string,
	): void => {
		const keys = input.keys[areaName as StorageAreaName];
		if (keys?.some((key) => Object.hasOwn(changes, key))) cached = null;
	};

	// Re-register if something removed our listener (tests reset the fake browser).
	const ensureListener = (): void => {
		if (browser.storage.onChanged.hasListener(onChanged)) return;
		cached = null;
		if (registered) input.onListenerLost?.();
		registered = true;
		browser.storage.onChanged.addListener(onChanged);
	};

	return {
		read() {
			ensureListener();
			if (cached) return cached;
			const pending = input.load();
			cached = pending;
			pending.catch(() => {
				if (cached === pending) cached = null;
			});
			return pending;
		},
		prime(value) {
			ensureListener();
			cached = Promise.resolve(value);
		},
		clear() {
			cached = null;
		},
	};
}
