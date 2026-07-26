/** Downloads and stores normalized AniBridge mappings. */
// src/mapping/upstream.store.ts

import { storage } from "wxt/utils/storage";
import type { AniListId } from "@/anilist/types";
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
	parseSourceIdentityKey,
	sourceIdentityKey,
	type SourceIdentity,
} from "./source-identity";
import { normalizeSeasonNumbers } from "./season-numbers";
import type {
	AniBridgeEntries,
	AniBridgeTarget,
	SeerrUpstreamTarget,
	UpstreamTarget,
} from "./types";

const UPSTREAM_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

type UpstreamSnapshot = {
	/** LEGACY: optional until pre-source-key snapshots have completed one full refresh. */
	entries?: AniBridgeEntries;
	aniListCrosswalks?: AniListCrosswalkMappings;
	fetchedAt: number;
	etag?: string;
};

export type UpstreamMappingFact = {
	anilistId: AniListId;
	targets: UpstreamTarget[];
};

export type SourceUpstreamMapping = {
	anilistId: AniListId | null;
	targets: UpstreamTarget[];
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
	{
		fallback: null,
	},
);

let writes: Promise<void> = Promise.resolve();

export async function getSourceUpstreamMapping(
	provider: Provider,
	source: SourceIdentity,
): Promise<SourceUpstreamMapping> {
	const snapshot = await getSnapshot();
	const anilistId = getAniListIdForSource(snapshot, source);
	const directTargets = projectProviderTargets(snapshot, source, provider);
	const targets =
		directTargets.length > 0 ||
		source.source === "anilist" ||
		anilistId === null
			? directTargets
			: projectProviderTargets(
					snapshot,
					{ source: "anilist", id: anilistId },
					provider,
				);

	return { anilistId, targets };
}

export async function listAniListUpstreamMappings(): Promise<
	UpstreamMappingFact[]
> {
	const snapshot = await getSnapshot();
	const records: UpstreamMappingFact[] = [];

	for (const [sourceKey, entries] of Object.entries(snapshot?.entries ?? {})) {
		const source = parseSourceIdentityKey(sourceKey);
		if (source?.source !== "anilist") continue;

		const targets = projectUpstreamTargets(entries);
		records.push({
			anilistId: source.id,
			targets,
		});
	}

	return records;
}

export async function getUniqueAniListIdForSource(
	source: SourceIdentity,
): Promise<AniListId | null> {
	if (source.source === "anilist") return source.id;
	const snapshot = await getSnapshot();
	return getAniListIdForSource(snapshot, source);
}

export async function getSourceSeerrUpstreamMapping(
	source: SourceIdentity,
): Promise<SourceSeerrUpstreamMapping> {
	const snapshot = await getSnapshot();
	const anilistId = getAniListIdForSource(snapshot, source);
	const directProjection = projectSeerrTarget(
		snapshot?.entries?.[sourceIdentityKey(source)] ?? [],
	);
	if (
		directProjection.kind !== "missing" ||
		source.source === "anilist" ||
		anilistId === null
	) {
		return { anilistId, ...directProjection };
	}

	return {
		anilistId,
		...projectSeerrTarget(
			snapshot?.entries?.[
				sourceIdentityKey({ source: "anilist", id: anilistId })
			] ?? [],
		),
	};
}

export async function getUniqueAniListIdsForSources(
	sources: readonly SourceIdentity[],
): Promise<Record<string, AniListId | null>> {
	const uniqueSources = new Map(
		sources.map((source) => [sourceIdentityKey(source), source]),
	);
	if (uniqueSources.size === 0) return {};

	const snapshot = await getSnapshot();
	return Object.fromEntries(
		[...uniqueSources].map(([sourceKey, source]) => [
			sourceKey,
			getAniListIdForSource(snapshot, source),
		]),
	);
}

export async function getSourceAliasesByAniListId(): Promise<
	ReadonlyMap<AniListId, SourceIdentity[]>
> {
	const snapshot = await getSnapshot();
	const aliasesByAniListId = new Map<AniListId, SourceIdentity[]>();

	for (const [sourceKey, anilistId] of Object.entries(
		snapshot?.aniListCrosswalks ?? {},
	)) {
		const alias = parseSourceIdentityKey(sourceKey);
		if (alias === null || alias.source === "anilist") continue;

		const aliases = aliasesByAniListId.get(anilistId) ?? [];
		aliases.push(alias);
		aliasesByAniListId.set(anilistId, aliases);
	}
	for (const aliases of aliasesByAniListId.values()) {
		aliases.sort((left, right) => left.id - right.id);
	}

	return aliasesByAniListId;
}

export async function listSeerrUpstreamTargets(
	ids: readonly AniListId[],
): Promise<SeerrUpstreamRecord[]> {
	const requestedIds = new Set(ids);
	if (requestedIds.size === 0) return [];

	const snapshot = await getSnapshot();
	const records: SeerrUpstreamRecord[] = [];

	for (const anilistId of requestedIds) {
		const projection = projectSeerrTarget(
			snapshot?.entries?.[
				sourceIdentityKey({ source: "anilist", id: anilistId })
			] ?? [],
		);
		if (projection.kind !== "missing") {
			records.push({ anilistId, ...projection });
		}
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function listAllSeerrUpstreamTargets(): Promise<
	SeerrUpstreamRecord[]
> {
	const snapshot = await getSnapshot();
	const records: SeerrUpstreamRecord[] = [];

	for (const [sourceKey, entries] of Object.entries(snapshot?.entries ?? {})) {
		const source = parseSourceIdentityKey(sourceKey);
		if (source?.source !== "anilist") continue;

		const projection = projectSeerrTarget(entries);
		if (projection.kind !== "missing") {
			records.push({ anilistId: source.id, ...projection });
		}
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function refreshUpstreamMappings(): Promise<boolean> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const stored = await upstreamMappings.getValue();
			const previous = stored;
			const hasSourceKeyedEntries = isSourceKeyedSnapshot(previous);
			if (
				hasSourceKeyedEntries &&
				Date.now() - previous.fetchedAt < UPSTREAM_REFRESH_INTERVAL_MS
			) {
				return false;
			}

			/** LEGACY: omit ETag until pre-source-key snapshots have refreshed once. Remove after one released version. */
			const etag = hasSourceKeyedEntries ? previous?.etag : undefined;
			const result = await downloadAniBridgeMappings({ etag });
			if (result.status === "not-modified") {
				if (!previous || !hasSourceKeyedEntries) {
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
	return upstreamMappings.getValue();
}

function isSourceKeyedSnapshot(
	snapshot: UpstreamSnapshot | null,
): snapshot is UpstreamSnapshot & { entries: AniBridgeEntries } {
	if (snapshot?.entries === undefined) return false;
	return Object.keys(snapshot.entries).every(
		(key) => parseSourceIdentityKey(key) !== null,
	);
}

function haveMappingFactsChanged(
	previous: UpstreamSnapshot | null,
	next: Pick<UpstreamSnapshot, "entries" | "aniListCrosswalks">,
): boolean {
	if (previous?.entries === undefined || next.entries === undefined)
		return true;

	return (
		JSON.stringify(previous.entries) !== JSON.stringify(next.entries) ||
		JSON.stringify(previous.aniListCrosswalks ?? {}) !==
			JSON.stringify(next.aniListCrosswalks ?? {})
	);
}

function getAniListIdForSource(
	snapshot: UpstreamSnapshot | null,
	source: SourceIdentity,
): AniListId | null {
	return source.source === "anilist"
		? source.id
		: (snapshot?.aniListCrosswalks?.[sourceIdentityKey(source)] ?? null);
}

function projectProviderTargets(
	snapshot: UpstreamSnapshot | null,
	source: SourceIdentity,
	provider: Provider,
): UpstreamTarget[] {
	return projectUpstreamTargets(
		snapshot?.entries?.[sourceIdentityKey(source)] ?? [],
	).filter((target) => target.provider === provider);
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
	const sonarrTargets: UpstreamTarget[] = [...sonarrSeasonsById].flatMap(
		([providerId, seasons]) =>
			[...seasons].map((season) => ({
				provider: "sonarr",
				providerId,
				...(season === undefined ? {} : { season }),
			})),
	);

	return [...radarrTargets, ...sonarrTargets];
}

function projectSeerrTarget(
	targets: readonly AniBridgeTarget[],
): SeerrTargetProjection {
	if (targets.length === 0) return { kind: "missing" };

	const movieTmdbIds = new Set(
		targets.flatMap((target) => {
			if (target.kind !== "tmdb-movie") return [];

			const tmdbId = parseTmdbIdOrNull(target.id);
			return tmdbId === null ? [] : [tmdbId];
		}),
	);

	const tmdbTargets = targets.flatMap((target) => {
		if (target.kind !== "tmdb-show") return [];

		const tmdbId = parseTmdbIdOrNull(target.id);
		return tmdbId === null ? [] : [{ tmdbId, season: target.season }];
	});
	const tvdbTargets = targets.flatMap((target) => {
		if (target.kind !== "tvdb-show") return [];

		const tvdbId = parseTvdbIdOrNull(target.id);
		return tvdbId === null ? [] : [{ tvdbId, season: target.season }];
	});

	if (movieTmdbIds.size > 0) {
		if (
			movieTmdbIds.size !== 1 ||
			tmdbTargets.length > 0 ||
			tvdbTargets.length > 0
		) {
			return { kind: "conflict" };
		}
		const tmdbId = [...movieTmdbIds][0];
		return tmdbId === undefined
			? { kind: "conflict" }
			: { kind: "target", target: { mediaType: "movie", tmdbId } };
	}

	const tmdbIds = new Set(tmdbTargets.map((target) => target.tmdbId));
	if (tmdbIds.size === 0) return { kind: "missing" };
	if (tmdbIds.size > 1) return { kind: "conflict" };

	const tmdbId = tmdbTargets[0]?.tmdbId;
	if (tmdbId === undefined) return { kind: "conflict" };

	const tmdbSeasons = normalizeSeasonNumbers(
		tmdbTargets.flatMap((target) =>
			target.season === undefined ? [] : [target.season],
		),
	);
	const tvdbIds = new Set(tvdbTargets.map((target) => target.tvdbId));
	const tvdbId = tvdbIds.size === 1 ? [...tvdbIds][0] : undefined;
	const tvdbSeasons =
		tvdbId === undefined
			? []
			: normalizeSeasonNumbers(
					tvdbTargets.flatMap((target) =>
						target.tvdbId === tvdbId && target.season !== undefined
							? [target.season]
							: [],
					),
				);
	const seasons = normalizeSeasonNumbers([...tmdbSeasons, ...tvdbSeasons]);

	return {
		kind: "target",
		target: {
			mediaType: "tv",
			tmdbId,
			...(seasons.length === 0 ? {} : { seasons }),
			...(tmdbSeasons.length === 0 ? {} : { tmdbSeasons }),
			...(tvdbSeasons.length === 0 ? {} : { tvdbSeasons }),
			...(tvdbId === undefined ? {} : { tvdbId }),
		},
	};
}
