/** Downloads and stores normalized AniBridge mappings. */
// src/mapping/upstream.store.ts

import { storage } from "@wxt-dev/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import type { Provider } from "@/providers/types";
import { downloadAniBridgeMappings } from "@/mapping/upstream/anibridge.client";
import type {
	AniListCrosswalkMappings,
	SeerrUpstreamMappings,
	UpstreamMappings,
} from "@/mapping/upstream/anibridge.parser";
import {
	normalizeStoredSourceKey,
	normalizeSourceIdentity,
	parseSourceIdentityKey,
	sourceIdentityKey,
	type SourceIdentity,
} from "./source-identity";
import type {
	AniBridgeEntries,
	AniBridgeTarget,
	SeerrUpstreamTarget,
	UpstreamTarget,
} from "./types";

const UPSTREAM_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

type UpstreamSnapshot = {
	entries?: AniBridgeEntries;
	/** LEGACY: remove when Task 15 removes persisted consumer projections. */
	mappings: UpstreamMappings;
	seerrTargets?: SeerrUpstreamMappings;
	aniListCrosswalks?: AniListCrosswalkMappings;
	fetchedAt: number;
	etag?: string;
};

export type SourceUpstreamRecord = {
	source: SourceIdentity;
	targets: UpstreamTarget[];
};

export type SeerrUpstreamRecord = {
	anilistId: AniListId;
	target: SeerrUpstreamTarget;
};

const upstreamMappings = storage.defineItem<UpstreamSnapshot | null>(
	"local:mapping:upstream",
	{
		fallback: null,
	},
);

let writes: Promise<void> = Promise.resolve();

export async function getUpstreamTargets(
	provider: Provider,
	source: SourceIdentity | AniListId,
): Promise<UpstreamTarget[]> {
	const snapshot = await getSnapshot();
	const anilistId = getSnapshotAniListId(
		snapshot,
		normalizeSourceIdentity(source),
	);
	if (anilistId === null) return [];

	return projectUpstreamTargets(snapshot?.entries?.[anilistId] ?? []).filter(
		(target) => target.provider === provider,
	);
}

export async function listSourceUpstreamMappings(): Promise<
	SourceUpstreamRecord[]
> {
	const snapshot = await getSnapshot();
	const records: SourceUpstreamRecord[] = [];
	const targetsByAniListId = new Map<AniListId, UpstreamTarget[]>();

	for (const [rawAniListId, entries] of Object.entries(
		snapshot?.entries ?? {},
	)) {
		const anilistId = parseAniListIdOrNull(Number(rawAniListId));
		if (anilistId === null) continue;

		const targets = projectUpstreamTargets(entries);
		if (targets.length === 0) continue;

		targetsByAniListId.set(anilistId, targets);
		records.push({ source: { source: "anilist", id: anilistId }, targets });
	}

	for (const [rawSourceKey, rawAniListId] of Object.entries(
		snapshot?.aniListCrosswalks ?? {},
	)) {
		const source = parseSourceIdentityKey(rawSourceKey);
		const anilistId = parseAniListIdOrNull(rawAniListId);
		if (source?.source !== "mal" || anilistId === null) continue;

		const targets = targetsByAniListId.get(anilistId);
		if (targets !== undefined) {
			records.push({ source, targets: [...targets] });
		}
	}

	return records;
}

export async function getUniqueAniListIdForSource(
	source: SourceIdentity,
): Promise<AniListId | null> {
	if (source.source === "anilist") return source.id;

	const snapshot = await getSnapshot();
	return snapshot?.aniListCrosswalks?.[sourceIdentityKey(source)] ?? null;
}

export async function listSeerrUpstreamTargets(
	ids: readonly AniListId[],
): Promise<SeerrUpstreamRecord[]> {
	const requestedIds = new Set(ids);
	if (requestedIds.size === 0) return [];

	const snapshot = await getSnapshot();
	const records: SeerrUpstreamRecord[] = [];

	for (const [rawSourceKey, target] of Object.entries(
		snapshot?.seerrTargets ?? {},
	)) {
		const source = parseSourceIdentityKey(rawSourceKey);

		/** LEGACY: remove when stored upstream snapshots are migrated past MAL-keyed Seerr targets. */
		if (source?.source === "anilist" && requestedIds.has(source.id)) {
			records.push({ anilistId: source.id, target });
		}
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function listAllSeerrUpstreamTargets(): Promise<
	SeerrUpstreamRecord[]
> {
	const snapshot = await getSnapshot();
	const records: SeerrUpstreamRecord[] = [];

	for (const [rawSourceKey, target] of Object.entries(
		snapshot?.seerrTargets ?? {},
	)) {
		const source = parseSourceIdentityKey(rawSourceKey);

		/** LEGACY: remove when stored upstream snapshots are migrated past MAL-keyed Seerr targets. */
		if (source?.source === "anilist") {
			records.push({ anilistId: source.id, target });
		}
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function refreshUpstreamMappings(): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const previous = await getSnapshot();
			if (
				previous?.entries !== undefined &&
				previous?.mappings &&
				previous.seerrTargets &&
				previous.aniListCrosswalks &&
				Date.now() - previous.fetchedAt < UPSTREAM_REFRESH_INTERVAL_MS
			) {
				return;
			}

			/** LEGACY: remove full-refresh fallback after Task 15 removes old projection-only snapshots. */
			const etag =
				previous?.entries === undefined ? undefined : previous.etag;
			const result = await downloadAniBridgeMappings({ etag });
			if (result.status === "not-modified") {
				if (!previous || previous.entries === undefined) {
					throw new Error("AniBridge returned 304 without stored mappings.");
				}
				await upstreamMappings.setValue({
					...previous,
					fetchedAt: Date.now(),
				});
				return;
			}

			await upstreamMappings.setValue({
				entries: result.parsed.entries,
				mappings: result.parsed.mappings,
				seerrTargets: result.parsed.seerrTargets,
				aniListCrosswalks: result.parsed.aniListCrosswalks,
				fetchedAt: Date.now(),
				...(result.etag ? { etag: result.etag } : {}),
			});
		});

	writes = next.then(
		() => {},
		() => {},
	);

	await next;
}

export async function clearUpstreamMappings(): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(() => upstreamMappings.setValue(null));

	writes = next.then(
		() => {},
		() => {},
	);

	await next;
}

async function getSnapshot(): Promise<UpstreamSnapshot | null> {
	const snapshot = await upstreamMappings.getValue();
	return snapshot ? normalizeSnapshot(snapshot) : null;
}

function normalizeSnapshot(snapshot: UpstreamSnapshot): UpstreamSnapshot {
	return {
		...snapshot,
		mappings: normalizeMappingKeys(snapshot.mappings),
		...(snapshot.seerrTargets === undefined
			? {}
			: { seerrTargets: normalizeSeerrTargetKeys(snapshot.seerrTargets) }),
		...(snapshot.aniListCrosswalks === undefined
			? {}
			: {
					aniListCrosswalks: normalizeAniListCrosswalkKeys(
						snapshot.aniListCrosswalks,
					),
				}),
	};
}

function normalizeMappingKeys(mappings: UpstreamMappings): UpstreamMappings {
	const normalized: UpstreamMappings = {};

	for (const [rawKey, targets] of Object.entries(mappings)) {
		const key = normalizeStoredSourceKey(rawKey);
		if (key !== null) {
			normalized[key] = targets;
		}
	}

	return normalized;
}

function normalizeSeerrTargetKeys(
	targets: SeerrUpstreamMappings,
): SeerrUpstreamMappings {
	const normalized: SeerrUpstreamMappings = {};

	for (const [rawKey, target] of Object.entries(targets)) {
		const key = normalizeStoredSourceKey(rawKey);
		if (key !== null) {
			normalized[key] = target;
		}
	}

	return normalized;
}

function normalizeAniListCrosswalkKeys(
	crosswalks: AniListCrosswalkMappings,
): AniListCrosswalkMappings {
	const normalized: AniListCrosswalkMappings = {};

	for (const [rawKey, anilistId] of Object.entries(crosswalks)) {
		const key = normalizeStoredSourceKey(rawKey);
		if (key !== null) {
			normalized[key] = anilistId;
		}
	}

	return normalized;
}

function getSnapshotAniListId(
	snapshot: UpstreamSnapshot | null,
	source: SourceIdentity,
): AniListId | null {
	if (source.source === "anilist") return source.id;

	return snapshot?.aniListCrosswalks?.[sourceIdentityKey(source)] ?? null;
}

function projectUpstreamTargets(
	targets: readonly AniBridgeTarget[],
): UpstreamTarget[] {
	return targets.flatMap((target) => {
		const projected = projectUpstreamTarget(target);
		return projected === null ? [] : [projected];
	});
}

function projectUpstreamTarget(
	target: AniBridgeTarget,
): UpstreamTarget | null {
	switch (target.kind) {
		case "tmdb-movie": {
			return { provider: "radarr", providerId: target.id };
		}
		case "tvdb-show": {
			return {
				provider: "sonarr",
				providerId: target.id,
				...(target.season === undefined ? {} : { season: target.season }),
			};
		}
		case "tmdb-show": {
			return null;
		}
	}
}
