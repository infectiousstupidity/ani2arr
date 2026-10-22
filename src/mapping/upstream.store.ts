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
import type { Provider } from "@/providers/types";
import {
	createExternalIdLayer,
	normalizeExternalIdLayer,
	projectRadarrTarget,
	projectSonarrTarget,
	type ExternalIdLayer,
} from "./external-id-facts";
import { normalizeSeasonNumbers } from "./season-numbers";
import {
	normalizeSeerrTarget,
	projectSeerrTarget,
	type SeerrTarget,
} from "./seerr-target";
import {
	parseSourceIdentityKey,
	sourceIdentityKey,
	type SourceIdentity,
} from "./source-identity";
import type {
	ArrUpstreamTarget,
	SeerrUpstreamTarget,
	UpstreamSourceRecord,
} from "./types";

const UPSTREAM_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_KEY = "mapping:upstream";

export type UpstreamLayerRecord = ExternalIdLayer & {
	linkedAniListId?: AniListId;
};

type UpstreamSnapshot = {
	version: 1;
	records: Record<string, UpstreamLayerRecord>;
	fetchedAt: number;
	etag?: string;
};

export type UpstreamMappingFact = {
	anilistId: AniListId;
	record: UpstreamLayerRecord;
	targets: ArrUpstreamTarget[];
};

export type ArrUpstreamMappingFact = {
	anilistId: AniListId;
	targets: ArrUpstreamTarget[];
};

export type SourceUpstreamLayers = {
	anilistId: AniListId | null;
	direct: ExternalIdLayer | null;
	canonical: ExternalIdLayer | null;
};

export type SourceUpstreamMapping = {
	anilistId: AniListId | null;
	targets: ArrUpstreamTarget[];
};

type SeerrTargetProjection =
	| { kind: "missing" }
	| { kind: "target"; target: SeerrUpstreamTarget }
	| { kind: "conflict" };

export type SeerrUpstreamRecord =
	| { anilistId: AniListId; kind: "target"; target: SeerrUpstreamTarget }
	| { anilistId: AniListId; kind: "conflict" };

export type SourceSeerrUpstreamMapping = {
	anilistId: AniListId | null;
} & SeerrTargetProjection;

const upstreamMappings = storage.defineItem<UpstreamSnapshot | null>(
	"local:mapping:upstream",
	{ fallback: null },
);

let writes: Promise<void> = Promise.resolve();

export async function getSourceUpstreamLayers(
	source: SourceIdentity,
): Promise<SourceUpstreamLayers> {
	const snapshot = await readSnapshot();
	const directRecord = snapshot?.records[sourceIdentityKey(source)];
	const anilistId =
		source.source === "anilist"
			? source.id
			: (directRecord?.linkedAniListId ?? null);
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
	UpstreamMappingFact[]
> {
	const snapshot = await readSnapshot();
	return Object.entries(snapshot?.records ?? {}).flatMap(([rawKey, record]) => {
		const identity = parseSourceIdentityKey(rawKey);
		if (identity?.source !== "anilist") return [];
		return [
			{
				anilistId: identity.id,
				record: structuredClone(record),
				targets: projectArrTargets(record),
			},
		];
	});
}

export async function getSourceUpstreamMapping(
	provider: Provider,
	source: SourceIdentity,
): Promise<SourceUpstreamMapping> {
	const layers = await getSourceUpstreamLayers(source);
	const selected = selectProviderLayer(provider, layers);
	return {
		anilistId: layers.anilistId,
		targets: selected ? projectProviderTargets(provider, selected) : [],
	};
}

export async function listAniListUpstreamMappings(): Promise<
	ArrUpstreamMappingFact[]
> {
	const records = await listAniListUpstreamLayers();
	return records.map(({ anilistId, targets }) => ({
		anilistId,
		targets,
	}));
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
		if (
			alias?.source !== "mal" ||
			record.linkedAniListId === undefined
		) {
			continue;
		}
		const aliases = aliasesByAniListId.get(record.linkedAniListId) ?? [];
		aliases.push(alias);
		aliasesByAniListId.set(record.linkedAniListId, aliases);
	}
	for (const aliases of aliasesByAniListId.values()) {
		aliases.sort((left, right) => sourceIdentityKey(left).localeCompare(sourceIdentityKey(right)));
	}
	return aliasesByAniListId;
}

export async function getSourceSeerrUpstreamMapping(
	source: SourceIdentity,
	mediaType?: "movie" | "tv",
): Promise<SourceSeerrUpstreamMapping> {
	const layers = await getSourceUpstreamLayers(source);
	const direct = layers.direct
		? projectSeerrLayer(layers.direct, mediaType)
		: { kind: "missing" as const };
	if (
		direct.kind !== "missing" ||
		source.source === "anilist" ||
		layers.anilistId === null
	) {
		return { anilistId: layers.anilistId, ...direct };
	}
	return {
		anilistId: layers.anilistId,
		...(layers.canonical
			? projectSeerrLayer(layers.canonical, mediaType)
			: { kind: "missing" as const }),
	};
}

export async function listSeerrUpstreamTargets(
	ids: readonly AniListId[],
	mediaType?: "movie" | "tv",
): Promise<SeerrUpstreamRecord[]> {
	const requested = new Set(ids);
	if (requested.size === 0) return [];
	const records = await listAniListUpstreamLayers();
	return records
		.flatMap(({ anilistId, record }) => {
			if (!requested.has(anilistId)) return [];
			const projection = projectSeerrLayer(record, mediaType);
			return projection.kind === "missing"
				? []
				: [{ anilistId, ...projection } as SeerrUpstreamRecord];
		})
		.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function listAllSeerrUpstreamTargets(
	mediaType?: "movie" | "tv",
): Promise<SeerrUpstreamRecord[]> {
	const records = await listAniListUpstreamLayers();
	return listSeerrUpstreamTargets(
		records.map((record) => record.anilistId),
		mediaType,
	);
}

export async function migrateUpstreamStore(): Promise<void> {
	const next = writes.catch(() => {}).then(async () => {
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
	const next = writes.catch(() => {}).then(async () => {
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
			if (!previous) throw new Error("AniBridge returned 304 without stored entries.");
			await upstreamMappings.setValue({ ...previous, fetchedAt: Date.now() });
			return false;
		}

		const records = Object.fromEntries(
			Object.entries(result.parsed.records).map(([key, record]) => [
				key,
				upstreamLayerFromSourceRecord(record),
			]),
		);
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
	const next = writes.catch(() => {}).then(() => upstreamMappings.setValue(null));
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
	const etag = typeof value.etag === "string" && value.etag ? value.etag : undefined;
	if (value.version === 1 && isObject(value.records)) {
		return {
			version: 1,
			records: decodeLayerRecords(value.records),
			fetchedAt,
			...(etag ? { etag } : {}),
		};
	}

	let records: Record<string, UpstreamLayerRecord> = {};
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
): Record<string, UpstreamLayerRecord> {
	const records: Record<string, UpstreamLayerRecord> = {};
	for (const [key, rawRecord] of Object.entries(value)) {
		if (parseSourceIdentityKey(key) === null || !isObject(rawRecord)) continue;
		const linkedAniListId = parseAniListIdOrNull(rawRecord.linkedAniListId);
		const layer = normalizeExternalIdLayer({
			facts: isObject(rawRecord.facts) ? rawRecord.facts : {},
			...(isObject(rawRecord.conflicts)
				? { conflicts: rawRecord.conflicts }
				: {}),
			...(isObject(rawRecord.scopes) ? { scopes: rawRecord.scopes } : {}),
			...(Array.isArray(rawRecord.tvShowPairs)
				? { tvShowPairs: rawRecord.tvShowPairs }
				: {}),
		});
		records[key] = {
			...layer,
			...(linkedAniListId === null ? {} : { linkedAniListId }),
		};
	}
	return records;
}

function decodeRawSourceRecords(
	value: Record<string, unknown>,
): Record<string, UpstreamLayerRecord> {
	const records: Record<string, UpstreamLayerRecord> = {};
	for (const [key, rawRecord] of Object.entries(value)) {
		if (parseSourceIdentityKey(key) === null) continue;
		const record = Array.isArray(rawRecord)
			? { targets: rawRecord }
			: (isObject(rawRecord)
				? rawRecord
				: null);
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
): Record<string, UpstreamLayerRecord> {
	const records: Record<string, UpstreamLayerRecord> = {};
	for (const [rawId, rawTargets] of Object.entries(mappings)) {
		const anilistId = parseAniListIdOrNull(Number(rawId));
		if (anilistId === null || rawId !== String(anilistId) || !Array.isArray(rawTargets)) continue;
		records[`anilist:${anilistId}`] = layerFromRawTargets(rawTargets);
	}
	if (!isObject(seerrTargets)) return records;
	for (const [rawId, rawTarget] of Object.entries(seerrTargets)) {
		const anilistId = parseAniListIdOrNull(Number(rawId));
		if (anilistId === null || rawId !== String(anilistId) || !isObject(rawTarget)) continue;
		const target = normalizeSeerrTarget(rawTarget as SeerrTarget);
		if (!target) continue;
		const record = (records[`anilist:${anilistId}`] ??= { facts: {} });
		mergeLegacySeerrTarget(record, target);
	}
	return records;
}

function upstreamLayerFromSourceRecord(
	record: UpstreamSourceRecord,
): UpstreamLayerRecord {
	return {
		...layerFromRawTargets(record.targets),
		...(record.linkedAniListId === undefined
			? {}
			: { linkedAniListId: record.linkedAniListId }),
	};
}

function layerFromRawTargets(targets: readonly unknown[]): ExternalIdLayer {
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
	const layer = createExternalIdLayer({ tmdbMovie, tmdbShow, tvdbShow });
	const tmdbId = layer.facts.tmdbShow;
	const tvdbId = layer.facts.tvdbShow;
	if (tmdbId === undefined || tvdbId === undefined) return layer;
	const tmdbSeasons = candidateSeasons(tmdbShow, tmdbId);
	const tvdbSeasons = candidateSeasons(tvdbShow, tvdbId);
	return {
		...layer,
		tvShowPairs: [
			{
				tmdbShow: tmdbId,
				tvdbShow: tvdbId,
				...(tmdbSeasons.length > 0 ? { tmdbSeasons } : {}),
				...(tvdbSeasons.length > 0 ? { tvdbSeasons } : {}),
			},
		],
	};
}

function mergeLegacySeerrTarget(
	record: UpstreamLayerRecord,
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
	if (target.tvdbId !== undefined) {
		record.tvShowPairs = [
			{
				tmdbShow: target.tmdbId,
				tvdbShow: target.tvdbId,
				...(seasons.length > 0
					? { tmdbSeasons: seasons, tvdbSeasons: seasons }
					: {}),
			},
		];
	}
}

function selectProviderLayer(
	provider: Provider,
	layers: SourceUpstreamLayers,
): ExternalIdLayer | null {
	if (layers.direct) {
		const projection =
			provider === "sonarr"
				? projectSonarrTarget({ upstream: layers.direct })
				: projectRadarrTarget({ upstream: layers.direct });
		if (projection.kind !== "missing") return layers.direct;
	}
	return layers.canonical;
}

function projectProviderTargets(
	provider: Provider,
	layer: ExternalIdLayer,
): ArrUpstreamTarget[] {
	if (provider === "radarr") {
		const projection = projectRadarrTarget({ upstream: layer });
		if (projection.kind === "target") {
			return [{ provider, providerId: projection.target.tmdbId }];
		}
		return projection.kind === "conflict"
			? projection.candidates.map((providerId) => ({ provider, providerId }))
			: [];
	}
	const projection = projectSonarrTarget({ upstream: layer });
	if (projection.kind === "target") {
		return [
			{
				provider,
				providerId: projection.target.tvdbId,
				...(projection.target.season === undefined
					? {}
					: { season: projection.target.season }),
			},
		];
	}
	return projection.kind === "conflict"
		? projection.candidates.map(({ id, seasons }) => ({
				provider,
				providerId: id,
				...(seasons?.length === 1 ? { season: seasons[0] } : {}),
			}))
		: [];
}

function projectArrTargets(layer: ExternalIdLayer): ArrUpstreamTarget[] {
	return [
		...projectProviderTargets("sonarr", layer),
		...projectProviderTargets("radarr", layer),
	];
}

function projectSeerrLayer(
	layer: ExternalIdLayer,
	mediaType?: "movie" | "tv",
): SeerrTargetProjection {
	const projection = projectSeerrTarget({ upstream: layer }, mediaType);
	return projection.kind === "target"
		? { kind: "target", target: projection.target }
		: { kind: projection.kind };
}

function withoutLink(record: UpstreamLayerRecord): ExternalIdLayer {
	return structuredClone({
		facts: record.facts,
		...(record.conflicts ? { conflicts: record.conflicts } : {}),
		...(record.scopes ? { scopes: record.scopes } : {}),
		...(record.tvShowPairs ? { tvShowPairs: record.tvShowPairs } : {}),
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

function candidateSeasons<TId extends number>(
	candidates: readonly { id: TId; seasons?: number[] }[],
	id: TId,
): number[] {
	return normalizeSeasonNumbers(
		candidates.flatMap((candidate) =>
			candidate.id === id ? (candidate.seasons ?? []) : [],
		),
	);
}

function validTimestamp(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
