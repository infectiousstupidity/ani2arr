/** Stores manual Seerr request targets separate from Arr provider mappings. */
// src/mapping/seerr-target.store.ts

import { storage } from "@wxt-dev/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type TmdbId,
	type TvdbId,
} from "@/providers/schemas";

export type ManualSeerrTarget = {
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

export async function getManualSeerrTarget(
	anilistId: AniListId,
): Promise<ManualSeerrTarget | null> {
	const targets = await manualSeerrTargets.getValue();
	const target = targets[anilistId];
	if (!target) return null;

	const normalized = normalizeTarget(target);
	return normalized ? { anilistId, ...normalized } : null;
}

export async function listManualSeerrTargets(
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

export async function listAllManualSeerrTargets(): Promise<ManualSeerrTarget[]> {
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
