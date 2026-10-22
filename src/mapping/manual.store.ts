/** Persists shared manual external-ID facts and Arr-only decisions. */

import { browser } from "wxt/browser";
import { storage } from "wxt/utils/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import type { SourceIdentity } from "@/mapping/source-identity";
import {
	normalizeSourceIdentity,
	parseSourceIdentityKey,
	sourceIdentityKey,
	storageIdentity,
} from "@/mapping/source-identity";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type TmdbId,
	type TvdbId,
} from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import {
	normalizeExternalIdLayer,
	type LayerStore,
	type ManualLayerRecord,
	type ManualProviderDecision,
	type TvShowPairEvidence,
} from "./external-id-facts";
import { normalizeSeasonNumbers } from "./season-numbers";
import { normalizeSeerrTarget, type SeerrTarget } from "./seerr-target";

export type ManualMapping = {
	providerId: number;
	season?: number;
};

export type ManualFacts =
	| {
			mapping: ManualMapping;
			rejectedProviderIds?: number[];
	  }
	| {
			ignored: true;
			rejectedProviderIds?: number[];
	  }
	| {
			rejectedProviderIds: number[];
	  };

export type ManualRecord = {
	anilistId: AniListId;
	record: ManualLayerRecord;
};

type V1Override = { tvdbId: unknown; updatedAt: unknown };
type V1Ignore = { updatedAt: unknown };

const MANUAL_KEY = "mapping:manual";
const LEGACY_SEERR_KEY = "mapping:seerr-targets";
const V1_LOCAL_OVERRIDE_KEY = "mappingOverridesCache";
const V1_LOCAL_IGNORE_KEY = "ignoredMappingsCache";
const V1_SYNC_OVERRIDE_KEY = "mappingOverrides";
const V1_SYNC_IGNORE_KEY = "ignoredMappings";

const manualMappings = storage.defineItem<LayerStore<ManualLayerRecord>>(
	"local:mapping:manual",
	{ fallback: { version: 1, records: {} } },
);

let writes: Promise<void> = Promise.resolve();

export async function getManualLayerRecord(
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): Promise<ManualLayerRecord | null> {
	const source = normalizeSourceIdentity(identity);
	const store = await readManualStore();
	const canonical = store.records[
		sourceIdentityKey(storageIdentity(source, anilistId))
	];
	const alias = store.records[sourceIdentityKey(source)];
	if (canonical && alias && canonical !== alias) {
		return mergeManualRecords(canonical, alias);
	}
	const record = canonical ?? alias;
	return record ? structuredClone(record) : null;
}

export async function listAniListManualLayers(): Promise<ManualRecord[]> {
	const store = await readManualStore();
	return Object.entries(store.records).flatMap(([rawKey, record]) => {
		const identity = parseSourceIdentityKey(rawKey);
		return identity?.source === "anilist"
			? [{ anilistId: identity.id, record: structuredClone(record) }]
			: [];
	});
}

export function getManualDecision(
	record: ManualLayerRecord | null,
	provider: Provider,
): ManualProviderDecision | null {
	return record?.decisions?.[provider] ?? null;
}

export async function setManualMapping(
	provider: Provider,
	identity: SourceIdentity | AniListId,
	mapping: ManualMapping,
	anilistId?: AniListId,
): Promise<void> {
	const providerId =
		provider === "sonarr"
			? parseTvdbIdOrNull(mapping.providerId)
			: parseTmdbIdOrNull(mapping.providerId);
	if (providerId === null) throw new Error("Invalid manual mapping target.");

	await updateManualStore((store) => {
		const record = getMutableRecord(store, identity, anilistId);
		if (provider === "sonarr") {
			record.facts.tvdbShow = providerId as TvdbId;
			delete record.conflicts?.tvdbShow;
			setScope(record, "tvdbShow", providerId as TvdbId, mapping.season);
		} else {
			record.facts.tmdbMovie = providerId as TmdbId;
			delete record.conflicts?.tmdbMovie;
		}
		const previous = record.decisions?.[provider];
		const rejected = rejectedIds(previous, provider).filter(
			(id) => id !== providerId,
		);
		setDecision(record, provider, decisionWithRejected(provider, rejected));
	});
}

export async function clearManualMapping(
	provider: Provider,
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): Promise<void> {
	await updateManualStore((store) => {
		const record = getExistingMutableRecord(store, identity, anilistId);
		if (!record) return;
		if (provider === "sonarr") {
			delete record.facts.tvdbShow;
			delete record.conflicts?.tvdbShow;
			delete record.scopes?.tvdbShow;
		} else {
			delete record.facts.tmdbMovie;
			delete record.conflicts?.tmdbMovie;
		}
		removeEmptyRecord(store, identity, anilistId);
	});
}

export async function setIgnored(
	provider: Provider,
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): Promise<void> {
	await updateManualStore((store) => {
		const record = getMutableRecord(store, identity, anilistId);
		const rejectedProviderIds = rejectedIds(
			record.decisions?.[provider],
			provider,
		);
		setDecision(record, provider, {
			ignored: true,
			...decisionWithRejected(provider, rejectedProviderIds),
		});
	});
}

export async function clearIgnored(
	provider: Provider,
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): Promise<void> {
	await updateManualStore((store) => {
		const record = getExistingMutableRecord(store, identity, anilistId);
		if (!record?.decisions?.[provider]?.ignored) return;
		const rejectedProviderIds = rejectedIds(record.decisions[provider], provider);
		setDecision(
			record,
			provider,
			rejectedProviderIds.length > 0
				? decisionWithRejected(provider, rejectedProviderIds)
				: undefined,
		);
		removeEmptyRecord(store, identity, anilistId);
	});
}

export async function rejectAutoCandidate(
	provider: Provider,
	identity: SourceIdentity | AniListId,
	providerId: number,
	anilistId?: AniListId,
): Promise<void> {
	await updateManualStore((store) => {
		const record = getMutableRecord(store, identity, anilistId);
		const previous = record.decisions?.[provider];
		const rejectedProviderIds = rejectedIds(previous, provider);
		if (rejectedProviderIds.includes(providerId)) return;
		setDecision(record, provider, {
			...(previous?.ignored ? { ignored: true as const } : {}),
			...decisionWithRejected(provider, [...rejectedProviderIds, providerId]),
		});
	});
}

export async function clearRejectedAutoCandidate(
	provider: Provider,
	identity: SourceIdentity | AniListId,
	providerId: number,
	anilistId?: AniListId,
): Promise<void> {
	await updateManualStore((store) => {
		const record = getExistingMutableRecord(store, identity, anilistId);
		const previous = record?.decisions?.[provider];
		const previousRejected = rejectedIds(previous, provider);
		if (!record || !previousRejected.includes(providerId)) return;
		const rejectedProviderIds = previousRejected.filter(
			(id) => id !== providerId,
		);
		setDecision(record, provider, {
			...(previous?.ignored ? { ignored: true as const } : {}),
			...decisionWithRejected(provider, rejectedProviderIds),
		});
		removeEmptyRecord(store, identity, anilistId);
	});
}

export async function setManualSeerrTarget(
	identity: SourceIdentity | AniListId,
	target: SeerrTarget,
	anilistId?: AniListId,
): Promise<void> {
	const normalized = normalizeSeerrTarget(target);
	if (!normalized) throw new Error("Invalid Seerr target.");

	await updateManualStore((store) => {
		const record = getMutableRecord(store, identity, anilistId);
		if (normalized.mediaType === "movie") {
			record.facts.tmdbMovie = normalized.tmdbId;
			delete record.conflicts?.tmdbMovie;
			return;
		}

		record.facts.tmdbShow = normalized.tmdbId;
		delete record.conflicts?.tmdbShow;
		setSeerrTvEvidence(record, normalized);
	});
}

export async function clearManualSeerrTarget(
	identity: SourceIdentity | AniListId,
	mediaType: "movie" | "tv",
	anilistId?: AniListId,
): Promise<void> {
	await updateManualStore((store) => {
		const record = getExistingMutableRecord(store, identity, anilistId);
		if (!record) return;
		if (mediaType === "movie") {
			delete record.facts.tmdbMovie;
			delete record.conflicts?.tmdbMovie;
		} else {
			delete record.facts.tmdbShow;
			delete record.conflicts?.tmdbShow;
			delete record.scopes?.tmdbShow;
			delete record.tvShowPairs;
		}
		removeEmptyRecord(store, identity, anilistId);
	});
}

export async function migrateManualStore(): Promise<void> {
	await updateManualStore(() => {});
}

export async function consolidateManualAliases(
	aliasesByAniListId: ReadonlyMap<AniListId, SourceIdentity[]>,
): Promise<void> {
	await updateManualStore((store) => {
		for (const [anilistId, aliases] of aliasesByAniListId) {
			const canonicalKey = sourceIdentityKey({ source: "anilist", id: anilistId });
			let canonical = store.records[canonicalKey];
			for (const alias of aliases.toSorted((left, right) =>
				sourceIdentityKey(left).localeCompare(sourceIdentityKey(right)),
			)) {
				const aliasKey = sourceIdentityKey(alias);
				const aliasRecord = store.records[aliasKey];
				if (!aliasRecord) continue;
				canonical = mergeManualRecords(canonical, aliasRecord);
				delete store.records[aliasKey];
			}
			if (canonical) store.records[canonicalKey] = canonical;
		}
	});
}

export async function clearManualFacts(): Promise<void> {
	const next = writes.catch(() => {}).then(async () => {
		await manualMappings.setValue({ version: 1, records: {} });
		await removeLegacyManualKeys();
	});
	writes = next.then(
		() => {},
		() => {},
	);
	await next;
}

async function updateManualStore(
	update: (store: LayerStore<ManualLayerRecord>) => void,
): Promise<void> {
	const next = writes.catch(() => {}).then(async () => {
		const store = await readManualStore();
		update(store);
		await manualMappings.setValue(store);
		await removeLegacyManualKeys();
	});
	writes = next.then(
		() => {},
		() => {},
	);
	await next;
}

async function readManualStore(): Promise<LayerStore<ManualLayerRecord>> {
	const [local, sync] = await Promise.all([
		browser.storage.local.get([
			MANUAL_KEY,
			LEGACY_SEERR_KEY,
			V1_LOCAL_OVERRIDE_KEY,
			V1_LOCAL_IGNORE_KEY,
		]),
		browser.storage.sync.get([V1_SYNC_OVERRIDE_KEY, V1_SYNC_IGNORE_KEY]),
	]);
	return decodeManualStore(local, sync);
}

/** LEGACY: direct-upgrade decoder for released v1/v2 and pre-cutover Seerr data. */
function decodeManualStore(
	local: Record<string, unknown>,
	sync: Record<string, unknown>,
): LayerStore<ManualLayerRecord> {
	const current = local[MANUAL_KEY];
	if (isLayerStore(current)) return cloneLayerStore(current);

	const records: Record<string, ManualLayerRecord> = {};
	decodeProviderBuckets(current, records);
	decodeLegacySeerrTargets(local[LEGACY_SEERR_KEY], records);
	decodeV1Manual(local, sync, records);
	return { version: 1, records };
}

function decodeProviderBuckets(
	value: unknown,
	records: Record<string, ManualLayerRecord>,
): void {
	if (!isObject(value)) return;
	for (const provider of ["sonarr", "radarr"] as const) {
		const bucket = value[provider];
		if (!isObject(bucket)) continue;
		for (const [rawKey, rawFacts] of Object.entries(bucket)) {
			const key = legacySourceKey(rawKey);
			if (!key || !isObject(rawFacts)) continue;
			const record = (records[key] ??= emptyRecord());
			const rejectedProviderIds = Array.isArray(rawFacts.rejectedProviderIds)
				? rawFacts.rejectedProviderIds.filter(
						(id): id is number => Number.isSafeInteger(id) && id > 0,
					)
				: [];
			const ignored = rawFacts.ignored === true;
			if (ignored || rejectedProviderIds.length > 0) {
				setDecision(record, provider, {
					...(ignored ? { ignored: true } : {}),
					...decisionWithRejected(provider, rejectedProviderIds),
				});
			}
			if (!isObject(rawFacts.mapping)) continue;
			if (provider === "sonarr") {
				const id = parseTvdbIdOrNull(rawFacts.mapping.providerId);
				if (id === null) continue;
				record.facts.tvdbShow = id;
				const season = validSeason(rawFacts.mapping.season);
				if (season !== undefined) setScope(record, "tvdbShow", id, season);
			} else {
				const id = parseTmdbIdOrNull(rawFacts.mapping.providerId);
				if (id !== null) record.facts.tmdbMovie = id;
			}
		}
	}
}

function decodeLegacySeerrTargets(
	value: unknown,
	records: Record<string, ManualLayerRecord>,
): void {
	if (!isObject(value)) return;
	for (const [rawKey, rawTarget] of Object.entries(value)) {
		const key = legacySourceKey(rawKey);
		if (!key || !isObject(rawTarget)) continue;
		const normalized = normalizeSeerrTarget(rawTarget as SeerrTarget);
		if (!normalized) continue;
		const record = (records[key] ??= emptyRecord());
		if (normalized.mediaType === "movie") {
			record.facts.tmdbMovie ??= normalized.tmdbId;
		} else {
			record.facts.tmdbShow = normalized.tmdbId;
			setSeerrTvEvidence(record, normalized);
		}
	}
}

function decodeV1Manual(
	local: Record<string, unknown>,
	sync: Record<string, unknown>,
	records: Record<string, ManualLayerRecord>,
): void {
	const overrides = newestV1Entries<V1Override>([
		local[V1_LOCAL_OVERRIDE_KEY],
		sync[V1_SYNC_OVERRIDE_KEY],
	]);
	const ignores = newestV1Entries<V1Ignore>([
		local[V1_LOCAL_IGNORE_KEY],
		sync[V1_SYNC_IGNORE_KEY],
	]);
	for (const rawId of new Set([...overrides.keys(), ...ignores.keys()])) {
		const anilistId = parseAniListIdOrNull(Number(rawId));
		if (anilistId === null || String(anilistId) !== rawId) continue;
		const key = sourceIdentityKey({ source: "anilist", id: anilistId });
		const record = (records[key] ??= emptyRecord());
		const decision = record.decisions?.sonarr;
		if (decision?.ignored || record.facts.tvdbShow !== undefined) continue;
		if (ignores.has(rawId)) {
			setDecision(record, "sonarr", {
				ignored: true,
				...decisionWithRejected("sonarr", rejectedIds(decision, "sonarr")),
			});
			continue;
		}
		const tvdbId = parseTvdbIdOrNull(overrides.get(rawId)?.tvdbId);
		if (tvdbId !== null) record.facts.tvdbShow = tvdbId;
	}
}

function newestV1Entries<T extends { updatedAt: unknown }>(
	values: readonly unknown[],
): Map<string, T> {
	const entries = new Map<string, T>();
	for (const value of values) {
		if (!isObject(value)) continue;
		for (const [key, entry] of Object.entries(value)) {
			if (!isObject(entry)) continue;
			const candidate = entry as T;
			const updatedAt = validTimestamp(candidate.updatedAt);
			if (updatedAt === null) continue;
			const previous = entries.get(key);
			if (
				!previous ||
				updatedAt > (validTimestamp(previous.updatedAt) ?? Number.NEGATIVE_INFINITY)
			) {
				entries.set(key, candidate);
			}
		}
	}
	return entries;
}

function mergeManualRecords(
	canonical: ManualLayerRecord | undefined,
	alias: ManualLayerRecord,
): ManualLayerRecord {
	if (!canonical) return structuredClone(alias);
	const merged = structuredClone(canonical);
	for (const slot of ["tmdbMovie", "tmdbShow", "tvdbShow"] as const) {
		if (
			merged.facts[slot] === undefined &&
			merged.conflicts?.[slot] === undefined
		) {
			copySlot(merged, alias, slot);
		} else if (
			slot !== "tmdbMovie" &&
			merged.scopes?.[slot] === undefined &&
			merged.facts[slot] === alias.facts[slot] &&
			alias.scopes?.[slot] !== undefined
		) {
			merged.scopes ??= {};
			Object.assign(merged.scopes, {
				[slot]: structuredClone(alias.scopes[slot]),
			});
		}
	}
	if (
		!merged.tvShowPairs &&
		alias.tvShowPairs &&
		merged.facts.tmdbShow === alias.facts.tmdbShow
	) {
		merged.tvShowPairs = structuredClone(alias.tvShowPairs);
	}
	for (const provider of ["sonarr", "radarr"] as const) {
		if (merged.decisions?.[provider] === undefined) {
			setDecision(merged, provider, structuredClone(alias.decisions?.[provider]));
		}
	}
	return merged;
}

function copySlot(
	target: ManualLayerRecord,
	source: ManualLayerRecord,
	slot: "tmdbMovie" | "tmdbShow" | "tvdbShow",
): void {
	const fact = source.facts[slot];
	if (fact !== undefined) Object.assign(target.facts, { [slot]: fact });
	const conflict = source.conflicts?.[slot];
	if (conflict !== undefined) {
		target.conflicts ??= {};
		Object.assign(target.conflicts, { [slot]: structuredClone(conflict) });
	}
	if (slot !== "tmdbMovie") {
		const scope = source.scopes?.[slot];
		if (scope) {
			target.scopes ??= {};
			Object.assign(target.scopes, { [slot]: structuredClone(scope) });
		}
	}
}

function setSeerrTvEvidence(
	record: ManualLayerRecord,
	target: Extract<SeerrTarget, { mediaType: "tv" }>,
): void {
	const seasons = normalizeSeasonNumbers(target.seasons ?? []);
	if (seasons.length > 0) {
		record.scopes ??= {};
		record.scopes.tmdbShow = { id: target.tmdbId, seasons };
	} else {
		delete record.scopes?.tmdbShow;
	}
	if (target.tvdbId === undefined) {
		delete record.tvShowPairs;
		return;
	}
	record.tvShowPairs = [
		{
			tmdbShow: target.tmdbId,
			tvdbShow: target.tvdbId,
			...(seasons.length > 0 ? { tmdbSeasons: seasons, tvdbSeasons: seasons } : {}),
		},
	];
}

function setScope(
	record: ManualLayerRecord,
	slot: "tmdbShow" | "tvdbShow",
	id: TmdbId | TvdbId,
	season: number | undefined,
): void {
	if (season === undefined) {
		delete record.scopes?.[slot];
		return;
	}
	record.scopes ??= {};
	Object.assign(record.scopes, { [slot]: { id, seasons: [season] } });
}

function setDecision(
	record: ManualLayerRecord,
	provider: Provider,
	decision: ManualProviderDecision | undefined,
): void {
	if (
		decision &&
		(decision.ignored ||
			decision.rejectedTvdbShow?.length ||
			decision.rejectedTmdbMovie?.length)
	) {
		record.decisions ??= {};
		record.decisions[provider] = decision;
		return;
	}
	delete record.decisions?.[provider];
	if (record.decisions && Object.keys(record.decisions).length === 0) {
		delete record.decisions;
	}
}

function rejectedIds(
	decision: ManualProviderDecision | undefined,
	provider: Provider,
): number[] {
	return provider === "sonarr"
		? (decision?.rejectedTvdbShow ?? [])
		: (decision?.rejectedTmdbMovie ?? []);
}

function decisionWithRejected(
	provider: Provider,
	ids: readonly number[],
): ManualProviderDecision {
	if (ids.length === 0) return {};
	return provider === "sonarr"
		? { rejectedTvdbShow: ids as TvdbId[] }
		: { rejectedTmdbMovie: ids as TmdbId[] };
}

function getMutableRecord(
	store: LayerStore<ManualLayerRecord>,
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): ManualLayerRecord {
	const key = recordKey(identity, anilistId);
	consolidateIdentityAlias(store, identity, anilistId);
	return (store.records[key] ??= emptyRecord());
}

function getExistingMutableRecord(
	store: LayerStore<ManualLayerRecord>,
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): ManualLayerRecord | undefined {
	consolidateIdentityAlias(store, identity, anilistId);
	return store.records[recordKey(identity, anilistId)];
}

function consolidateIdentityAlias(
	store: LayerStore<ManualLayerRecord>,
	identity: SourceIdentity | AniListId,
	anilistId: AniListId | undefined,
): void {
	if (anilistId === undefined) return;
	const sourceKey = sourceIdentityKey(normalizeSourceIdentity(identity));
	const canonicalKey = recordKey(identity, anilistId);
	if (sourceKey === canonicalKey) return;
	const alias = store.records[sourceKey];
	if (!alias) return;
	store.records[canonicalKey] = mergeManualRecords(
		store.records[canonicalKey],
		alias,
	);
	delete store.records[sourceKey];
}

function removeEmptyRecord(
	store: LayerStore<ManualLayerRecord>,
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): void {
	const key = recordKey(identity, anilistId);
	const record = store.records[key];
	if (record && isEmptyRecord(record)) delete store.records[key];
}

function recordKey(
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): string {
	return sourceIdentityKey(
		storageIdentity(normalizeSourceIdentity(identity), anilistId),
	);
}

function emptyRecord(): ManualLayerRecord {
	return { facts: {} };
}

function isEmptyRecord(record: ManualLayerRecord): boolean {
	return (
		Object.keys(record.facts).length === 0 &&
		!Object.values(record.conflicts ?? {}).some(Boolean) &&
		!Object.values(record.scopes ?? {}).some(Boolean) &&
		!(record.tvShowPairs?.length) &&
		!Object.values(record.decisions ?? {}).some(Boolean)
	);
}

function isLayerStore(value: unknown): value is LayerStore<ManualLayerRecord> {
	return isObject(value) && value.version === 1 && isObject(value.records);
}

function cloneLayerStore(
	store: LayerStore<ManualLayerRecord>,
): LayerStore<ManualLayerRecord> {
	const records: Record<string, ManualLayerRecord> = {};
	for (const [key, record] of Object.entries(store.records)) {
		if (parseSourceIdentityKey(key) === null || !isObject(record)) continue;
		records[key] = normalizeManualRecord(record as ManualLayerRecord);
	}
	return { version: 1, records };
}

function normalizeManualRecord(record: ManualLayerRecord): ManualLayerRecord {
	const layer = normalizeExternalIdLayer({
		facts: isObject(record.facts) ? record.facts : {},
		...(isObject(record.conflicts) ? { conflicts: record.conflicts } : {}),
		...(isObject(record.scopes) ? { scopes: record.scopes } : {}),
		...(Array.isArray(record.tvShowPairs)
			? { tvShowPairs: record.tvShowPairs as TvShowPairEvidence[] }
			: {}),
	});
	return {
		...layer,
		...(isObject(record.decisions)
			? { decisions: structuredClone(record.decisions) }
			: {}),
	};
}

function legacySourceKey(rawKey: string): string | null {
	const source = parseSourceIdentityKey(rawKey);
	if (source) return sourceIdentityKey(source);
	const anilistId = parseAniListIdOrNull(Number(rawKey));
	return anilistId !== null && rawKey === String(anilistId)
		? sourceIdentityKey({ source: "anilist", id: anilistId })
		: null;
}

function validSeason(value: unknown): number | undefined {
	return Number.isSafeInteger(value) && (value as number) >= 0
		? (value as number)
		: undefined;
}

function validTimestamp(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function removeLegacyManualKeys(): Promise<void> {
	await Promise.all([
		browser.storage.local.remove([
			LEGACY_SEERR_KEY,
			V1_LOCAL_OVERRIDE_KEY,
			V1_LOCAL_IGNORE_KEY,
		]),
		browser.storage.sync.remove([V1_SYNC_OVERRIDE_KEY, V1_SYNC_IGNORE_KEY]),
	]);
}
