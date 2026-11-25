/** Downloads and persists normalized shared AniBridge fact layers. */

import { browser } from "wxt/browser";
import { storage } from "wxt/utils/storage";
import type { AniListId } from "@/anilist/types";
import { createStorageReadCache } from "@/shared/storage-read-cache";
import { downloadAniBridgeMappings } from "@/mapping/upstream/anibridge.client";
import {
	isUpstreamMappingRecord,
	type MappingRecord,
	type UpstreamMappingRecord,
} from "./mapping-record";
import {
	parseSourceIdentityKey,
	sourceIdentityKey,
	type SourceIdentity,
} from "./source-identity";

const UPSTREAM_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_KEY = "mapping:upstream";

type UpstreamSnapshot = {
	version: 1;
	records: Record<string, UpstreamMappingRecord>;
	fetchedAt: number;
	etag?: string;
};

export type SourceUpstreamLayers = {
	anilistId: AniListId | null;
	direct: MappingRecord | null;
	canonical: MappingRecord | null;
};

const upstreamMappings = storage.defineItem<UpstreamSnapshot | null>(
	"local:mapping:upstream",
	{ fallback: null },
);

const snapshotCache = createStorageReadCache<UpstreamSnapshot | null>({
	keys: { local: [UPSTREAM_KEY] },
	load: async () => {
		const stored = await browser.storage.local.get(UPSTREAM_KEY);
		return currentSnapshot(stored[UPSTREAM_KEY]);
	},
});

let writes: Promise<void> = Promise.resolve();

export async function getSourceUpstreamLayers(
	source: SourceIdentity,
	linkedAniListId?: AniListId | null,
): Promise<SourceUpstreamLayers> {
	const getRecord = await readSnapshotRecords();
	const directRecord = getRecord(sourceIdentityKey(source));
	let anilistId: AniListId | null;
	if (source.source === "anilist") anilistId = source.id;
	else if (linkedAniListId === undefined) {
		anilistId = directRecord?.linkedAniListId ?? null;
	} else anilistId = linkedAniListId;
	const canonicalRecord =
		anilistId === null
			? undefined
			: getRecord(sourceIdentityKey({ source: "anilist", id: anilistId }));
	return {
		anilistId,
		direct: directRecord ? withoutLink(directRecord) : null,
		canonical: canonicalRecord ? withoutLink(canonicalRecord) : null,
	};
}

export async function listAniListUpstreamLayers(): Promise<
	Array<{ anilistId: AniListId; record: UpstreamMappingRecord }>
> {
	const snapshot = await readSnapshot();
	return Object.entries(snapshot?.records ?? {}).flatMap(([rawKey, record]) => {
		const identity = parseSourceIdentityKey(rawKey);
		if (identity?.source !== "anilist" || !isUpstreamMappingRecord(record))
			return [];
		return [{ anilistId: identity.id, record: structuredClone(record) }];
	});
}

export async function getUniqueAniListIdForSource(
	source: SourceIdentity,
): Promise<AniListId | null> {
	if (source.source === "anilist") return source.id;
	const getRecord = await readSnapshotRecords();
	return getRecord(sourceIdentityKey(source))?.linkedAniListId ?? null;
}

export async function getUniqueAniListIdsForSources(
	sources: readonly SourceIdentity[],
): Promise<Record<string, AniListId | null>> {
	const uniqueSources = new Map(
		sources.map((source) => [sourceIdentityKey(source), source]),
	);
	if (uniqueSources.size === 0) return {};
	const getRecord = await readSnapshotRecords();
	return Object.fromEntries(
		[...uniqueSources].map(([key, source]) => [
			key,
			source.source === "anilist"
				? source.id
				: (getRecord(key)?.linkedAniListId ?? null),
		]),
	);
}

export async function getSourceAliasesByAniListId(): Promise<
	ReadonlyMap<AniListId, SourceIdentity[]>
> {
	const snapshot = await readSnapshot();
	const records = snapshot?.records ?? {};
	const aliasesByAniListId = new Map<AniListId, SourceIdentity[]>();
	for (const [rawKey, record] of Object.entries(records)) {
		const alias = parseSourceIdentityKey(rawKey);
		if (alias?.source !== "mal" || !isUpstreamMappingRecord(record)) continue;
		const { linkedAniListId } = record;
		if (linkedAniListId === undefined) continue;
		const aliases = aliasesByAniListId.get(linkedAniListId) ?? [];
		aliases.push(alias);
		aliasesByAniListId.set(linkedAniListId, aliases);
	}
	for (const aliases of aliasesByAniListId.values()) {
		aliases.sort((left, right) =>
			sourceIdentityKey(left).localeCompare(sourceIdentityKey(right)),
		);
	}
	return aliasesByAniListId;
}

export async function migrateUpstreamStore(): Promise<boolean> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const { [UPSTREAM_KEY]: raw } =
				await browser.storage.local.get(UPSTREAM_KEY);
			if (raw == null || (isObject(raw) && raw.version === 1)) {
				snapshotCache.prime(currentSnapshot(raw));
				return false;
			}
			await browser.storage.local.remove(UPSTREAM_KEY);
			snapshotCache.prime(null);
			return true;
		});
	writes = next.then(
		() => {},
		() => {},
	);
	return next;
}

export async function refreshUpstreamMappings(): Promise<boolean> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const previous = await readSnapshot();
			if (
				previous &&
				Date.now() - previous.fetchedAt < UPSTREAM_REFRESH_INTERVAL_MS
			) {
				return false;
			}
			const result = await downloadAniBridgeMappings({
				...(previous?.etag ? { etag: previous.etag } : {}),
			});
			if (result.status === "not-modified") {
				if (!previous)
					throw new Error("AniBridge returned 304 without stored entries.");
				const refreshed = { ...previous, fetchedAt: Date.now() };
				await upstreamMappings.setValue(refreshed);
				snapshotCache.prime(refreshed);
				return false;
			}

			const records = result.parsed.records;
			const changed =
				JSON.stringify(previous?.records ?? {}) !== JSON.stringify(records);
			const snapshot: UpstreamSnapshot = {
				version: 1,
				records,
				fetchedAt: Date.now(),
				...(result.etag ? { etag: result.etag } : {}),
			};
			await upstreamMappings.setValue(snapshot);
			snapshotCache.prime(snapshot);
			return changed;
		});
	writes = next.then(
		() => {},
		() => {},
	);
	return next;
}

export async function clearUpstreamMappings(): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			await upstreamMappings.setValue(null);
			snapshotCache.prime(null);
		});
	writes = next.then(
		() => {},
		() => {},
	);
	await next;
}

function readSnapshot(): Promise<UpstreamSnapshot | null> {
	return snapshotCache.read();
}

export async function readSnapshotRecords(): Promise<
	(key: string) => UpstreamMappingRecord | undefined
> {
	const snapshot = await readSnapshot();
	const records = snapshot?.records;
	return (key) => {
		const record =
			records && Object.hasOwn(records, key) ? records[key] : undefined;
		return isUpstreamMappingRecord(record) ? record : undefined;
	};
}

function currentSnapshot(value: unknown): UpstreamSnapshot | null {
	return isObject(value) && value.version === 1 && isObject(value.records)
		? (value as UpstreamSnapshot)
		: null;
}

function withoutLink(record: UpstreamMappingRecord): MappingRecord {
	return structuredClone({
		facts: record.facts,
		...(record.conflicts ? { conflicts: record.conflicts } : {}),
		...(record.scopes ? { scopes: record.scopes } : {}),
	});
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
