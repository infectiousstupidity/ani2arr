/** Manual mapping service for persisted manual mappings, ignored mappings, and rejected candidates. */
// src/mapping/manual-mapping/manual-mapping.service.ts

import { storage } from "@wxt-dev/storage";
import { browser } from "wxt/browser";
import type { AniListId } from "@/anilist";
import {
	type Provider,
	type ProviderIdFor,
	type ProviderId,
	parseProviderId,
} from "@/providers";
import {
	createManualMappingKey,
	createReverseLookupKey,
	normalizeStoredManualMapping,
	parseManualMappingKey,
} from "./keys";
import type {
	ManualMappingKey,
	PersistedMappingIgnoreRecord,
	PersistedProviderMappingRecord,
	StoredManualMapping,
	StoredManualMappings,
} from "./types";

export const MANUAL_MAPPINGS_STORAGE_KEY = "local:manualMappings";
export const MANUAL_MAPPINGS_CHANGE_KEY = "manualMappings";

const manualMappingsStorage = storage.defineItem<StoredManualMappings>(
	MANUAL_MAPPINGS_STORAGE_KEY,
	{
		fallback: {} as StoredManualMappings,
		version: 2,
	},
);

const MANUAL_MAPPING_SORT = (
	a: { updatedAt: number; provider: string; anilistId: AniListId },
	b: { updatedAt: number; provider: string; anilistId: AniListId },
) =>
	b.updatedAt - a.updatedAt ||
	a.provider.localeCompare(b.provider) ||
	a.anilistId - b.anilistId;

const isRecordEmpty = (record: StoredManualMapping): boolean =>
	record.providerId === undefined &&
	record.ignoredAt === undefined &&
	Object.keys(record.rejectedProviderIds ?? {}).length === 0;

export class ManualMappingService {
	private readonly manualMappings = new Map<
		ManualMappingKey,
		StoredManualMapping
	>();
	private readonly reverse = new Map<string, Set<AniListId>>();
	private initialized = false;
	private writeQueue: Promise<void> = Promise.resolve();

	public async init(): Promise<void> {
		if (this.initialized) return;
		await this.load();
		this.rebuildReverse();
		this.attachWatcher();
		this.initialized = true;
	}

	public get<P extends Provider>(
		provider: P,
		anilistId: AniListId,
	): ProviderIdFor<P> | null {
		const entry = this.manualMappings.get(
			createManualMappingKey(provider, anilistId),
		);
		if (entry?.providerId === undefined) return null;
		return parseProviderId(
			provider,
			entry.providerId,
		) as ProviderIdFor<P> | null;
	}

	public has(provider: Provider, anilistId: AniListId): boolean {
		return this.get(provider, anilistId) !== null;
	}

	public isIgnored(provider: Provider, anilistId: AniListId): boolean {
		return (
			this.manualMappings.get(createManualMappingKey(provider, anilistId))
				?.ignoredAt !== undefined
		);
	}

	public getCandidateSuppression<P extends Provider>(
		provider: P,
		anilistId: AniListId,
		providerId: ProviderIdFor<P>,
	): "rejected" | null {
		const entry = this.manualMappings.get(
			createManualMappingKey(provider, anilistId),
		);
		return entry?.rejectedProviderIds?.[String(providerId)] === undefined
			? null
			: "rejected";
	}

	public getLinkedAniListIds<P extends Provider>(
		provider: P,
		providerId: ProviderIdFor<P>,
	): AniListId[] {
		const bucket = this.reverse.get(
			createReverseLookupKey(provider, providerId),
		);
		if (!bucket) return [];
		return [...bucket];
	}

	public async set<P extends Provider>(
		provider: P,
		anilistId: AniListId,
		providerId: ProviderIdFor<P>,
	): Promise<void> {
		await this.enqueueWrite(async () => {
			const key = createManualMappingKey(provider, anilistId);
			const now = Date.now();
			const previous = this.manualMappings.get(key);
			if (previous?.providerId !== undefined) {
				const previousProviderId = parseProviderId(
					provider,
					previous.providerId,
				);
				if (previousProviderId !== null) {
					this.removeReverse(provider, previousProviderId, anilistId);
				}
			}

			const rejectedProviderIds = { ...previous?.rejectedProviderIds };
			delete rejectedProviderIds[String(providerId)];

			const next: StoredManualMapping = {
				v: 2,
				providerId,
				mappedAt: now,
				...(Object.keys(rejectedProviderIds).length > 0
					? { rejectedProviderIds }
					: {}),
				updatedAt: now,
			};

			this.manualMappings.set(key, next);
			this.addReverse(provider, providerId, anilistId);
			await this.persist();
		});
	}

	public async clear(provider: Provider, anilistId: AniListId): Promise<void> {
		await this.enqueueWrite(async () => {
			const key = createManualMappingKey(provider, anilistId);
			const entry = this.manualMappings.get(key);
			if (!entry) return;

			if (entry.providerId !== undefined) {
				const providerId = parseProviderId(provider, entry.providerId);
				if (providerId !== null) {
					this.removeReverse(provider, providerId, anilistId);
				}
			}

			delete entry.providerId;
			delete entry.mappedAt;
			entry.updatedAt = Date.now();
			this.saveOrDeleteEmptyRecord(key, entry);
			await this.persist();
		});
	}

	public async setIgnore(
		provider: Provider,
		anilistId: AniListId,
	): Promise<void> {
		await this.enqueueWrite(async () => {
			const key = createManualMappingKey(provider, anilistId);
			const now = Date.now();
			const entry = this.getOrCreateRecord(key, now);

			if (entry.providerId !== undefined) {
				const providerId = parseProviderId(provider, entry.providerId);
				if (providerId !== null) {
					this.removeReverse(provider, providerId, anilistId);
				}
			}

			delete entry.providerId;
			delete entry.mappedAt;
			entry.ignoredAt = now;
			entry.updatedAt = now;
			this.manualMappings.set(key, entry);
			await this.persist();
		});
	}

	public async clearIgnore(
		provider: Provider,
		anilistId: AniListId,
	): Promise<void> {
		await this.enqueueWrite(async () => {
			const key = createManualMappingKey(provider, anilistId);
			const entry = this.manualMappings.get(key);
			if (!entry) return;

			delete entry.ignoredAt;
			entry.updatedAt = Date.now();
			this.saveOrDeleteEmptyRecord(key, entry);
			await this.persist();
		});
	}

	public async setRejectedCandidate<P extends Provider>(
		provider: P,
		anilistId: AniListId,
		providerId: ProviderIdFor<P>,
	): Promise<void> {
		await this.enqueueWrite(async () => {
			const key = createManualMappingKey(provider, anilistId);
			const now = Date.now();
			const entry = this.getOrCreateRecord(key, now);

			entry.rejectedProviderIds = {
				...entry.rejectedProviderIds,
				[String(providerId)]: now,
			};
			entry.updatedAt = now;
			this.manualMappings.set(key, entry);
			await this.persist();
		});
	}

	public async clearRejectedCandidate<P extends Provider>(
		provider: P,
		anilistId: AniListId,
		providerId: ProviderIdFor<P>,
	): Promise<void> {
		await this.enqueueWrite(async () => {
			const key = createManualMappingKey(provider, anilistId);
			const entry = this.manualMappings.get(key);
			if (!entry?.rejectedProviderIds) return;

			delete entry.rejectedProviderIds[String(providerId)];
			if (Object.keys(entry.rejectedProviderIds).length === 0) {
				delete entry.rejectedProviderIds;
			}
			entry.updatedAt = Date.now();
			this.saveOrDeleteEmptyRecord(key, entry);
			await this.persist();
		});
	}

	public list(provider?: Provider): PersistedProviderMappingRecord[] {
		const entries: PersistedProviderMappingRecord[] = [];
		for (const [key, entry] of this.manualMappings.entries()) {
			const parsed = parseManualMappingKey(key);
			if (
				!parsed ||
				(provider && parsed.provider !== provider) ||
				entry.providerId === undefined
			) {
				continue;
			}
			const providerId = parseProviderId(parsed.provider, entry.providerId);
			if (providerId !== null) {
				entries.push({
					anilistId: parsed.anilistId,
					provider: parsed.provider,
					providerId,
					updatedAt: entry.mappedAt ?? entry.updatedAt,
				});
			}
		}
		entries.sort(MANUAL_MAPPING_SORT);
		return entries;
	}

	public listIgnores(provider?: Provider): PersistedMappingIgnoreRecord[] {
		const entries: PersistedMappingIgnoreRecord[] = [];
		for (const [key, entry] of this.manualMappings.entries()) {
			const parsed = parseManualMappingKey(key);
			if (
				!parsed ||
				(provider && parsed.provider !== provider) ||
				entry.ignoredAt === undefined
			) {
				continue;
			}
			entries.push({
				anilistId: parsed.anilistId,
				provider: parsed.provider,
				updatedAt: entry.ignoredAt,
			});
		}
		entries.sort(MANUAL_MAPPING_SORT);
		return entries;
	}

	public listRejectedCandidates(
		provider?: Provider,
	): PersistedProviderMappingRecord[] {
		const entries: PersistedProviderMappingRecord[] = [];
		for (const [key, entry] of this.manualMappings.entries()) {
			const parsed = parseManualMappingKey(key);
			if (
				!parsed ||
				(provider && parsed.provider !== provider) ||
				!entry.rejectedProviderIds
			) {
				continue;
			}
			for (const [rawProviderId, updatedAt] of Object.entries(
				entry.rejectedProviderIds,
			)) {
				const providerId = parseProviderId(
					parsed.provider,
					Number(rawProviderId),
				);
				if (providerId !== null) {
					entries.push({
						anilistId: parsed.anilistId,
						provider: parsed.provider,
						providerId,
						updatedAt,
					});
				}
			}
		}
		entries.sort(MANUAL_MAPPING_SORT);
		return entries;
	}

	public async clearAll(provider?: Provider): Promise<void> {
		await this.enqueueWrite(async () => {
			if (!provider) {
				this.manualMappings.clear();
				this.reverse.clear();
				await this.persist();
				return;
			}

			const prefix = `${provider}:`;
			for (const key of this.manualMappings.keys()) {
				if (key.startsWith(prefix)) {
					this.manualMappings.delete(key);
				}
			}
			this.rebuildReverse();
			await this.persist();
		});
	}

	private async load(): Promise<void> {
		const records = await manualMappingsStorage.getValue();
		this.rebuild(records);
	}

	private rebuild(records: StoredManualMappings): void {
		this.manualMappings.clear();
		for (const [key, entry] of Object.entries(records ?? {})) {
			const parsed = parseManualMappingKey(key);
			if (!parsed) continue;
			const normalized = normalizeStoredManualMapping(parsed.provider, entry);
			if (!normalized) continue;
			this.manualMappings.set(key as ManualMappingKey, normalized);
		}
	}

	private async persist(): Promise<void> {
		const records: StoredManualMappings = {};
		for (const [key, value] of this.manualMappings.entries()) {
			records[key] = value;
		}
		await manualMappingsStorage.setValue(records);
	}

	private attachWatcher(): void {
		browser.storage.onChanged.addListener((changes, area) => {
			if (area !== "local" || !(MANUAL_MAPPINGS_CHANGE_KEY in changes)) return;
			void this.load().then(() => {
				this.rebuildReverse();
			});
		});
	}

	private rebuildReverse(): void {
		this.reverse.clear();
		for (const [key, entry] of this.manualMappings.entries()) {
			if (entry.providerId === undefined) continue;
			const parsed = parseManualMappingKey(key);
			if (!parsed) continue;
			const providerId = parseProviderId(parsed.provider, entry.providerId);
			if (providerId !== null) {
				this.addReverse(parsed.provider, providerId, parsed.anilistId);
			}
		}
	}

	private getOrCreateRecord(
		key: ManualMappingKey,
		now: number,
	): StoredManualMapping {
		const existing = this.manualMappings.get(key);
		if (existing) return existing;
		return { v: 2, updatedAt: now };
	}

	private saveOrDeleteEmptyRecord(
		key: ManualMappingKey,
		entry: StoredManualMapping,
	): void {
		if (isRecordEmpty(entry)) {
			this.manualMappings.delete(key);
		} else {
			this.manualMappings.set(key, entry);
		}
	}

	private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
		const pending = this.writeQueue.catch(() => {});
		const next = pending.then(operation);
		this.writeQueue = next.then(
			() => {},
			() => {},
		);
		return next;
	}

	private addReverse(
		provider: Provider,
		providerId: ProviderId,
		anilistId: AniListId,
	): void {
		const reverseKey = createReverseLookupKey(provider, providerId);
		const bucket = this.reverse.get(reverseKey);
		if (bucket) {
			bucket.add(anilistId);
			return;
		}
		this.reverse.set(reverseKey, new Set([anilistId]));
	}

	private removeReverse(
		provider: Provider,
		providerId: ProviderId,
		anilistId: AniListId,
	): void {
		const reverseKey = createReverseLookupKey(provider, providerId);
		const bucket = this.reverse.get(reverseKey);
		if (!bucket) return;
		bucket.delete(anilistId);
		if (bucket.size === 0) this.reverse.delete(reverseKey);
	}
}
