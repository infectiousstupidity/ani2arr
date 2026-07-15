/** Pure AniBridge v3 row parser for upstream targets and source crosswalks. */
// src/mapping/upstream/anibridge.parser.ts

import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import { parseMyAnimeListIdOrNull } from "@/myanimelist/types";
import { parseTmdbIdOrNull, parseTvdbIdOrNull } from "@/providers/schemas";
import {
	sourceIdentityKey,
	type SourceIdentity,
} from "@/mapping/source-identity";
import type {
	AniBridgeEntries,
	AniBridgeTarget,
	SeerrUpstreamTarget,
	UpstreamTarget,
} from "@/mapping/types";

export type UpstreamMappings = Record<string, UpstreamTarget[]>;
export type SeerrUpstreamMappings = Record<string, SeerrUpstreamTarget>;
export type AniListCrosswalkMappings = Record<string, AniListId>;

export type ParsedAniBridgeMappings = {
	entries: AniBridgeEntries;
	mappings: UpstreamMappings;
	seerrTargets: SeerrUpstreamMappings;
	aniListCrosswalks: AniListCrosswalkMappings;
};

export function parseAniBridgeEntries(payload: unknown): AniBridgeEntries {
	return parseAniBridgeMappingsPayload(payload).entries;
}

export function parseAniBridgeMappings(payload: unknown): UpstreamMappings {
	return parseAniBridgeMappingsPayload(payload).mappings;
}

export function parseAniBridgeSeerrTargets(
	payload: unknown,
): SeerrUpstreamMappings {
	return parseAniBridgeMappingsPayload(payload).seerrTargets;
}

export function parseAniBridgeAniListCrosswalks(
	payload: unknown,
): AniListCrosswalkMappings {
	return parseAniBridgeMappingsPayload(payload).aniListCrosswalks;
}

export function parseAniBridgeMappingsPayload(
	payload: unknown,
): ParsedAniBridgeMappings {
	const entries: AniBridgeEntries = {};
	const mappings: UpstreamMappings = {};
	const seerrTargets: SeerrUpstreamMappings = {};
	const aniListCrosswalks: AniListCrosswalkMappings = {};

	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return { entries, mappings, seerrTargets, aniListCrosswalks };
	}

	for (const [rawRowKey, rawTargets] of Object.entries(
		payload as Record<string, unknown>,
	)) {
		if (!rawTargets || typeof rawTargets !== "object" || Array.isArray(rawTargets)) {
			continue;
		}

		const rawDescriptorKeys = [rawRowKey, ...Object.keys(rawTargets)];
		const sourceIdentities = rawDescriptorKeys.flatMap((rawDescriptor) => {
			const source = parseSourceDescriptor(parseDescriptor(rawDescriptor));
			return source === null ? [] : [source];
		});
		if (sourceIdentities.length === 0) continue;

		const targets = rawDescriptorKeys.flatMap((rawTarget) => {
			const target = parseAniBridgeTarget(rawTarget);
			return target === null ? [] : [target];
		});
		const seerrTarget = projectSeerrTarget(targets);
		const aniListId = parseUniqueAniListTarget(rawDescriptorKeys);

		for (const sourceIdentity of sourceIdentities) {
			const sourceKey = sourceIdentityKey(sourceIdentity);
			for (const target of targets) {
				const upstreamTarget = projectUpstreamTarget(target);
				if (upstreamTarget !== null) {
					addTarget(mappings, sourceKey, upstreamTarget);
				}
			}

			if (sourceIdentity.source === "anilist") {
				for (const target of targets) {
					addAniBridgeTarget(entries, sourceIdentity.id, target);
				}

				if (seerrTarget) {
					seerrTargets[sourceKey] = seerrTarget;
				}
			}

			if (sourceIdentity.source === "mal" && aniListId !== null) {
				aniListCrosswalks[sourceKey] = aniListId;
			}
		}
	}

	return { entries, mappings, seerrTargets, aniListCrosswalks };
}

function parseSourceDescriptor(
	descriptor: Descriptor | null,
): SourceIdentity | null {
	if (descriptor?.scope !== undefined) return null;

	if (descriptor?.name === "anilist") {
		const id = parseAniListIdOrNull(descriptor.id);
		return id === null ? null : { source: "anilist", id };
	}

	if (descriptor?.name === "mal") {
		const id = parseMyAnimeListIdOrNull(descriptor.id);
		return id === null ? null : { source: "mal", id };
	}

	return null;
}

function parseUniqueAniListTarget(values: readonly string[]): AniListId | null {
	const aniListIds = values.flatMap((value) => {
		const target = parseDescriptor(value);
		if (target?.name !== "anilist" || target.scope !== undefined) return [];

		const id = parseAniListIdOrNull(target.id);
		return id === null ? [] : [id];
	});
	const uniqueIds = [...new Set(aniListIds)];

	return uniqueIds.length === 1 ? (uniqueIds[0] ?? null) : null;
}

function parseAniBridgeTarget(value: string): AniBridgeTarget | null {
	const target = parseDescriptor(value);

	if (!target) return null;

	if (target.name === "tmdb_movie" && target.scope === undefined) {
		const id = parseTmdbIdOrNull(target.id);

		return id === null ? null : { kind: "tmdb-movie", id };
	}

	if (target.name === "tmdb_show") {
		const id = parseTmdbIdOrNull(target.id);
		const season = parseOptionalSeasonScope(target.scope);

		return id === null || season === null
			? null
			: {
					kind: "tmdb-show",
					id,
					...(season === undefined ? {} : { season }),
				};
	}

	if (target.name === "tvdb_show") {
		const id = parseTvdbIdOrNull(target.id);
		const season = parseOptionalSeasonScope(target.scope);

		return id === null || season === null
			? null
			: {
					kind: "tvdb-show",
					id,
					...(season === undefined ? {} : { season }),
				};
	}

	return null;
}

function projectUpstreamTarget(
	target: AniBridgeTarget,
): UpstreamTarget | null {
	switch (target.kind) {
		case "tmdb-movie": {
			return { provider: "radarr", providerId: target.id };
		}
		case "tvdb-show": {
			return {
				provider: "sonarr",
				providerId: target.id,
				...(target.season === undefined ? {} : { season: target.season }),
			};
		}
		case "tmdb-show": {
			return null;
		}
	}
}

function normalizeSeasons(seasons: readonly number[]): number[] {
	return [...new Set(seasons)]
		.filter((season) => Number.isSafeInteger(season) && season >= 0)
		.toSorted((left, right) => left - right);
}

function projectSeerrTarget(
	targets: readonly AniBridgeTarget[],
): SeerrUpstreamTarget | null {
	const movieTmdbIds = targets.flatMap((target) => {
		return target.kind === "tmdb-movie" ? [target.id] : [];
	});

	if (movieTmdbIds.length > 0) {
		const tmdbId = movieTmdbIds.toSorted((left, right) => left - right)[0];
		if (tmdbId === undefined) return null;

		return {
			mediaType: "movie",
			tmdbId,
		};
	}

	const tmdbTargets = targets.flatMap((target) => {
		return target.kind === "tmdb-show" && target.season !== undefined
			? [{ tmdbId: target.id, season: target.season }]
			: [];
	});
	const tmdbIds = new Set(tmdbTargets.map((target) => target.tmdbId));
	if (tmdbIds.size !== 1) return null;

	const tmdbId = tmdbTargets[0]?.tmdbId;
	if (tmdbId === undefined) return null;

	const tmdbSeasons = normalizeSeasons(
		tmdbTargets.map((target) => target.season),
	);

	const tvdbTargets = targets.flatMap((target) => {
		return target.kind === "tvdb-show" && target.season !== undefined
			? [{ tvdbId: target.id, season: target.season }]
			: [];
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

function parseOptionalSeasonScope(
	scope: string | undefined,
): number | null | undefined {
	if (scope === undefined) return undefined;

	const match = /^s(\d+)$/.exec(scope);
	if (!match) return null;

	const season = Number(match[1]);
	return Number.isSafeInteger(season) ? season : null;
}

function addAniBridgeTarget(
	entries: AniBridgeEntries,
	anilistId: AniListId,
	target: AniBridgeTarget,
): void {
	const targets = entries[anilistId] ?? [];
	const season = "season" in target ? target.season : undefined;
	const alreadyExists = targets.some((existing) => {
		const existingSeason =
			"season" in existing ? existing.season : undefined;

		return (
			existing.kind === target.kind &&
			existing.id === target.id &&
			existingSeason === season
		);
	});

	if (!alreadyExists) {
		entries[anilistId] = [...targets, target];
	}
}

type Descriptor = { name: string; id: number; scope?: string };

function parseDescriptor(value: string): Descriptor | null {
	const parts = value.split(":");

	if (parts.length !== 2 && parts.length !== 3) {
		return null;
	}

	const [name, rawId, scope] = parts;
	const id = Number(rawId);

	if (!name || !Number.isSafeInteger(id) || id <= 0) {
		return null;
	}

	return {
		name,
		id,
		...(scope === undefined ? {} : { scope }),
	};
}

function addTarget(
	mappings: UpstreamMappings,
	sourceKey: string,
	target: UpstreamTarget,
): void {
	const targets = mappings[sourceKey] ?? [];

	const alreadyExists = targets.some((existing) => {
		if (
			existing.provider !== target.provider ||
			existing.providerId !== target.providerId
		) {
			return false;
		}

		if (existing.provider === "sonarr" && target.provider === "sonarr") {
			return existing.season === target.season;
		}

		return true;
	});

	if (!alreadyExists) {
		mappings[sourceKey] = [...targets, target];
	}
}
