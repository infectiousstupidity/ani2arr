/** Persists shared automatic external-ID facts and resolver attempt state. */

import { browser } from "wxt/browser";
import { storage } from "wxt/utils/storage";
import { type AniListId } from "@/anilist/types";
import {
	normalizeSourceIdentity,
	parseSourceIdentityKey,
	sourceIdentityKey,
	storageIdentity,
	type SourceIdentity,
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
	type AutomaticAttemptLane,
	type AutomaticLayerRecord,
	type AutomaticSlotMeta,
	type ExternalIdFacts,
	type LayerStore,
} from "./external-id-facts";
import { normalizeSeasonNumbers } from "./season-numbers";
import {
	normalizeSeerrTarget,
	projectSeerrTarget,
	type SeerrTarget,
} from "./seerr-target";
import type { ArrUpstreamTarget, AutoResult } from "./types";

const MAPPED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ATTEMPT_TTL_MS = 48 * 60 * 60 * 1000;
const AUTO_KEY = "mapping:auto";
const LEGACY_SEERR_AUTO_KEY = "mapping:seerr-auto";

export type AutomaticRecord = {
	anilistId: AniListId;
	record: AutomaticLayerRecord;
};

export type AutomaticWriteToken = number;

export type SeerrAutoResult =
	| { kind: "mapped"; target: SeerrTarget; matchedTitle?: string }
	| { kind: "unmapped" };

const autoMappings = storage.defineItem<LayerStore<AutomaticLayerRecord>>(
	"local:mapping:auto",
	{ fallback: { version: 1, records: {} } },
);

let writes: Promise<void> = Promise.resolve();
let automaticWriteToken = 0;

export function captureAutomaticWriteToken(): AutomaticWriteToken {
	return automaticWriteToken;
}

export async function getAutomaticLayerRecord(
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): Promise<AutomaticLayerRecord | null> {
	const source = normalizeSourceIdentity(identity);
	const store = await readAutomaticStore();
	const canonical =
		store.records[sourceIdentityKey(storageIdentity(source, anilistId))];
	const alias = store.records[sourceIdentityKey(source)];
	const record =
		canonical && alias && canonical !== alias
			? mergeAutomaticRecords(canonical, [alias])
			: (canonical ?? alias);
	if (!record) return null;
	const active = activeRecord(record, Date.now());
	return isEmptyRecord(active) ? null : active;
}

export async function listAniListAutomaticLayers(): Promise<AutomaticRecord[]> {
	const store = await readAutomaticStore();
	const now = Date.now();
	return Object.entries(store.records).flatMap(([rawKey, record]) => {
		const identity = parseSourceIdentityKey(rawKey);
		if (identity?.source !== "anilist") return [];
		const active = activeRecord(record, now);
		return isEmptyRecord(active)
			? []
			: [{ anilistId: identity.id, record: active }];
	});
}

export function hasAutomaticAttempt(
	record: AutomaticLayerRecord | null,
	lane: AutomaticAttemptLane,
): boolean {
	return (record?.attempts?.[lane]?.expiresAt ?? 0) > Date.now();
}

export async function setAutoResult(
	token: AutomaticWriteToken,
	...args: [
		provider: Provider,
		identity: SourceIdentity | AniListId,
		result: AutoResult,
		anilistId?: AniListId,
	]
): Promise<boolean> {
	return updateAutomaticStoreGuarded(token, (store) => {
		const [provider, identity, result, anilistId] = args;
		const record = getMutableRecord(store, identity, anilistId);
		const slot = provider === "sonarr" ? "tvdbShow" : "tmdbMovie";
		const lane = provider === "sonarr" ? "sonarrTvdb" : "radarrTmdbMovie";
		clearSlot(record, slot);
		delete record.attempts?.[lane];
		if (result.kind === "unmapped") {
			setAttempt(record, lane, Date.now() + ATTEMPT_TTL_MS);
			return;
		}
		if (result.kind === "ambiguous") {
			setArrConflict(record, provider, result.targets);
			setSlotMeta(record, slot, {
				expiresAt: Date.now() + ATTEMPT_TTL_MS,
			});
			return;
		}
		if (provider === "sonarr") {
			const id = parseTvdbIdOrNull(result.providerId);
			if (id === null) throw new Error("Invalid automatic Sonarr target.");
			record.facts.tvdbShow = id;
			setShowScope(record, "tvdbShow", id, result.season);
		} else {
			const id = parseTmdbIdOrNull(result.providerId);
			if (id === null) throw new Error("Invalid automatic Radarr target.");
			record.facts.tmdbMovie = id;
		}
		setSlotMeta(record, slot, {
			expiresAt: Date.now() + MAPPED_TTL_MS,
			...(result.matchedTitle
				? { matchedTitle: result.matchedTitle.trim() }
				: {}),
		});
	});
}

export async function getSeerrAutoResult(
	identity: SourceIdentity,
	mediaType: "movie" | "tv",
	anilistId?: AniListId,
): Promise<SeerrAutoResult | null> {
	const record = await getAutomaticLayerRecord(identity, anilistId);
	if (!record) return null;
	const projection = projectSeerrTarget({ automatic: record }, mediaType);
	if (projection.kind === "target") {
		const slot = mediaType === "movie" ? "tmdbMovie" : "tmdbShow";
		return {
			kind: "mapped",
			target: projection.target,
			...(record.slotMeta?.[slot]?.matchedTitle
				? { matchedTitle: record.slotMeta[slot].matchedTitle }
				: {}),
		};
	}
	return hasAutomaticAttempt(
		record,
		mediaType === "movie" ? "seerrTmdbMovie" : "seerrTmdbShow",
	)
		? { kind: "unmapped" }
		: null;
}

export async function setSeerrAutoResult(
	token: AutomaticWriteToken,
	...args: [
		identity: SourceIdentity,
		mediaType: "movie" | "tv",
		result: SeerrAutoResult,
		anilistId?: AniListId,
	]
): Promise<boolean> {
	return updateAutomaticStoreGuarded(token, (store) => {
		const [identity, mediaType, result, anilistId] = args;
		const record = getMutableRecord(store, identity, anilistId);
		const slot = mediaType === "movie" ? "tmdbMovie" : "tmdbShow";
		const lane = mediaType === "movie" ? "seerrTmdbMovie" : "seerrTmdbShow";
		clearSlot(record, slot);
		delete record.attempts?.[lane];
		if (result.kind === "unmapped") {
			setAttempt(record, lane, Date.now() + ATTEMPT_TTL_MS);
			return;
		}
		const target = normalizeSeerrTarget(result.target);
		if (!target || target.mediaType !== mediaType) {
			throw new Error("Invalid automatic Seerr target.");
		}
		if (target.mediaType === "movie") {
			record.facts.tmdbMovie = target.tmdbId;
		} else {
			record.facts.tmdbShow = target.tmdbId;
			setSeerrTvEvidence(record, target);
		}
		setSlotMeta(record, slot, {
			expiresAt: Date.now() + MAPPED_TTL_MS,
			...(result.matchedTitle
				? { matchedTitle: result.matchedTitle.trim() }
				: {}),
		});
	});
}

export async function migrateAutomaticStore(): Promise<void> {
	await updateAutomaticStore(() => {});
}

export async function consolidateAutomaticAliases(
	aliasesByAniListId: ReadonlyMap<AniListId, SourceIdentity[]>,
): Promise<void> {
	await updateAutomaticStore((store) => {
		for (const [anilistId, aliases] of aliasesByAniListId) {
			const canonicalKey = sourceIdentityKey({
				source: "anilist",
				id: anilistId,
			});
			const aliasRecords = aliases
				.toSorted((left, right) =>
					sourceIdentityKey(left).localeCompare(sourceIdentityKey(right)),
				)
				.flatMap((alias) => {
					const key = sourceIdentityKey(alias);
					const record = store.records[key];
					return record ? [{ key, record }] : [];
				});
			if (aliasRecords.length === 0) continue;
			const merged = mergeAutomaticRecords(
				store.records[canonicalKey],
				aliasRecords.map(({ record }) => record),
			);
			if (isEmptyRecord(merged)) delete store.records[canonicalKey];
			else store.records[canonicalKey] = merged;
			for (const { key } of aliasRecords) delete store.records[key];
		}
	});
}

export async function clearAutoResults(provider?: Provider): Promise<void> {
	if (provider === undefined) automaticWriteToken += 1;

	await updateAutomaticStore((store) => {
		if (provider === undefined) {
			store.records = {};
			return;
		}
		for (const record of Object.values(store.records)) {
			const slot = provider === "sonarr" ? "tvdbShow" : "tmdbMovie";
			clearSlot(record, slot);
			delete record.attempts?.[
				provider === "sonarr" ? "sonarrTvdb" : "radarrTmdbMovie"
			];
		}
	});
}

async function updateAutomaticStore(
	update: (store: LayerStore<AutomaticLayerRecord>) => void,
): Promise<void> {
	await enqueueAutomaticStoreUpdate(async () => {
		const store = await readAutomaticStore();
		update(store);
		await persistAutomaticStore(store);
	});
}

async function updateAutomaticStoreGuarded(
	token: AutomaticWriteToken,
	update: (store: LayerStore<AutomaticLayerRecord>) => void,
): Promise<boolean> {
	return enqueueAutomaticStoreUpdate(async () => {
		const store = await readAutomaticStore();
		if (token !== automaticWriteToken) return false;
		update(store);
		await persistAutomaticStore(store);
		return true;
	});
}

async function enqueueAutomaticStoreUpdate<Result>(
	update: () => Promise<Result>,
): Promise<Result> {
	const next = writes.catch(() => {}).then(update);
	writes = next.then(
		() => {},
		() => {},
	);
	return next;
}

async function persistAutomaticStore(
	store: LayerStore<AutomaticLayerRecord>,
): Promise<void> {
	for (const [key, record] of Object.entries(store.records)) {
		if (isEmptyRecord(record)) delete store.records[key];
	}
	await autoMappings.setValue(store);
	await browser.storage.local.remove(LEGACY_SEERR_AUTO_KEY);
}

async function readAutomaticStore(): Promise<LayerStore<AutomaticLayerRecord>> {
	const stored = await browser.storage.local.get([
		AUTO_KEY,
		LEGACY_SEERR_AUTO_KEY,
	]);
	return decodeAutomaticStore(stored[AUTO_KEY], stored[LEGACY_SEERR_AUTO_KEY]);
}

/** LEGACY: direct-upgrade decoder for released Arr and pre-cutover Seerr caches. */
function decodeAutomaticStore(
	current: unknown,
	legacySeerr: unknown,
): LayerStore<AutomaticLayerRecord> {
	if (isLayerStore(current)) return cloneStore(current);
	const records: Record<string, AutomaticLayerRecord> = {};
	decodeProviderBuckets(current, records);
	decodeLegacySeerrResults(legacySeerr, records);
	return { version: 1, records };
}

function decodeProviderBuckets(
	value: unknown,
	records: Record<string, AutomaticLayerRecord>,
): void {
	if (!isObject(value)) return;
	for (const provider of ["sonarr", "radarr"] as const) {
		const bucket = value[provider];
		if (!isObject(bucket)) continue;
		for (const [rawKey, rawResult] of Object.entries(bucket)) {
			const key = legacySourceKey(rawKey);
			if (!key || !isObject(rawResult)) continue;
			const expiresAt = validExpiry(rawResult.expiresAt);
			if (expiresAt === null) continue;
			const record = (records[key] ??= emptyRecord());
			decodeLegacyArrResult(provider, rawResult, expiresAt, record);
		}
	}
}

function decodeLegacyArrResult(
	provider: Provider,
	rawResult: Record<string, unknown>,
	expiresAt: number,
	record: AutomaticLayerRecord,
): void {
	const slot = provider === "sonarr" ? "tvdbShow" : "tmdbMovie";
	const lane = provider === "sonarr" ? "sonarrTvdb" : "radarrTmdbMovie";
	if (rawResult.kind === "unmapped") {
		setAttempt(record, lane, expiresAt);
		return;
	}
	if (rawResult.kind === "ambiguous" && Array.isArray(rawResult.targets)) {
		setArrConflict(record, provider, rawResult.targets.filter(isArrTarget));
		setSlotMeta(record, slot, { expiresAt });
		return;
	}
	if (rawResult.kind !== "mapped") return;
	if (provider === "sonarr") {
		const id = parseTvdbIdOrNull(rawResult.providerId);
		if (id === null) return;
		record.facts.tvdbShow = id;
		setShowScope(record, "tvdbShow", id, validSeason(rawResult.season));
	} else {
		const id = parseTmdbIdOrNull(rawResult.providerId);
		if (id === null) return;
		record.facts.tmdbMovie = id;
	}
	setSlotMeta(record, slot, {
		expiresAt,
		...(typeof rawResult.matchedTitle === "string" &&
		rawResult.matchedTitle.trim()
			? { matchedTitle: rawResult.matchedTitle.trim() }
			: {}),
	});
}

function decodeLegacySeerrResults(
	value: unknown,
	records: Record<string, AutomaticLayerRecord>,
): void {
	if (!isObject(value)) return;
	for (const [rawKey, rawResult] of Object.entries(value)) {
		const key = legacySourceKey(rawKey);
		if (!key || !isObject(rawResult)) continue;
		const expiresAt = validExpiry(rawResult.expiresAt);
		if (expiresAt === null) continue;
		const record = (records[key] ??= emptyRecord());
		if (rawResult.kind === "unmapped") {
			// Old Seerr attempts had no media type and blocked both resolver paths.
			setAttempt(record, "seerrTmdbMovie", expiresAt);
			setAttempt(record, "seerrTmdbShow", expiresAt);
			continue;
		}
		if (rawResult.kind !== "mapped" || !isObject(rawResult.target)) continue;
		const target = normalizeSeerrTarget(rawResult.target as SeerrTarget);
		if (!target) continue;
		const matchedTitle =
			typeof rawResult.matchedTitle === "string" &&
			rawResult.matchedTitle.trim()
				? rawResult.matchedTitle.trim()
				: undefined;
		if (target.mediaType === "movie") {
			if (record.facts.tmdbMovie !== undefined) continue;
			record.facts.tmdbMovie = target.tmdbId;
			setSlotMeta(record, "tmdbMovie", {
				expiresAt,
				...(matchedTitle ? { matchedTitle } : {}),
			});
		} else {
			record.facts.tmdbShow = target.tmdbId;
			setSeerrTvEvidence(record, target);
			setSlotMeta(record, "tmdbShow", {
				expiresAt,
				...(matchedTitle ? { matchedTitle } : {}),
			});
		}
	}
}

function activeRecord(
	record: AutomaticLayerRecord,
	now: number,
): AutomaticLayerRecord {
	const active = structuredClone(record);
	for (const slot of ["tmdbMovie", "tmdbShow", "tvdbShow"] as const) {
		if ((active.slotMeta?.[slot]?.expiresAt ?? 0) <= now)
			clearSlot(active, slot);
	}
	for (const lane of [
		"sonarrTvdb",
		"radarrTmdbMovie",
		"seerrTmdbMovie",
		"seerrTmdbShow",
	] as const) {
		if ((active.attempts?.[lane]?.expiresAt ?? 0) <= now) {
			delete active.attempts?.[lane];
		}
	}
	cleanupContainers(active);
	return active;
}

function mergeAutomaticRecords(
	canonical: AutomaticLayerRecord | undefined,
	aliases: readonly AutomaticLayerRecord[],
): AutomaticLayerRecord {
	const merged = canonical ? structuredClone(canonical) : emptyRecord();
	for (const slot of ["tmdbMovie", "tmdbShow", "tvdbShow"] as const) {
		const candidates = [
			...(canonical && hasSlot(canonical, slot) ? [canonical] : []),
			...aliases.filter((record) => hasSlot(record, slot)),
		];
		if (candidates.length === 0) continue;
		const signatures = new Set(
			candidates.map((record) => slotSignature(record, slot)),
		);
		if (signatures.size !== 1) {
			clearSlot(merged, slot);
		} else if (!hasSlot(merged, slot)) {
			copySlot(merged, candidates[0]!, slot);
		}
	}
	for (const lane of [
		"sonarrTvdb",
		"radarrTmdbMovie",
		"seerrTmdbMovie",
		"seerrTmdbShow",
	] as const) {
		const expiresAt = Math.max(
			merged.attempts?.[lane]?.expiresAt ?? 0,
			...aliases.map((record) => record.attempts?.[lane]?.expiresAt ?? 0),
		);
		if (expiresAt > 0) setAttempt(merged, lane, expiresAt);
	}
	return merged;
}

function hasSlot(
	record: AutomaticLayerRecord,
	slot: keyof ExternalIdFacts,
): boolean {
	return (
		record.facts[slot] !== undefined || record.conflicts?.[slot] !== undefined
	);
}

function slotSignature(
	record: AutomaticLayerRecord,
	slot: keyof ExternalIdFacts,
): string {
	return JSON.stringify({
		fact: record.facts[slot],
		conflict: record.conflicts?.[slot],
		scope: slot === "tmdbMovie" ? undefined : record.scopes?.[slot],
		pairs: slot === "tmdbShow" ? record.tvShowPairs : undefined,
	});
}

function copySlot(
	target: AutomaticLayerRecord,
	source: AutomaticLayerRecord,
	slot: keyof ExternalIdFacts,
): void {
	Object.assign(target.facts, { [slot]: source.facts[slot] });
	if (source.conflicts?.[slot] !== undefined) {
		target.conflicts ??= {};
		Object.assign(target.conflicts, {
			[slot]: structuredClone(source.conflicts[slot]),
		});
	}
	if (slot !== "tmdbMovie" && source.scopes?.[slot]) {
		target.scopes ??= {};
		Object.assign(target.scopes, {
			[slot]: structuredClone(source.scopes[slot]),
		});
	}
	if (slot === "tmdbShow" && source.tvShowPairs) {
		target.tvShowPairs = structuredClone(source.tvShowPairs);
	}
	if (source.slotMeta?.[slot]) setSlotMeta(target, slot, source.slotMeta[slot]);
}

function clearSlot(
	record: AutomaticLayerRecord,
	slot: keyof ExternalIdFacts,
): void {
	delete record.facts[slot];
	delete record.conflicts?.[slot];
	delete record.slotMeta?.[slot];
	if (slot !== "tmdbMovie") delete record.scopes?.[slot];
	if (slot === "tmdbShow") delete record.tvShowPairs;
	cleanupContainers(record);
}

function setArrConflict(
	record: AutomaticLayerRecord,
	provider: Provider,
	targets: readonly ArrUpstreamTarget[],
): void {
	record.conflicts ??= {};
	if (provider === "radarr") {
		const ids = targets.flatMap((target) => {
			const id =
				target.provider === "radarr"
					? parseTmdbIdOrNull(target.providerId)
					: null;
			return id === null ? [] : [id];
		});
		if (ids.length > 0)
			record.conflicts.tmdbMovie = [...new Set(ids)].toSorted();
		return;
	}
	const seasonsById = new Map<TvdbId, number[]>();
	for (const target of targets) {
		if (target.provider !== "sonarr") continue;
		const id = parseTvdbIdOrNull(target.providerId);
		if (id === null) continue;
		seasonsById.set(
			id,
			normalizeSeasonNumbers([
				...(seasonsById.get(id) ?? []),
				...(target.season === undefined ? [] : [target.season]),
			]),
		);
	}
	if (seasonsById.size > 0) {
		record.conflicts.tvdbShow = [...seasonsById].map(([id, seasons]) => ({
			id,
			...(seasons.length > 0 ? { seasons } : {}),
		}));
	}
}

function setSeerrTvEvidence(
	record: AutomaticLayerRecord,
	target: Extract<SeerrTarget, { mediaType: "tv" }>,
): void {
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

function setShowScope(
	record: AutomaticLayerRecord,
	slot: "tmdbShow" | "tvdbShow",
	id: TmdbId | TvdbId,
	season: number | undefined,
): void {
	if (season === undefined) return;
	record.scopes ??= {};
	Object.assign(record.scopes, { [slot]: { id, seasons: [season] } });
}

function setSlotMeta(
	record: AutomaticLayerRecord,
	slot: keyof ExternalIdFacts,
	meta: AutomaticSlotMeta,
): void {
	record.slotMeta ??= {};
	record.slotMeta[slot] = structuredClone(meta);
}

function setAttempt(
	record: AutomaticLayerRecord,
	lane: AutomaticAttemptLane,
	expiresAt: number,
): void {
	record.attempts ??= {};
	record.attempts[lane] = { expiresAt };
}

function getMutableRecord(
	store: LayerStore<AutomaticLayerRecord>,
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): AutomaticLayerRecord {
	const source = normalizeSourceIdentity(identity);
	const key = sourceIdentityKey(storageIdentity(source, anilistId));
	if (anilistId !== undefined) {
		const aliasKey = sourceIdentityKey(source);
		const alias = aliasKey === key ? undefined : store.records[aliasKey];
		if (alias) {
			store.records[key] = mergeAutomaticRecords(store.records[key], [alias]);
			delete store.records[aliasKey];
		}
	}
	return (store.records[key] ??= emptyRecord());
}

function emptyRecord(): AutomaticLayerRecord {
	return { facts: {} };
}

function cleanupContainers(record: AutomaticLayerRecord): void {
	for (const key of ["conflicts", "scopes", "slotMeta", "attempts"] as const) {
		if (record[key] && Object.keys(record[key]).length === 0)
			delete record[key];
	}
	if (record.tvShowPairs?.length === 0) delete record.tvShowPairs;
}

function isEmptyRecord(record: AutomaticLayerRecord): boolean {
	cleanupContainers(record);
	return (
		Object.keys(record.facts).length === 0 &&
		!record.conflicts &&
		!record.scopes &&
		!record.tvShowPairs &&
		!record.slotMeta &&
		!record.attempts
	);
}

function isLayerStore(
	value: unknown,
): value is LayerStore<AutomaticLayerRecord> {
	return isObject(value) && value.version === 1 && isObject(value.records);
}

function cloneStore(
	store: LayerStore<AutomaticLayerRecord>,
): LayerStore<AutomaticLayerRecord> {
	const records: Record<string, AutomaticLayerRecord> = {};
	for (const [key, record] of Object.entries(store.records)) {
		if (parseSourceIdentityKey(key) === null || !isObject(record)) continue;
		records[key] = normalizeAutomaticRecord(record as AutomaticLayerRecord);
	}
	return { version: 1, records };
}

function normalizeAutomaticRecord(
	record: AutomaticLayerRecord,
): AutomaticLayerRecord {
	const layer = normalizeExternalIdLayer({
		facts: isObject(record.facts) ? record.facts : {},
		...(isObject(record.conflicts) ? { conflicts: record.conflicts } : {}),
		...(isObject(record.scopes) ? { scopes: record.scopes } : {}),
		...(Array.isArray(record.tvShowPairs)
			? { tvShowPairs: record.tvShowPairs }
			: {}),
	});
	return {
		...layer,
		...(isObject(record.slotMeta)
			? { slotMeta: structuredClone(record.slotMeta) }
			: {}),
		...(isObject(record.attempts)
			? { attempts: structuredClone(record.attempts) }
			: {}),
	};
}

function legacySourceKey(rawKey: string): string | null {
	const identity = parseSourceIdentityKey(rawKey);
	if (identity) return sourceIdentityKey(identity);
	const id = Number(rawKey);
	return Number.isSafeInteger(id) && id > 0 && rawKey === String(id)
		? `anilist:${id}`
		: null;
}

function isArrTarget(value: unknown): value is ArrUpstreamTarget {
	return (
		isObject(value) &&
		(value.provider === "sonarr" || value.provider === "radarr") &&
		Number.isSafeInteger(value.providerId)
	);
}

function validSeason(value: unknown): number | undefined {
	return Number.isSafeInteger(value) && (value as number) >= 0
		? (value as number)
		: undefined;
}

function validExpiry(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
