/** Shared provider-library cache refresh and persistence flow. */
// src/providers/library/base-provider-library.store.ts

import { getExtensionOptionsSnapshot, type ExtensionOptions } from "@/options";
import { logError, normalizeError } from "@/shared/errors";
import type { ProviderCredentials } from "@/providers";
import type {
	ProviderCredentialsResolver,
	ProviderLibraryCaches,
} from "./types";
import { PROVIDER_LIBRARY_CACHE_TTL } from "./cache";

type BaseProviderLibraryStoreAdapter<
	TFullEntry,
	TSnapshot,
	TProviderId extends number,
> = {
	cacheKey: string;
	getCredentials: ProviderCredentialsResolver;
	fetchAll(credentials: ProviderCredentials): Promise<TFullEntry[]>;
	toSnapshot(entry: TFullEntry): TSnapshot;
	getProviderId(entry: TSnapshot): TProviderId;
};

export class BaseProviderLibraryStore<
	TFullEntry,
	TSnapshot,
	TProviderId extends number,
> {
	private inflightRefresh: Promise<TSnapshot[]> | null = null;

	constructor(
		private readonly caches: ProviderLibraryCaches<TSnapshot>,
		private readonly adapter: BaseProviderLibraryStoreAdapter<
			TFullEntry,
			TSnapshot,
			TProviderId
		>,
		private readonly logScope: string,
	) {}

	async getLeanList(): Promise<TSnapshot[]> {
		const cached = await this.caches.lean.read(this.adapter.cacheKey);
		if (cached) {
			if (cached.stale && !this.inflightRefresh) {
				this.refreshCache().catch((error) => {
					logError(normalizeError(error), `${this.logScope}:backgroundRefresh`);
				});
			}
			return cached.value;
		}

		return this.refreshCache();
	}

	async refreshCache(optionsOverride?: ExtensionOptions): Promise<TSnapshot[]> {
		if (this.inflightRefresh) {
			return this.inflightRefresh;
		}

		const job = (async () => {
			const cached = await this.caches.lean.read(this.adapter.cacheKey);
			const fallbackList = cached?.value ?? [];

			try {
				const options =
					optionsOverride ?? (await getExtensionOptionsSnapshot());
				const credentials = this.adapter.getCredentials(options);

				if (!credentials) {
					await this.caches.lean.remove(this.adapter.cacheKey);
					return [];
				}

				const fullEntries = await this.adapter.fetchAll(credentials);
				const snapshots = fullEntries
					.map((entry) => this.adapter.toSnapshot(entry))
					.filter((snapshot) =>
						Number.isFinite(this.adapter.getProviderId(snapshot)),
					);

				await this.caches.lean.write(this.adapter.cacheKey, snapshots, {
					staleMs: PROVIDER_LIBRARY_CACHE_TTL.normal.staleMs,
					hardMs: PROVIDER_LIBRARY_CACHE_TTL.normal.hardMs,
				});

				return snapshots;
			} catch (error) {
				const normalized = normalizeError(error);
				logError(normalized, `${this.logScope}:refreshCache`);

				await this.caches.lean.write(this.adapter.cacheKey, fallbackList, {
					staleMs: PROVIDER_LIBRARY_CACHE_TTL.error.staleMs,
					hardMs: PROVIDER_LIBRARY_CACHE_TTL.error.hardMs,
					meta: { lastErrorCode: normalized.code },
				});

				return fallbackList;
			} finally {
				this.inflightRefresh = null;
			}
		})();

		this.inflightRefresh = job;
		return job;
	}

	async addToCache(entry: TFullEntry): Promise<void> {
		const current = await this.getLeanList();
		const snapshot = this.adapter.toSnapshot(entry);
		const providerId = this.adapter.getProviderId(snapshot);
		const idx = current.findIndex(
			(item) => this.adapter.getProviderId(item) === providerId,
		);
		const updated =
			idx === -1
				? [...current, snapshot]
				: [...current.slice(0, idx), snapshot, ...current.slice(idx + 1)];

		await this.caches.lean.write(this.adapter.cacheKey, updated, {
			staleMs: PROVIDER_LIBRARY_CACHE_TTL.normal.staleMs,
			hardMs: PROVIDER_LIBRARY_CACHE_TTL.normal.hardMs,
		});
	}

	async removeFromCache(providerId: TProviderId): Promise<void> {
		const current = await this.getLeanList();
		const filtered = current.filter(
			(item) => this.adapter.getProviderId(item) !== providerId,
		);
		if (filtered.length === current.length) return;

		await this.caches.lean.write(this.adapter.cacheKey, filtered, {
			staleMs: PROVIDER_LIBRARY_CACHE_TTL.normal.staleMs,
			hardMs: PROVIDER_LIBRARY_CACHE_TTL.normal.hardMs,
		});
	}
}
