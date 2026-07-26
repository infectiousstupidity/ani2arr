/** Stores manual Seerr targets and resolves effective target precedence. */
// src/mapping/seerr-target.store.ts

import { storage } from "wxt/utils/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import {
	parseSourceIdentityKey,
	sourceIdentityKey,
	type SourceIdentity,
} from "@/mapping/source-identity";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type TmdbId,
	type TvdbId,
} from "@/providers/schemas";
import { collectEffectiveMappingRecords } from "./mapping-facts";
import {
	getSourceSeerrUpstreamMapping,
	listAllSeerrUpstreamTargets,
	listSeerrUpstreamTargets,
	type SeerrUpstreamRecord,
} from "./upstream.store";
import type { SeerrUpstreamTarget } from "./types";

type AniListManualSeerrTarget = {
	anilistId: AniListId;
} & (
	| {
			mediaType: "movie";
			tmdbId: TmdbId;
	  }
	| {
			mediaType: "tv";
			tmdbId: TmdbId;
			tvdbId?: TvdbId;
			seasons?: number[];
	  }
);

type StoredManualSeerrTarget =
	| {
			mediaType: "movie";
			tmdbId: TmdbId;
	  }
	| {
			mediaType: "tv";
			tmdbId: TmdbId;
			tvdbId?: TvdbId;
			seasons?: number[];
	  };
type ManualSeerrTargets = Record<string, StoredManualSeerrTarget>;

type SeerrTargetIdentity = {
	identity: SourceIdentity;
	anilistId?: AniListId | undefined;
};

type SeerrTargetIdentityInput = SeerrTargetIdentity | AniListId;

/** LEGACY: remove with the Radarr fallback when source-native Seerr auto-resolution lands. */
type LegacyRadarrSeerrTarget = {
	anilistId: AniListId;
	mediaType: "movie";
	tmdbId: TmdbId;
	source: "automatic";
};

type EffectiveSeerrTarget =
	| ({
			anilistId?: AniListId | undefined;
			source: "manual";
	  } & StoredManualSeerrTarget)
	| ({
			anilistId?: AniListId | undefined;
			source: "anibridge";
	  } & SeerrUpstreamTarget)
	| LegacyRadarrSeerrTarget;

type AniListEffectiveSeerrTarget = EffectiveSeerrTarget & {
	anilistId: AniListId;
};

const manualSeerrTargets = storage.defineItem<ManualSeerrTargets>(
	"local:mapping:seerr-targets",
	{
		fallback: {},
	},
);

let writes: Promise<void> = Promise.resolve();

function normalizeSeasons(seasons: readonly number[]): number[] {
	return [...new Set(seasons)]
		.filter((season) => Number.isSafeInteger(season) && season >= 0)
		.toSorted((left, right) => left - right);
}

function normalizeTarget(
	target: StoredManualSeerrTarget,
): StoredManualSeerrTarget | null {
	const tmdbId = parseTmdbIdOrNull(target.tmdbId);
	if (tmdbId === null) return null;

	if (target.mediaType === "movie") {
		return { mediaType: "movie", tmdbId };
	}

	const seasons = normalizeSeasons(target.seasons ?? []);

	const tvdbId = parseTvdbIdOrNull(target.tvdbId);
	return {
		mediaType: "tv",
		tmdbId,
		...(seasons.length === 0 ? {} : { seasons }),
		...(tvdbId === null ? {} : { tvdbId }),
	};
}

function normalizeManualSeerrTargets(
	targets: ManualSeerrTargets,
): ManualSeerrTargets {
	const normalizedTargets: ManualSeerrTargets = {};

	for (const [rawKey, target] of Object.entries(targets)) {
		const identity = parseSourceIdentityKey(rawKey);
		const normalized = normalizeTarget(target);
		if (identity !== null && normalized !== null) {
			normalizedTargets[sourceIdentityKey(identity)] = normalized;
			continue;
		}

		/** LEGACY: accept numeric AniList keys until all pre-source-key targets have been rewritten by a manual target mutation. */
		const legacyAniListId = parseAniListIdOrNull(Number(rawKey));
		if (legacyAniListId === null || normalized === null) continue;

		const legacyKey = sourceIdentityKey({
			source: "anilist",
			id: legacyAniListId,
		});
		if (normalizedTargets[legacyKey] === undefined) {
			normalizedTargets[legacyKey] = normalized;
		}
	}

	return normalizedTargets;
}

function getStoredManualTarget(
	targets: ManualSeerrTargets,
	identity: SourceIdentity,
): StoredManualSeerrTarget | null {
	return targets[sourceIdentityKey(identity)] ?? null;
}

function normalizeIdentityInput(
	input: SeerrTargetIdentityInput,
): SeerrTargetIdentity {
	return typeof input === "number"
		? {
				identity: { source: "anilist", id: input },
				anilistId: input,
			}
		: input;
}

async function getManualSeerrTarget(input: SeerrTargetIdentityInput) {
	const normalizedInput = normalizeIdentityInput(input);
	const targets = normalizeManualSeerrTargets(
		await manualSeerrTargets.getValue(),
	);
	const direct = getStoredManualTarget(targets, normalizedInput.identity);
	if (direct) {
		return {
			...direct,
			...(normalizedInput.anilistId === undefined
				? {}
				: { anilistId: normalizedInput.anilistId }),
			source: "manual" as const,
		};
	}

	if (
		normalizedInput.anilistId === undefined ||
		normalizedInput.identity.source === "anilist"
	) {
		return null;
	}

	const canonical = getStoredManualTarget(targets, {
		source: "anilist",
		id: normalizedInput.anilistId,
	});
	return canonical
		? {
				...canonical,
				anilistId: normalizedInput.anilistId,
				source: "manual" as const,
			}
		: null;
}

async function listManualSeerrTargets(
	ids: readonly AniListId[],
): Promise<AniListManualSeerrTarget[]> {
	const requestedIds = new Set(ids);
	if (requestedIds.size === 0) return [];

	const targets = normalizeManualSeerrTargets(
		await manualSeerrTargets.getValue(),
	);
	const records: AniListManualSeerrTarget[] = [];

	for (const anilistId of requestedIds) {
		const target = getStoredManualTarget(targets, {
			source: "anilist",
			id: anilistId,
		});
		if (target) records.push({ anilistId, ...target });
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

async function listAllManualSeerrTargets(): Promise<
	AniListManualSeerrTarget[]
> {
	const targets = normalizeManualSeerrTargets(
		await manualSeerrTargets.getValue(),
	);
	const records: AniListManualSeerrTarget[] = [];

	for (const [rawKey, target] of Object.entries(targets)) {
		const identity = parseSourceIdentityKey(rawKey);
		if (identity?.source !== "anilist") continue;
		records.push({ anilistId: identity.id, ...target });
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

async function listRadarrMappingSeerrTargets(
	requestedIds?: ReadonlySet<AniListId>,
): Promise<LegacyRadarrSeerrTarget[]> {
	const records = await collectEffectiveMappingRecords("radarr");
	const targets: LegacyRadarrSeerrTarget[] = [];

	for (const record of records) {
		if (
			record.result.kind !== "mapped" ||
			(requestedIds && !requestedIds.has(record.anilistId))
		) {
			continue;
		}

		const tmdbId = parseTmdbIdOrNull(record.result.providerId);
		if (tmdbId === null) continue;

		targets.push({
			anilistId: record.anilistId,
			mediaType: "movie",
			tmdbId,
			source: "automatic",
		});
	}

	return targets.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function getEffectiveSeerrTarget(
	input: SeerrTargetIdentityInput,
): Promise<EffectiveSeerrTarget | null> {
	const normalizedInput = normalizeIdentityInput(input);
	const manual = await getManualSeerrTarget(normalizedInput);
	if (manual) return manual;

	let upstream;
	if (normalizedInput.identity.source === "anilist") {
		const records = await listSeerrUpstreamTargets([
			normalizedInput.identity.id,
		]);
		upstream = records[0] ?? {
			anilistId: normalizedInput.identity.id,
			kind: "missing" as const,
		};
	} else {
		upstream = await getSourceSeerrUpstreamMapping(normalizedInput.identity);
	}
	const anilistId =
		normalizedInput.anilistId ?? upstream.anilistId ?? undefined;
	if (upstream.kind === "target") {
		return {
			...(anilistId === undefined ? {} : { anilistId }),
			source: "anibridge",
			...upstream.target,
		};
	}
	if (upstream.kind === "conflict") return null;
	if (anilistId === undefined) return null;

	const radarrTargets = await listRadarrMappingSeerrTargets(
		new Set([anilistId]),
	);
	return radarrTargets[0] ?? null;
}

export async function listEffectiveSeerrTargets(
	ids: readonly AniListId[],
): Promise<AniListEffectiveSeerrTarget[]> {
	const requestedIds = new Set(ids);
	if (requestedIds.size === 0) return [];

	const [manualTargets, upstreamTargets, radarrTargets] = await Promise.all([
		listManualSeerrTargets(ids),
		listSeerrUpstreamTargets(ids),
		listRadarrMappingSeerrTargets(requestedIds),
	]);
	return mergeSeerrTargets(manualTargets, upstreamTargets, radarrTargets);
}

export async function listAllEffectiveSeerrTargets(): Promise<
	AniListEffectiveSeerrTarget[]
> {
	const [manualTargets, upstreamTargets, radarrTargets] = await Promise.all([
		listAllManualSeerrTargets(),
		listAllSeerrUpstreamTargets(),
		listRadarrMappingSeerrTargets(),
	]);
	return mergeSeerrTargets(manualTargets, upstreamTargets, radarrTargets);
}

export async function setManualSeerrTarget(
	input:
		(SeerrTargetIdentity & StoredManualSeerrTarget) | AniListManualSeerrTarget,
): Promise<void> {
	const identity =
		"identity" in input
			? input.identity
			: ({ source: "anilist", id: input.anilistId } as const);
	const anilistId = input.anilistId;
	const storedTarget: StoredManualSeerrTarget =
		input.mediaType === "movie"
			? { mediaType: "movie", tmdbId: input.tmdbId }
			: {
					mediaType: "tv",
					tmdbId: input.tmdbId,
					...(input.tvdbId === undefined ? {} : { tvdbId: input.tvdbId }),
					...(input.seasons === undefined ? {} : { seasons: input.seasons }),
				};
	const normalized = normalizeTarget(storedTarget);
	if (normalized === null) {
		throw new Error("Invalid Seerr target.");
	}
	const storageIdentity =
		anilistId === undefined
			? identity
			: ({ source: "anilist", id: anilistId } as const);

	await updateManualSeerrTargets((targets) => {
		if (sourceIdentityKey(identity) !== sourceIdentityKey(storageIdentity)) {
			delete targets[sourceIdentityKey(identity)];
		}
		targets[sourceIdentityKey(storageIdentity)] = normalized;
	});
}

export async function clearManualSeerrTarget(
	input: SeerrTargetIdentityInput,
): Promise<void> {
	const normalizedInput = normalizeIdentityInput(input);
	await updateManualSeerrTargets((targets) => {
		delete targets[sourceIdentityKey(normalizedInput.identity)];
		if (normalizedInput.anilistId !== undefined) {
			delete targets[
				sourceIdentityKey({
					source: "anilist",
					id: normalizedInput.anilistId,
				})
			];
		}
	});
}

export async function clearManualSeerrTargets(): Promise<void> {
	await updateManualSeerrTargets((targets) => {
		for (const key of Object.keys(targets)) {
			delete targets[key];
		}
	});
}

function mergeSeerrTargets(
	manualTargets: readonly AniListManualSeerrTarget[],
	upstreamTargets: readonly SeerrUpstreamRecord[],
	radarrTargets: readonly LegacyRadarrSeerrTarget[],
): AniListEffectiveSeerrTarget[] {
	const targetsById = new Map<AniListId, AniListEffectiveSeerrTarget>(
		radarrTargets.map((target) => [target.anilistId, target]),
	);

	for (const record of upstreamTargets) {
		if (record.kind === "conflict") {
			targetsById.delete(record.anilistId);
			continue;
		}
		targetsById.set(record.anilistId, {
			anilistId: record.anilistId,
			source: "anibridge",
			...record.target,
		});
	}

	for (const target of manualTargets) {
		targetsById.set(target.anilistId, { ...target, source: "manual" });
	}

	return [...targetsById.values()].toSorted(
		(left, right) => left.anilistId - right.anilistId,
	);
}

async function updateManualSeerrTargets(
	update: (targets: ManualSeerrTargets) => void,
): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const targets = normalizeManualSeerrTargets(
				await manualSeerrTargets.getValue(),
			);
			update(targets);
			await manualSeerrTargets.setValue(targets);
		});

	writes = next.then(
		() => {},
		() => {},
	);

	await next;
}
