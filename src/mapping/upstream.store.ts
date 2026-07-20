/** Downloads and stores normalized AniBridge mappings. */
// src/mapping/upstream.store.ts

import { storage } from "wxt/utils/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type TmdbId,
	type TvdbId,
} from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import { downloadAniBridgeMappings } from "@/mapping/upstream/anibridge.client";
import type { AniListCrosswalkMappings } from "@/mapping/upstream/anibridge.parser";
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
	/** LEGACY: optional until projection-only snapshots have completed one full refresh. */
	entries?: AniBridgeEntries;
	aniListCrosswalks?: AniListCrosswalkMappings;
	fetchedAt: number;
	etag?: string;
};

export type UpstreamSourceFact = {
	source: SourceIdentity;
	anilistId: AniListId;
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
	UpstreamSourceFact[]
> {
	const snapshot = await getSnapshot();
	const records: UpstreamSourceFact[] = [];
	const targetsByAniListId = new Map<AniListId, UpstreamTarget[]>();

	for (const [rawAniListId, entries] of Object.entries(
		snapshot?.entries ?? {},
	)) {
		const anilistId = parseAniListIdOrNull(Number(rawAniListId));
		if (anilistId === null) continue;

		const targets = projectUpstreamTargets(entries);
		targetsByAniListId.set(anilistId, targets);
		records.push({
			source: { source: "anilist", id: anilistId },
			anilistId,
			targets,
		});
	}

	for (const [rawSourceKey, rawAniListId] of Object.entries(
		snapshot?.aniListCrosswalks ?? {},
	)) {
		const source = parseSourceIdentityKey(rawSourceKey);
		const anilistId = parseAniListIdOrNull(rawAniListId);
		if (source?.source !== "mal" || anilistId === null) continue;

		records.push({
			source,
			anilistId,
			targets: [...(targetsByAniListId.get(anilistId) ?? [])],
		});
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

	for (const anilistId of requestedIds) {
		const target = projectSeerrTarget(snapshot?.entries?.[anilistId] ?? []);
		if (target !== null) records.push({ anilistId, target });
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function listAllSeerrUpstreamTargets(): Promise<
	SeerrUpstreamRecord[]
> {
	const snapshot = await getSnapshot();
	const records: SeerrUpstreamRecord[] = [];

	for (const [rawAniListId, entries] of Object.entries(
		snapshot?.entries ?? {},
	)) {
		const anilistId = parseAniListIdOrNull(Number(rawAniListId));
		if (anilistId === null) continue;

		const target = projectSeerrTarget(entries);
		if (target !== null) records.push({ anilistId, target });
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function refreshUpstreamMappings(): Promise<boolean> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const stored = await upstreamMappings.getValue();
			const previous = stored
				? normalizeSnapshot(stored)
				: null;
			if (
				previous?.entries !== undefined &&
				Date.now() - previous.fetchedAt < UPSTREAM_REFRESH_INTERVAL_MS
			) {
				return false;
			}

			/** LEGACY: omit ETag until projection-only snapshots have completed one full refresh. */
			const etag = previous?.entries === undefined ? undefined : previous.etag;
			const result = await downloadAniBridgeMappings({ etag });
			if (result.status === "not-modified") {
				if (!previous || previous.entries === undefined) {
					throw new Error("AniBridge returned 304 without stored entries.");
				}
				await upstreamMappings.setValue({
					entries: previous.entries,
					aniListCrosswalks: previous.aniListCrosswalks ?? {},
					fetchedAt: Date.now(),
					...(previous.etag ? { etag: previous.etag } : {}),
				});
				return false;
			}

			const changed = haveMappingFactsChanged(previous, result.parsed);

			await upstreamMappings.setValue({
				entries: result.parsed.entries,
				aniListCrosswalks: result.parsed.aniListCrosswalks,
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

async function getSnapshot(): Promise<UpstreamSnapshot | null> {
	const snapshot = await upstreamMappings.getValue();
	return snapshot ? normalizeSnapshot(snapshot) : null;
}

function normalizeSnapshot(snapshot: UpstreamSnapshot): UpstreamSnapshot {
	return {
		...(snapshot.entries === undefined ? {} : { entries: snapshot.entries }),
		aniListCrosswalks: normalizeAniListCrosswalkKeys(
			snapshot.aniListCrosswalks ?? {},
		),
		fetchedAt: snapshot.fetchedAt,
		...(snapshot.etag ? { etag: snapshot.etag } : {}),
	};
}

function haveMappingFactsChanged(
	previous: UpstreamSnapshot | null,
	next: Pick<UpstreamSnapshot, "entries" | "aniListCrosswalks">,
): boolean {
	if (previous?.entries === undefined || next.entries === undefined) return true;

	return (
		JSON.stringify(previous.entries) !== JSON.stringify(next.entries) ||
		JSON.stringify(previous.aniListCrosswalks ?? {}) !==
			JSON.stringify(next.aniListCrosswalks ?? {})
	);
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
	const radarrIds = new Set<TmdbId>();
	const sonarrSeasonsById = new Map<TvdbId, Set<number | undefined>>();

	for (const target of targets) {
		if (target.kind === "tmdb-movie") {
			radarrIds.add(target.id);
			continue;
		}

		if (target.kind === "tvdb-show") {
			const seasons =
				sonarrSeasonsById.get(target.id) ?? new Set<number | undefined>();
			seasons.add(target.season);
			sonarrSeasonsById.set(target.id, seasons);
		}
	}

	const radarrTargets: UpstreamTarget[] = [...radarrIds].map((providerId) => ({
		provider: "radarr",
		providerId,
	}));
	const sonarrTargets: UpstreamTarget[] = [...sonarrSeasonsById].map(
		([providerId, seasons]) => {
			const [season] = seasons;
			return {
				provider: "sonarr",
				providerId,
				...(seasons.size === 1 && season !== undefined ? { season } : {}),
			};
		},
	);

	return [...radarrTargets, ...sonarrTargets];
}

function normalizeSeasons(seasons: readonly number[]): number[] {
	return [...new Set(seasons)]
		.filter((season) => Number.isSafeInteger(season) && season >= 0)
		.toSorted((left, right) => left - right);
}

function projectSeerrTarget(
	targets: readonly AniBridgeTarget[],
): SeerrUpstreamTarget | null {
	const movieTmdbIds = new Set(targets.flatMap((target) => {
		if (target.kind !== "tmdb-movie") return [];

		const tmdbId = parseTmdbIdOrNull(target.id);
		return tmdbId === null ? [] : [tmdbId];
	}));

	const tmdbTargets = targets.flatMap((target) => {
		if (target.kind !== "tmdb-show") return [];

		const tmdbId = parseTmdbIdOrNull(target.id);
		return tmdbId === null ? [] : [{ tmdbId, season: target.season }];
	});

	if (movieTmdbIds.size > 0) {
		if (movieTmdbIds.size !== 1 || tmdbTargets.length > 0) return null;
		const tmdbId = [...movieTmdbIds][0];
		return tmdbId === undefined ? null : { mediaType: "movie", tmdbId };
	}

	const tmdbIds = new Set(tmdbTargets.map((target) => target.tmdbId));
	if (tmdbIds.size !== 1) return null;

	const tmdbId = tmdbTargets[0]?.tmdbId;
	if (tmdbId === undefined) return null;

	const tmdbSeasons = normalizeSeasons(
		tmdbTargets.flatMap((target) =>
			target.season === undefined ? [] : [target.season],
		),
	);
	const tvdbTargets = targets.flatMap((target) => {
		if (target.kind !== "tvdb-show" || target.season === undefined) return [];

		const tvdbId = parseTvdbIdOrNull(target.id);
		return tvdbId === null ? [] : [{ tvdbId, season: target.season }];
	});
	const tvdbIds = new Set(tvdbTargets.map((target) => target.tvdbId));
	const tvdbId = tvdbIds.size === 1 ? [...tvdbIds][0] : undefined;
	const tvdbSeasons =
		tvdbId === undefined
			? []
			: normalizeSeasons(
					tvdbTargets
						.filter((target) => target.tvdbId === tvdbId)
						.map((target) => target.season),
				);
	const seasons = normalizeSeasons([...tmdbSeasons, ...tvdbSeasons]);
	if (seasons.length === 0) return null;

	return {
		mediaType: "tv",
		tmdbId,
		seasons,
		...(tmdbSeasons.length === 0 ? {} : { tmdbSeasons }),
		...(tvdbSeasons.length === 0 ? {} : { tvdbSeasons }),
		...(tvdbId === undefined ? {} : { tvdbId }),
	};
}
