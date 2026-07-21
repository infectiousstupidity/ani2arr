/** Stores manual Seerr targets and resolves effective target precedence. */
// src/mapping/seerr-target.store.ts

import { storage } from "wxt/utils/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type TmdbId,
	type TvdbId,
} from "@/providers/schemas";
import { collectEffectiveMappingRecords } from "./mapping-facts";
import {
	listAllSeerrUpstreamTargets,
	listSeerrUpstreamTargets,
	type SeerrUpstreamRecord,
} from "./upstream.store";

type ManualSeerrTarget = {
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
			seasons: number[];
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
			seasons: number[];
	  };
type ManualSeerrTargets = Record<number, StoredManualSeerrTarget>;

type RadarrMappingSeerrTarget = {
	anilistId: AniListId;
	mediaType: "movie";
	tmdbId: TmdbId;
	source: "radarr-mapping";
};

type EffectiveSeerrTarget =
	| (ManualSeerrTarget & { source: "manual" })
	| ({ anilistId: AniListId; source: "anibridge" } &
			SeerrUpstreamRecord["target"])
	| RadarrMappingSeerrTarget;

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

	const seasons = normalizeSeasons(target.seasons);
	if (seasons.length === 0) return null;

	const tvdbId = parseTvdbIdOrNull(target.tvdbId);
	return {
		mediaType: "tv",
		tmdbId,
		seasons,
		...(tvdbId === null ? {} : { tvdbId }),
	};
}

async function getManualSeerrTarget(
	anilistId: AniListId,
): Promise<ManualSeerrTarget | null> {
	const targets = await manualSeerrTargets.getValue();
	const target = targets[anilistId];
	if (!target) return null;

	const normalized = normalizeTarget(target);
	return normalized ? { anilistId, ...normalized } : null;
}

async function listManualSeerrTargets(
	ids: readonly AniListId[],
): Promise<ManualSeerrTarget[]> {
	const requestedIds = new Set(ids);
	if (requestedIds.size === 0) return [];

	const targets = await manualSeerrTargets.getValue();
	const records: ManualSeerrTarget[] = [];

	for (const [rawAniListId, target] of Object.entries(targets)) {
		const anilistId = parseAniListIdOrNull(Number(rawAniListId));
		if (anilistId === null || !requestedIds.has(anilistId)) continue;

		const normalized = normalizeTarget(target);
		if (normalized) records.push({ anilistId, ...normalized });
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

async function listAllManualSeerrTargets(): Promise<ManualSeerrTarget[]> {
	const targets = await manualSeerrTargets.getValue();
	const records: ManualSeerrTarget[] = [];

	for (const [rawAniListId, target] of Object.entries(targets)) {
		const anilistId = parseAniListIdOrNull(Number(rawAniListId));
		if (anilistId === null) continue;

		const normalized = normalizeTarget(target);
		if (normalized) records.push({ anilistId, ...normalized });
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

async function listRadarrMappingSeerrTargets(
	requestedIds?: ReadonlySet<AniListId>,
): Promise<RadarrMappingSeerrTarget[]> {
	const records = await collectEffectiveMappingRecords("radarr");
	const targets: RadarrMappingSeerrTarget[] = [];

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
			source: "radarr-mapping",
		});
	}

	return targets.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function getEffectiveSeerrTarget(
	anilistId: AniListId,
): Promise<EffectiveSeerrTarget | null> {
	const manual = await getManualSeerrTarget(anilistId);
	if (manual) return { ...manual, source: "manual" };

	const upstream = await listSeerrUpstreamTargets([anilistId]);
	const record = upstream[0];
	if (record) {
		return {
			anilistId: record.anilistId,
			source: "anibridge",
			...record.target,
		};
	}

	const radarrTargets = await listRadarrMappingSeerrTargets(
		new Set([anilistId]),
	);
	return radarrTargets[0] ?? null;
}

export async function listEffectiveSeerrTargets(
	ids: readonly AniListId[],
): Promise<EffectiveSeerrTarget[]> {
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
	EffectiveSeerrTarget[]
> {
	const [manualTargets, upstreamTargets, radarrTargets] = await Promise.all([
		listAllManualSeerrTargets(),
		listAllSeerrUpstreamTargets(),
		listRadarrMappingSeerrTargets(),
	]);
	return mergeSeerrTargets(manualTargets, upstreamTargets, radarrTargets);
}

export async function setManualSeerrTarget(
	target: ManualSeerrTarget,
): Promise<void> {
	const { anilistId, ...storedTarget } = target;
	const normalized = normalizeTarget(storedTarget);
	if (normalized === null) {
		throw new Error("Invalid Seerr target.");
	}

	await updateManualSeerrTargets((targets) => {
		targets[anilistId] = normalized;
	});
}

export async function clearManualSeerrTarget(
	anilistId: AniListId,
): Promise<void> {
	await updateManualSeerrTargets((targets) => {
		delete targets[anilistId];
	});
}

export async function clearManualSeerrTargets(): Promise<void> {
	await updateManualSeerrTargets((targets) => {
		for (const anilistId of Object.keys(targets)) {
			delete targets[Number(anilistId)];
		}
	});
}

function mergeSeerrTargets(
	manualTargets: readonly ManualSeerrTarget[],
	upstreamTargets: readonly SeerrUpstreamRecord[],
	radarrTargets: readonly RadarrMappingSeerrTarget[],
): EffectiveSeerrTarget[] {
	const targetsById = new Map<AniListId, EffectiveSeerrTarget>(
		radarrTargets.map((target) => [target.anilistId, target]),
	);

	for (const record of upstreamTargets) {
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
			const targets = await manualSeerrTargets.getValue();
			update(targets);
			await manualSeerrTargets.setValue(targets);
		});

	writes = next.then(
		() => {},
		() => {},
	);

	await next;
}
