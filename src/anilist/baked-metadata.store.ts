/** IndexedDB store for shipped AniList metadata bundles keyed by AniList ID. */
// src/anilist/baked-metadata.store.ts

import { browser } from "wxt/browser";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AniListId } from "@/anilist/anilist-id";
import type { AniListMetadata } from "@/anilist/schemas/metadata.schema";
import {
	parseMetadataBundle,
	type AniListMetadataBundle,
	type AniListMetadataChunkRef,
} from "@/anilist/metadata-normalization";
import { logError, normalizeError } from "@/shared/errors";
import { logger, type ScopedLogger } from "@/shared/utils/logger";

const BAKED_METADATA_DB_NAME = "a2a-anilist-baked-metadata-db";
const BAKED_METADATA_DB_VERSION = 1;
const METADATA_STORE_NAME = "metadata";
const SYNC_STATE_STORE_NAME = "sync-state";
const SYNC_STATE_KEY = "anilist-static-metadata";
const MANIFEST_FILE = "anilist-static-metadata.json";
const DEFAULT_FETCH: typeof fetch = (...args) => fetch(...args);

interface SyncState {
	generatedAt: number;
}

interface BakedMetadataDbSchema extends DBSchema {
	[METADATA_STORE_NAME]: {
		key: AniListId;
		value: AniListMetadata;
	};
	[SYNC_STATE_STORE_NAME]: {
		key: typeof SYNC_STATE_KEY;
		value: SyncState;
	};
}

export interface BakedMetadataStore {
	syncFromBundleManifest(): Promise<void>;
	get(id: AniListId): Promise<AniListMetadata | null>;
	clear(): Promise<void>;
}

export class IndexedDbBakedMetadataStore implements BakedMetadataStore {
	private readonly fetchImpl: typeof fetch;
	private readonly log: ScopedLogger;
	private dbPromise: Promise<IDBPDatabase<BakedMetadataDbSchema>> | null = null;

	constructor(options: { fetch?: typeof fetch; scope?: string } = {}) {
		this.log = logger.create(options.scope ?? "IndexedDbBakedMetadataStore");
		const rawFetch =
			options.fetch ??
			(typeof globalThis.fetch === "function" ? globalThis.fetch : undefined);
		this.fetchImpl = rawFetch ? rawFetch.bind(globalThis) : DEFAULT_FETCH;
	}

	public async syncFromBundleManifest(): Promise<void> {
		try {
			const manifest = await this.fetchManifest();
			if (!manifest) {
				this.log.warn("syncFromBundleManifest: missing manifest");
				return;
			}

			const existingState = await this.getSyncState();
			if (existingState?.generatedAt === manifest.generatedAt) {
				this.log.debug("syncFromBundleManifest: baked metadata current");
				return;
			}

			const entries = await this.loadBundleEntries(manifest);
			if (!entries) return;

			await this.replaceEntries(manifest.generatedAt, entries);
			this.log.debug(
				`syncFromBundleManifest: stored ${entries.length} baked metadata entries`,
			);
		} catch (error) {
			logError(
				normalizeError(error),
				"IndexedDbBakedMetadataStore:syncFromBundleManifest",
			);
			throw error;
		}
	}

	public async get(id: AniListId): Promise<AniListMetadata | null> {
		const db = await this.getDb();
		return (await db.get(METADATA_STORE_NAME, id)) ?? null;
	}

	public async clear(): Promise<void> {
		const db = await this.getDb();
		const tx = db.transaction(
			[METADATA_STORE_NAME, SYNC_STATE_STORE_NAME],
			"readwrite",
		);
		await tx.objectStore(METADATA_STORE_NAME).clear();
		await tx.objectStore(SYNC_STATE_STORE_NAME).clear();
		await tx.done;
	}

	private async getDb(): Promise<IDBPDatabase<BakedMetadataDbSchema>> {
		this.dbPromise ??= openDB<BakedMetadataDbSchema>(
			BAKED_METADATA_DB_NAME,
			BAKED_METADATA_DB_VERSION,
			{
				upgrade(db) {
					if (!db.objectStoreNames.contains(METADATA_STORE_NAME)) {
						db.createObjectStore(METADATA_STORE_NAME);
					}
					if (!db.objectStoreNames.contains(SYNC_STATE_STORE_NAME)) {
						db.createObjectStore(SYNC_STATE_STORE_NAME);
					}
				},
			},
		);
		return this.dbPromise;
	}

	private async fetchManifest(): Promise<AniListMetadataBundle | null> {
		const response = await this.fetchImpl(this.toBakedUrl(MANIFEST_FILE));
		if (!response.ok) {
			this.log.warn(
				`fetchManifest: failed to load static metadata (status ${response.status})`,
			);
			return null;
		}

		return parseMetadataBundle(await response.json());
	}

	private toBakedUrl(file: string): string {
		const getRuntimeUrl = browser.runtime.getURL as (path: string) => string;
		return getRuntimeUrl(`/${file}`);
	}

	private async getSyncState(): Promise<SyncState | null> {
		const db = await this.getDb();
		return (await db.get(SYNC_STATE_STORE_NAME, SYNC_STATE_KEY)) ?? null;
	}

	private async loadBundleEntries(
		manifest: AniListMetadataBundle,
	): Promise<AniListMetadata[] | null> {
		if (Array.isArray(manifest.entries) && manifest.entries.length > 0) {
			return manifest.entries;
		}

		if (!Array.isArray(manifest.chunks) || manifest.chunks.length === 0) {
			this.log.warn("loadBundleEntries: missing chunk manifest");
			return null;
		}

		const chunks = await Promise.all(
			manifest.chunks.map((chunk) =>
				this.fetchBakedChunk(chunk, manifest.generatedAt),
			),
		);
		return chunks.flatMap((chunk) => chunk.entries ?? []);
	}

	private async fetchBakedChunk(
		chunk: AniListMetadataChunkRef,
		generatedAt: number,
	): Promise<AniListMetadataBundle> {
		const response = await this.fetchImpl(this.toBakedUrl(chunk.file));
		if (!response.ok) {
			throw new Error(`Failed to load baked chunk ${chunk.file} (${response.status})`);
		}

		const parsed = parseMetadataBundle(await response.json(), generatedAt);
		if (!parsed || !Array.isArray(parsed.entries)) {
			throw new Error(`Failed to parse baked chunk ${chunk.file}`);
		}
		if (parsed.entries.length !== chunk.count) {
			throw new Error(
				`Baked chunk ${chunk.file} expected ${chunk.count} entries, parsed ${parsed.entries.length}`,
			);
		}
		return parsed;
	}

	private async replaceEntries(
		generatedAt: number,
		entries: AniListMetadata[],
	): Promise<void> {
		const db = await this.getDb();
		const tx = db.transaction(
			[METADATA_STORE_NAME, SYNC_STATE_STORE_NAME],
			"readwrite",
		);
		const metadataStore = tx.objectStore(METADATA_STORE_NAME);
		await metadataStore.clear();
		for (const entry of entries) {
			await metadataStore.put(entry, entry.id);
		}
		await tx
			.objectStore(SYNC_STATE_STORE_NAME)
			.put({ generatedAt }, SYNC_STATE_KEY);
		await tx.done;
	}
}

export const bakedMetadataStore = new IndexedDbBakedMetadataStore();
