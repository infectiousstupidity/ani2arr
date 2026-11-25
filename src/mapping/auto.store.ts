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
import { logError, normalizeError } from "@/shared/errors/error-utils";
import { createStorageReadCache } from "@/shared/storage-read-cache";
import {
	isAutomaticMappingRecord,
	type AutomaticAttemptLane,
	type AutomaticMappingRecord,
	type AutomaticSlotMeta,
	type MappingFacts,
	type MappingStore,
} from "./mapping-record";
import { selectSeerrMapping } from "./effective-mapping";
import { normalizeSeasonNumbers } from "./season-numbers";
import {
	normalizeSeerrTarget,
	type AutoResult,
	type SeerrTarget,
} from "./types";

const MAPPED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ATTEMPT_TTL_MS = 48 * 60 * 60 * 1000;
const AUTO_KEY = "mapping:auto";
const LEGACY_SEERR_AUTO_KEY = "mapping:seerr-auto";

export type AutomaticRecord = {
	anilistId: AniListId;
	record: AutomaticMappingRecord;
};

export type AutomaticWriteToken = number;

export type SeerrAutoResult =
	| { kind: "mapped"; target: SeerrTarget; matchedTitle?: string }
	| { kind: "unmapped" };

const autoMappings = storage.defineItem<MappingStore<AutomaticMappingRecord>>(
	"local:mapping:auto",
	{ fallback: { version: 1, records: {} } },
);

type AutomaticStoreState = {
	/** Valid records only. Read-only: writers copy it from `json`. */
	store: MappingStore<AutomaticMappingRecord>;
	/** `JSON.stringify(store)`, kept so each write serializes the store once. */
	json: string;
	/** Storage still holds malformed records that the next write drops. */
	hasMalformedRecords: boolean;
};

const automaticStateCache = createStorageReadCache<AutomaticStoreState>({
	keys: { local: [AUTO_KEY] },
	load: async () => {
		const { [AUTO_KEY]: stored } = await browser.storage.local.get(AUTO_KEY);
		const store: MappingStore<AutomaticMappingRecord> = isMappingStore(stored)
			? stored
			: { version: 1, records: {} };
		const hasMalformedRecords = discardMalformedRecords(store);
		return { store, json: JSON.stringify(store), hasMalformedRecords };
	},
	onListenerLost: () => {
		dirtyState = null;
		cancelScheduledFlush();
	},
});

// Every storage.local write sends the whole old and new store to every tab with a
// storage.onChanged listener. Resolver bursts therefore keep the latest state here
// and persist it at most once per AUTOMATIC_FLUSH_DELAY_MS.
const AUTOMATIC_FLUSH_DELAY_MS = 1000;
let dirtyState: AutomaticStoreState | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

let writes: Promise<void> = Promise.resolve();
let automaticWriteToken = 0;

export function captureAutomaticWriteToken(): AutomaticWriteToken {
	return automaticWriteToken;
}

export async function getAutomaticLayerRecord(
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): Promise<AutomaticMappingRecord | null> {
	const source = normalizeSourceIdentity(identity);
	const { store } = await readAutomaticStore();
	const canonicalValue =
		store.records[sourceIdentityKey(storageIdentity(source, anilistId))];
	const aliasValue = store.records[sourceIdentityKey(source)];
	const canonical = isAutomaticMappingRecord(canonicalValue)
		? canonicalValue
		: undefined;
	const alias = isAutomaticMappingRecord(aliasValue) ? aliasValue : undefined;
	const record =
		canonical && alias && canonical !== alias
			? mergeAutomaticRecords(canonical, [alias])
			: (canonical ?? alias);
	if (!record) return null;
	const active = activeRecord(record, Date.now());
	return isEmptyRecord(active) ? null : active;
}

export async function listAniListAutomaticLayers(): Promise<AutomaticRecord[]> {
	const { store } = await readAutomaticStore();
	const now = Date.now();
	return Object.entries(store.records).flatMap(([rawKey, record]) => {
		const identity = parseSourceIdentityKey(rawKey);
		if (identity?.source !== "anilist" || !isAutomaticMappingRecord(record))
			return [];
		const active = activeRecord(record, now);
		return isEmptyRecord(active)
			? []
			: [{ anilistId: identity.id, record: active }];
	});
}

export async function readAutomaticRecords(): Promise<
	(key: string) => AutomaticMappingRecord | undefined
> {
	const { store } = await readAutomaticStore();
	const now = Date.now();
	return (key) => {
		const record = Object.hasOwn(store.records, key)
			? store.records[key]
			: undefined;
		if (!isAutomaticMappingRecord(record)) return;
		const active = activeRecord(record, now);
		return isEmptyRecord(active) ? undefined : active;
	};
}

function hasAutomaticAttempt(
	record: AutomaticMappingRecord | null,
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
		delete record.attempts?.[lane];
		if (result.kind === "unmapped") {
			setAttempt(record, lane, Date.now() + ATTEMPT_TTL_MS);
			return;
		}
		clearSlot(record, slot);
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
	const projection = selectSeerrMapping(mediaType, {
		manual: null,
		direct: null,
		canonical: null,
		automatic: record,
	});
	if (projection.kind === "mapped") {
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
		delete record.attempts?.[lane];
		if (result.kind === "unmapped") {
			setAttempt(record, lane, Date.now() + ATTEMPT_TTL_MS);
			return;
		}
		clearSlot(record, slot);
		const target = normalizeSeerrTarget(result.target);
		if (!target || target.mediaType !== mediaType) {
			throw new Error("Invalid automatic Seerr target.");
		}
		if (target.mediaType === "movie") {
			record.facts.tmdbMovie = target.tmdbId;
		} else {
			record.facts.tmdbShow = target.tmdbId;
			setTmdbShowScope(record, target);
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
	await enqueueAutomaticStoreUpdate(async () => {
		const stored = await browser.storage.local.get([
			AUTO_KEY,
			LEGACY_SEERR_AUTO_KEY,
		]);
		const keys: string[] = [];
		if (stored[AUTO_KEY] != null && !isMappingStore(stored[AUTO_KEY]))
			keys.push(AUTO_KEY);
		if (stored[LEGACY_SEERR_AUTO_KEY] !== undefined)
			keys.push(LEGACY_SEERR_AUTO_KEY);
		if (keys.length === 0) return;
		await browser.storage.local.remove(keys);
		automaticStateCache.clear();
	});
}

/** True when some record is keyed by a non-AniList source and may need consolidation. */
export async function hasAutomaticAliasRecords(): Promise<boolean> {
	const { store } = await readAutomaticStore();
	return Object.keys(store.records).some((key) => !key.startsWith("anilist:"));
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

export async function clearAutoResults(): Promise<void> {
	automaticWriteToken += 1;
	await migrateAutomaticStore();
	await updateAutomaticStore((store) => {
		store.records = {};
	});
	await flushAutomaticStore();
}

async function updateAutomaticStore(
	update: (store: MappingStore<AutomaticMappingRecord>) => void,
): Promise<void> {
	await enqueueAutomaticStoreUpdate(async () => {
		await applyAutomaticStoreUpdate(await readAutomaticStore(), update);
	});
}

/** Persists pending automatic results now. Clears and resets use this path. */
export async function flushAutomaticStore(): Promise<void> {
	await enqueueAutomaticStoreUpdate(persistDirtyState);
}

async function updateAutomaticStoreGuarded(
	token: AutomaticWriteToken,
	update: (store: MappingStore<AutomaticMappingRecord>) => void,
): Promise<boolean> {
	return enqueueAutomaticStoreUpdate(async () => {
		const state = await readAutomaticStore();
		if (token !== automaticWriteToken) return false;
		await applyAutomaticStoreUpdate(state, update);
		return true;
	});
}

// Serializes the store once per write instead of cloning and stringifying it repeatedly.
async function applyAutomaticStoreUpdate(
	state: AutomaticStoreState,
	update: (store: MappingStore<AutomaticMappingRecord>) => void,
): Promise<void> {
	const store = JSON.parse(state.json) as MappingStore<AutomaticMappingRecord>;
	update(store);
	let after = JSON.stringify(store);
	if (after === state.json && !state.hasMalformedRecords) return;
	let removedEmpty = false;
	for (const [key, record] of Object.entries(store.records)) {
		if (!isEmptyRecord(record)) continue;
		delete store.records[key];
		removedEmpty = true;
	}
	if (removedEmpty) after = JSON.stringify(store);
	if (after === state.json && !state.hasMalformedRecords) return;
	// Parse the JSON so in-memory state matches a fresh read (storage drops undefined).
	dirtyState = {
		store: JSON.parse(after) as MappingStore<AutomaticMappingRecord>,
		json: after,
		hasMalformedRecords: false,
	};
	scheduleFlush();
}

function scheduleFlush(): void {
	if (flushTimer !== null) return;
	flushTimer = setTimeout(() => {
		flushTimer = null;
		flushAutomaticStore().catch((error) => {
			logError(normalizeError(error), "AutomaticStore:flush");
		});
	}, AUTOMATIC_FLUSH_DELAY_MS);
}

function cancelScheduledFlush(): void {
	if (flushTimer === null) return;
	clearTimeout(flushTimer);
	flushTimer = null;
}

// Runs inside the write queue, so no update can interleave.
async function persistDirtyState(): Promise<void> {
	const state = dirtyState;
	if (!state) return;
	cancelScheduledFlush();
	await autoMappings.setValue(state.store);
	dirtyState = null;
	automaticStateCache.prime(state);
}

function discardMalformedRecords(
	store: MappingStore<AutomaticMappingRecord>,
): boolean {
	let discarded = false;
	for (const [key, record] of Object.entries(store.records)) {
		if (isAutomaticMappingRecord(record)) continue;
		delete store.records[key];
		discarded = true;
	}
	return discarded;
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

async function readAutomaticStore(): Promise<AutomaticStoreState> {
	// Read first: it detects a reset browser and drops stale pending state.
	const stored = await automaticStateCache.read();
	return dirtyState ?? stored;
}

function activeRecord(
	record: AutomaticMappingRecord,
	now: number,
): AutomaticMappingRecord {
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
	canonical: AutomaticMappingRecord | undefined,
	aliases: readonly AutomaticMappingRecord[],
): AutomaticMappingRecord {
	const now = Date.now();
	const activeCanonical = canonical ? activeRecord(canonical, now) : undefined;
	const activeAliases = aliases.map((record) => activeRecord(record, now));
	const merged = activeCanonical ?? emptyRecord();
	for (const slot of ["tmdbMovie", "tmdbShow", "tvdbShow"] as const) {
		const candidates = [
			...(activeCanonical && hasSlot(activeCanonical, slot)
				? [activeCanonical]
				: []),
			...activeAliases.filter((record) => hasSlot(record, slot)),
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
			...activeAliases.map((record) => record.attempts?.[lane]?.expiresAt ?? 0),
		);
		if (expiresAt > 0) setAttempt(merged, lane, expiresAt);
	}
	return merged;
}

function hasSlot(
	record: AutomaticMappingRecord,
	slot: keyof MappingFacts,
): boolean {
	return record.facts[slot] !== undefined;
}

function slotSignature(
	record: AutomaticMappingRecord,
	slot: keyof MappingFacts,
): string {
	return JSON.stringify({
		fact: record.facts[slot],
		scope: slot === "tmdbMovie" ? undefined : record.scopes?.[slot],
	});
}

function copySlot(
	target: AutomaticMappingRecord,
	source: AutomaticMappingRecord,
	slot: keyof MappingFacts,
): void {
	Object.assign(target.facts, { [slot]: source.facts[slot] });
	if (slot !== "tmdbMovie" && source.scopes?.[slot]) {
		target.scopes ??= {};
		Object.assign(target.scopes, {
			[slot]: structuredClone(source.scopes[slot]),
		});
	}
	if (source.slotMeta?.[slot]) setSlotMeta(target, slot, source.slotMeta[slot]);
}

function clearSlot(
	record: AutomaticMappingRecord,
	slot: keyof MappingFacts,
): void {
	delete record.facts[slot];
	delete record.conflicts?.[slot];
	delete record.slotMeta?.[slot];
	if (slot !== "tmdbMovie") delete record.scopes?.[slot];
	cleanupContainers(record);
}

function setTmdbShowScope(
	record: AutomaticMappingRecord,
	target: Extract<SeerrTarget, { mediaType: "tv" }>,
): void {
	const seasons = normalizeSeasonNumbers(target.seasons ?? []);
	if (seasons.length > 0) {
		record.scopes ??= {};
		record.scopes.tmdbShow = { id: target.tmdbId, seasons };
	}
}

function setShowScope(
	record: AutomaticMappingRecord,
	slot: "tmdbShow" | "tvdbShow",
	id: TmdbId | TvdbId,
	season: number | undefined,
): void {
	if (season === undefined) return;
	record.scopes ??= {};
	Object.assign(record.scopes, { [slot]: { id, seasons: [season] } });
}

function setSlotMeta(
	record: AutomaticMappingRecord,
	slot: keyof MappingFacts,
	meta: AutomaticSlotMeta,
): void {
	record.slotMeta ??= {};
	record.slotMeta[slot] = structuredClone(meta);
}

function setAttempt(
	record: AutomaticMappingRecord,
	lane: AutomaticAttemptLane,
	expiresAt: number,
): void {
	record.attempts ??= {};
	record.attempts[lane] = { expiresAt };
}

function getMutableRecord(
	store: MappingStore<AutomaticMappingRecord>,
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): AutomaticMappingRecord {
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

function emptyRecord(): AutomaticMappingRecord {
	return { facts: {} };
}

function cleanupContainers(record: AutomaticMappingRecord): void {
	for (const key of ["conflicts", "scopes", "slotMeta", "attempts"] as const) {
		if (record[key] && Object.keys(record[key]).length === 0)
			delete record[key];
	}
}

function isEmptyRecord(record: AutomaticMappingRecord): boolean {
	cleanupContainers(record);
	return (
		Object.keys(record.facts).length === 0 &&
		!record.conflicts &&
		!record.scopes &&
		!record.slotMeta &&
		!record.attempts
	);
}

function isMappingStore(
	value: unknown,
): value is MappingStore<AutomaticMappingRecord> {
	return isObject(value) && value.version === 1 && isObject(value.records);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
