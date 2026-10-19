/** Downloads and persists normalized shared AniBridge fact layers. */

import { browser } from "wxt/browser";
import { storage } from "wxt/utils/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import { downloadAniBridgeMappings } from "@/mapping/upstream/anibridge.client";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type TmdbId,
	type TvdbId,
} from "@/providers/schemas";
import {
	createMappingRecord,
	type MappingRecord,
	type UpstreamMappingRecord,
} from "./mapping-record";
import { normalizeSeasonNumbers } from "./season-numbers";
import { normalizeLegacySeerrTarget, type SeerrTarget } from "./types";
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

let writes: Promise<void> = Promise.resolve();

export async function getSourceUpstreamLayers(
	source: SourceIdentity,
	linkedAniListId?: AniListId | null,
): Promise<SourceUpstreamLayers> {
	const snapshot = await readSnapshot();
	const directRecord = snapshot?.records[sourceIdentityKey(source)];
	let anilistId: AniListId | null;
	if (source.source === "anilist") anilistId = source.id;
	else if (linkedAniListId === undefined) {
		anilistId = directRecord?.linkedAniListId ?? null;
	} else anilistId = linkedAniListId;
	const canonicalRecord =
		anilistId === null
			? undefined
			: snapshot?.records[
					sourceIdentityKey({ source: "anilist", id: anilistId })
				];
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
		if (identity?.source !== "anilist") return [];
		return [{ anilistId: identity.id, record: structuredClone(record) }];
	});
}

export async function getUniqueAniListIdForSource(
	source: SourceIdentity,
): Promise<AniListId | null> {
	if (source.source === "anilist") return source.id;
	const snapshot = await readSnapshot();
	return snapshot?.records[sourceIdentityKey(source)]?.linkedAniListId ?? null;
}

export async function getUniqueAniListIdsForSources(
	sources: readonly SourceIdentity[],
): Promise<Record<string, AniListId | null>> {
	const uniqueSources = new Map(
		sources.map((source) => [sourceIdentityKey(source), source]),
	);
	if (uniqueSources.size === 0) return {};
	const snapshot = await readSnapshot();
	return Object.fromEntries(
		[...uniqueSources].map(([key, source]) => [
			key,
			source.source === "anilist"
				? source.id
				: (snapshot?.records[key]?.linkedAniListId ?? null),
		]),
	);
}

export async function getSourceAliasesByAniListId(): Promise<
	ReadonlyMap<AniListId, SourceIdentity[]>
> {
	const snapshot = await readSnapshot();
	const aliasesByAniListId = new Map<AniListId, SourceIdentity[]>();
	for (const [rawKey, record] of Object.entries(snapshot?.records ?? {})) {
		const alias = parseSourceIdentityKey(rawKey);
		if (alias?.source !== "mal" || record.linkedAniListId === undefined) {
			continue;
		}
		const aliases = aliasesByAniListId.get(record.linkedAniListId) ?? [];
		aliases.push(alias);
		aliasesByAniListId.set(record.linkedAniListId, aliases);
	}
	for (const aliases of aliasesByAniListId.values()) {
		aliases.sort((left, right) =>
			sourceIdentityKey(left).localeCompare(sourceIdentityKey(right)),
		);
	}
	return aliasesByAniListId;
}

export async function migrateUpstreamStore(): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const snapshot = await readSnapshot();
			if (snapshot) await upstreamMappings.setValue(snapshot);
		});
	writes = next.then(
		() => {},
		() => {},
	);
	await next;
}

export async function refreshUpstreamMappings(): Promise<boolean> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const stored = await browser.storage.local.get(UPSTREAM_KEY);
			const rawStored = stored[UPSTREAM_KEY];
			const previous = decodeSnapshot(rawStored);
			const hasVersionedSnapshot =
				isObject(rawStored) && rawStored.version === 1;
			if (
				hasVersionedSnapshot &&
				previous &&
				Date.now() - previous.fetchedAt < UPSTREAM_REFRESH_INTERVAL_MS
			) {
				return false;
			}
			const result = await downloadAniBridgeMappings({
				...(hasVersionedSnapshot && previous?.etag
					? { etag: previous.etag }
					: {}),
			});
			if (result.status === "not-modified") {
				if (!previous)
					throw new Error("AniBridge returned 304 without stored entries.");
				await upstreamMappings.setValue({ ...previous, fetchedAt: Date.now() });
				return false;
			}

			const records = result.parsed.records;
			const changed =
				JSON.stringify(previous?.records ?? {}) !== JSON.stringify(records);
			await upstreamMappings.setValue({
				version: 1,
				records,
				fetchedAt: Date.now(),
				...(result.etag ? { etag: result.etag } : {}),
			});
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
		.then(() => upstreamMappings.setValue(null));
	writes = next.then(
		() => {},
		() => {},
	);
	await next;
}

async function readSnapshot(): Promise<UpstreamSnapshot | null> {
	const stored = await browser.storage.local.get(UPSTREAM_KEY);
	return decodeSnapshot(stored[UPSTREAM_KEY]);
}

/** LEGACY: direct-upgrade decoder for released v2, branch, and Task 04 snapshots. */
function decodeSnapshot(value: unknown): UpstreamSnapshot | null {
	if (!isObject(value)) return null;
	const fetchedAt = validTimestamp(value.fetchedAt);
	if (fetchedAt === null) return null;
	const etag =
		typeof value.etag === "string" && value.etag ? value.etag : undefined;
	if (value.version === 1 && isObject(value.records)) {
		return {
			version: 1,
			records: decodeLayerRecords(value.records),
			fetchedAt,
			...(etag ? { etag } : {}),
		};
	}

	let records: Record<string, UpstreamMappingRecord> = {};
	if (isObject(value.records)) {
		records = decodeRawSourceRecords(value.records);
	} else if (isObject(value.entries)) {
		records = decodeRawSourceRecords(value.entries);
		if (isObject(value.aniListCrosswalks)) {
			for (const [key, rawId] of Object.entries(value.aniListCrosswalks)) {
				if (parseSourceIdentityKey(key)?.source !== "mal") continue;
				const linkedAniListId = parseAniListIdOrNull(rawId);
				if (linkedAniListId === null) continue;
				(records[key] ??= { facts: {} }).linkedAniListId = linkedAniListId;
			}
		}
	} else if (isObject(value.mappings)) {
		records = decodeV2Mappings(value.mappings, value.seerrTargets);
	}
	return {
		version: 1,
		records,
		fetchedAt,
		...(etag ? { etag } : {}),
	};
}

function decodeLayerRecords(
	value: Record<string, unknown>,
): Record<string, UpstreamMappingRecord> {
	const records: Record<string, UpstreamMappingRecord> = {};
	for (const [key, rawRecord] of Object.entries(value)) {
		if (parseSourceIdentityKey(key) === null || !isObject(rawRecord)) continue;
		const linkedAniListId = parseAniListIdOrNull(rawRecord.linkedAniListId);
		const layer = decodeCurrentMappingRecord(rawRecord);
		records[key] = {
			...layer,
			...(linkedAniListId === null ? {} : { linkedAniListId }),
		};
	}
	return records;
}

function decodeCurrentMappingRecord(
	record: Record<string, unknown>,
): MappingRecord {
	const facts = isObject(record.facts) ? record.facts : {};
	const conflicts = isObject(record.conflicts) ? record.conflicts : {};
	const scopes = isObject(record.scopes) ? record.scopes : {};
	const tmdbMovie = [
		facts.tmdbMovie,
		...(Array.isArray(conflicts.tmdbMovie) ? conflicts.tmdbMovie : []),
	].flatMap((value) => {
		const id = parseTmdbIdOrNull(value);
		return id === null ? [] : [id];
	});
	return createMappingRecord({
		tmdbMovie,
		tmdbShow: decodeShowCandidates(
			facts.tmdbShow,
			conflicts.tmdbShow,
			scopes.tmdbShow,
			parseTmdbIdOrNull,
		),
		tvdbShow: decodeShowCandidates(
			facts.tvdbShow,
			conflicts.tvdbShow,
			scopes.tvdbShow,
			parseTvdbIdOrNull,
		),
	});
}

function decodeShowCandidates<TId extends number>(
	fact: unknown,
	conflict: unknown,
	scope: unknown,
	parseId: (value: unknown) => TId | null,
): Array<{ id: TId; seasons?: number[] }> {
	return [fact, ...(Array.isArray(conflict) ? conflict : [])].flatMap(
		(value) => {
			const candidate: Record<string, unknown> = isObject(value)
				? value
				: { id: value };
			const id = parseId(candidate.id);
			if (id === null) return [];
			const matchedScope: Record<string, unknown> =
				isObject(scope) && parseId(scope.id) === id ? scope : candidate;
			const seasons = validSeasons(matchedScope.seasons);
			return [{ id, ...(seasons?.length ? { seasons } : {}) }];
		},
	);
}

function decodeRawSourceRecords(
	value: Record<string, unknown>,
): Record<string, UpstreamMappingRecord> {
	const records: Record<string, UpstreamMappingRecord> = {};
	for (const [key, rawRecord] of Object.entries(value)) {
		if (parseSourceIdentityKey(key) === null) continue;
		let record: Record<string, unknown> | null = null;
		if (Array.isArray(rawRecord)) {
			record = { targets: rawRecord };
		} else if (isObject(rawRecord)) {
			record = rawRecord;
		}
		if (!record || !Array.isArray(record.targets)) continue;
		const linkedAniListId = parseAniListIdOrNull(record.linkedAniListId);
		records[key] = {
			...layerFromRawTargets(record.targets),
			...(linkedAniListId === null ? {} : { linkedAniListId }),
		};
	}
	return records;
}

function decodeV2Mappings(
	mappings: Record<string, unknown>,
	seerrTargets: unknown,
): Record<string, UpstreamMappingRecord> {
	const records: Record<string, UpstreamMappingRecord> = {};
	for (const [rawId, rawTargets] of Object.entries(mappings)) {
		const anilistId = parseAniListIdOrNull(Number(rawId));
		if (
			anilistId === null ||
			rawId !== String(anilistId) ||
			!Array.isArray(rawTargets)
		)
			continue;
		records[`anilist:${anilistId}`] = layerFromRawTargets(rawTargets);
	}
	if (!isObject(seerrTargets)) return records;
	for (const [rawId, rawTarget] of Object.entries(seerrTargets)) {
		const anilistId = parseAniListIdOrNull(Number(rawId));
		if (
			anilistId === null ||
			rawId !== String(anilistId) ||
			!isObject(rawTarget)
		)
			continue;
		const target = normalizeLegacySeerrTarget(rawTarget as SeerrTarget);
		if (!target) continue;
		const record = (records[`anilist:${anilistId}`] ??= { facts: {} });
		mergeLegacySeerrTarget(record, target);
	}
	return records;
}

function layerFromRawTargets(targets: readonly unknown[]): MappingRecord {
	const tmdbMovie: TmdbId[] = [];
	const tmdbShow: Array<{ id: TmdbId; seasons?: number[] }> = [];
	const tvdbShow: Array<{ id: TvdbId; seasons?: number[] }> = [];
	for (const target of targets) {
		if (!isObject(target)) continue;
		switch (target.kind) {
			case "tmdb-movie": {
				const id = parseTmdbIdOrNull(target.id);
				if (id !== null) tmdbMovie.push(id);
				break;
			}
			case "tmdb-show": {
				const id = parseTmdbIdOrNull(target.id);
				if (id !== null) tmdbShow.push(showCandidate(id, target.season));
				break;
			}
			case "tvdb-show": {
				const id = parseTvdbIdOrNull(target.id);
				if (id !== null) tvdbShow.push(showCandidate(id, target.season));
				break;
			}
			default: {
				if (target.provider === "radarr") {
					const id = parseTmdbIdOrNull(target.providerId);
					if (id !== null) tmdbMovie.push(id);
				} else if (target.provider === "sonarr") {
					const id = parseTvdbIdOrNull(target.providerId);
					if (id !== null) tvdbShow.push(showCandidate(id, target.season));
				}
			}
		}
	}
	return createMappingRecord({ tmdbMovie, tmdbShow, tvdbShow });
}

function mergeLegacySeerrTarget(
	record: UpstreamMappingRecord,
	target: SeerrTarget,
): void {
	if (target.mediaType === "movie") {
		record.facts.tmdbMovie ??= target.tmdbId;
		return;
	}
	record.facts.tmdbShow = target.tmdbId;
	const seasons = normalizeSeasonNumbers(target.seasons ?? []);
	if (seasons.length > 0) {
		record.scopes ??= {};
		record.scopes.tmdbShow = { id: target.tmdbId, seasons };
	}
}

function withoutLink(record: UpstreamMappingRecord): MappingRecord {
	return structuredClone({
		facts: record.facts,
		...(record.conflicts ? { conflicts: record.conflicts } : {}),
		...(record.scopes ? { scopes: record.scopes } : {}),
	});
}

function showCandidate<TId extends number>(
	id: TId,
	season: unknown,
): { id: TId; seasons?: number[] } {
	return Number.isSafeInteger(season) && (season as number) >= 0
		? { id, seasons: [season as number] }
		: { id };
}

function validSeasons(value: unknown): number[] | undefined {
	return Array.isArray(value)
		? value.flatMap((season) =>
				Number.isSafeInteger(season) && (season as number) >= 0
					? [season as number]
					: [],
			)
		: undefined;
}

function validTimestamp(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
