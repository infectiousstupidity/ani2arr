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
	createMappingRecord,
	type AutomaticAttemptLane,
	type AutomaticMappingRecord,
	type AutomaticSlotMeta,
	type MappingFacts,
	type MappingStore,
} from "./mapping-record";
import { selectSeerrMapping } from "./effective-mapping";
import { normalizeSeasonNumbers } from "./season-numbers";
import {
	normalizeLegacySeerrTarget,
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
		clearSlot(record, slot);
		delete record.attempts?.[lane];
		if (result.kind === "unmapped") {
			setAttempt(record, lane, Date.now() + ATTEMPT_TTL_MS);
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

export async function clearAutoResults(): Promise<void> {
	automaticWriteToken += 1;
	await updateAutomaticStore((store) => {
		store.records = {};
	});
}

async function updateAutomaticStore(
	update: (store: MappingStore<AutomaticMappingRecord>) => void,
): Promise<void> {
	await enqueueAutomaticStoreUpdate(async () => {
		const store = await readAutomaticStore();
		update(store);
		await persistAutomaticStore(store);
	});
}

async function updateAutomaticStoreGuarded(
	token: AutomaticWriteToken,
	update: (store: MappingStore<AutomaticMappingRecord>) => void,
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
	store: MappingStore<AutomaticMappingRecord>,
): Promise<void> {
	for (const [key, record] of Object.entries(store.records)) {
		if (isEmptyRecord(record)) delete store.records[key];
	}
	await autoMappings.setValue(store);
	await browser.storage.local.remove(LEGACY_SEERR_AUTO_KEY);
}

async function readAutomaticStore(): Promise<
	MappingStore<AutomaticMappingRecord>
> {
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
): MappingStore<AutomaticMappingRecord> {
	if (isMappingStore(current)) return cloneStore(current);
	const records: Record<string, AutomaticMappingRecord> = {};
	decodeProviderBuckets(current, records);
	decodeLegacySeerrResults(legacySeerr, records);
	return { version: 1, records };
}

function decodeProviderBuckets(
	value: unknown,
	records: Record<string, AutomaticMappingRecord>,
): void {
	if (!isObject(value)) return;
	for (const provider of ["sonarr", "radarr"] as const) {
		const bucket = value[provider];
		if (!isObject(bucket)) continue;
		for (const [rawKey, rawResult] of Object.entries(bucket)) {
			const key = legacySourceKey(rawKey);
			if (!key || !isObject(rawResult) || rawResult.kind === "ambiguous")
				continue;
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
	record: AutomaticMappingRecord,
): void {
	const slot = provider === "sonarr" ? "tvdbShow" : "tmdbMovie";
	const lane = provider === "sonarr" ? "sonarrTvdb" : "radarrTmdbMovie";
	if (rawResult.kind === "unmapped") {
		setAttempt(record, lane, expiresAt);
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
	records: Record<string, AutomaticMappingRecord>,
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
		const target = normalizeLegacySeerrTarget(rawResult.target as SeerrTarget);
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
			setTmdbShowScope(record, target);
			setSlotMeta(record, "tmdbShow", {
				expiresAt,
				...(matchedTitle ? { matchedTitle } : {}),
			});
		}
	}
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

function cloneStore(
	store: MappingStore<AutomaticMappingRecord>,
): MappingStore<AutomaticMappingRecord> {
	const records: Record<string, AutomaticMappingRecord> = {};
	for (const [key, record] of Object.entries(store.records)) {
		if (parseSourceIdentityKey(key) === null || !isObject(record)) continue;
		records[key] = normalizeAutomaticRecord(record as AutomaticMappingRecord);
	}
	return { version: 1, records };
}

function normalizeAutomaticRecord(
	record: AutomaticMappingRecord,
): AutomaticMappingRecord {
	const facts = isObject(record.facts) ? record.facts : {};
	const conflicts = isObject(record.conflicts) ? record.conflicts : {};
	const scopes = isObject(record.scopes) ? record.scopes : {};
	const hasTmdbMovieConflict = Object.hasOwn(conflicts, "tmdbMovie");
	const hasTvdbShowConflict = Object.hasOwn(conflicts, "tvdbShow");
	const tmdbMovie = hasTmdbMovieConflict
		? []
		: [facts.tmdbMovie].flatMap((value) => {
				const id = parseTmdbIdOrNull(value);
				return id === null ? [] : [id];
			});
	const layer = createMappingRecord({
		tmdbMovie,
		tmdbShow: decodeShowCandidates(
			facts.tmdbShow,
			conflicts.tmdbShow,
			scopes.tmdbShow,
			parseTmdbIdOrNull,
		),
		tvdbShow: hasTvdbShowConflict
			? []
			: decodeShowCandidates(
					facts.tvdbShow,
					undefined,
					scopes.tvdbShow,
					parseTvdbIdOrNull,
				),
	});
	const slotMeta = decodeSlotMeta(record.slotMeta);
	if (hasTmdbMovieConflict) delete slotMeta.tmdbMovie;
	if (hasTvdbShowConflict) delete slotMeta.tvdbShow;
	const attempts = decodeAttempts(record.attempts);
	return {
		...layer,
		...(Object.keys(slotMeta).length > 0 ? { slotMeta } : {}),
		...(Object.keys(attempts).length > 0 ? { attempts } : {}),
	};
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

function decodeSlotMeta(
	value: unknown,
): NonNullable<AutomaticMappingRecord["slotMeta"]> {
	if (!isObject(value)) return {};
	const result: NonNullable<AutomaticMappingRecord["slotMeta"]> = {};
	for (const slot of ["tmdbMovie", "tmdbShow", "tvdbShow"] as const) {
		const raw = value[slot];
		if (!isObject(raw)) continue;
		const expiresAt = validExpiry(raw.expiresAt);
		if (expiresAt === null) continue;
		result[slot] = {
			expiresAt,
			...(typeof raw.matchedTitle === "string" && raw.matchedTitle.trim()
				? { matchedTitle: raw.matchedTitle.trim() }
				: {}),
		};
	}
	return result;
}

function decodeAttempts(
	value: unknown,
): NonNullable<AutomaticMappingRecord["attempts"]> {
	if (!isObject(value)) return {};
	const result: NonNullable<AutomaticMappingRecord["attempts"]> = {};
	for (const lane of [
		"sonarrTvdb",
		"radarrTmdbMovie",
		"seerrTmdbMovie",
		"seerrTmdbShow",
	] as const) {
		const raw = value[lane];
		if (!isObject(raw)) continue;
		const expiresAt = validExpiry(raw.expiresAt);
		if (expiresAt !== null) result[lane] = { expiresAt };
	}
	return result;
}

function legacySourceKey(rawKey: string): string | null {
	const identity = parseSourceIdentityKey(rawKey);
	if (identity) return sourceIdentityKey(identity);
	const id = Number(rawKey);
	return Number.isSafeInteger(id) && id > 0 && rawKey === String(id)
		? `anilist:${id}`
		: null;
}

function validSeasons(value: unknown): number[] | undefined {
	return Array.isArray(value)
		? value.flatMap((season) => {
				const valid = validSeason(season);
				return valid === undefined ? [] : [valid];
			})
		: undefined;
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
