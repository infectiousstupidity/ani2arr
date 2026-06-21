/** Pure AniBridge v3 row parser for upstream targets and source crosswalks. */
// src/mapping/upstream/anibridge.parser.ts

import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import { parseMyAnimeListIdOrNull } from "@/myanimelist/types";
import { parseTmdbIdOrNull, parseTvdbIdOrNull } from "@/providers/schemas";
import {
	sourceIdentityKey,
	type SourceIdentity,
} from "@/mapping/source-identity";
import type { SeerrUpstreamTarget, UpstreamTarget } from "@/mapping/types";

export type UpstreamMappings = Record<string, UpstreamTarget[]>;
export type SeerrUpstreamMappings = Record<string, SeerrUpstreamTarget>;
export type AniListCrosswalkMappings = Record<string, AniListId>;

export type ParsedAniBridgeMappings = {
	mappings: UpstreamMappings;
	seerrTargets: SeerrUpstreamMappings;
	aniListCrosswalks: AniListCrosswalkMappings;
};

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
	const mappings: UpstreamMappings = {};
	const seerrTargets: SeerrUpstreamMappings = {};
	const aniListCrosswalks: AniListCrosswalkMappings = {};

	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return { mappings, seerrTargets, aniListCrosswalks };
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
			const target = parseTarget(rawTarget);
			return target === null ? [] : [target];
		});
		const seerrTarget = parseSeerrTarget(rawDescriptorKeys);
		const aniListId = parseUniqueAniListTarget(rawDescriptorKeys);

		for (const sourceIdentity of sourceIdentities) {
			const sourceKey = sourceIdentityKey(sourceIdentity);
			for (const target of targets) {
				addTarget(mappings, sourceKey, target);
			}

			if (seerrTarget) {
				seerrTargets[sourceKey] = seerrTarget;
			}

			if (sourceIdentity.source === "mal" && aniListId !== null) {
				aniListCrosswalks[sourceKey] = aniListId;
			}
		}
	}

	return { mappings, seerrTargets, aniListCrosswalks };
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

function parseTarget(value: string): UpstreamTarget | null {
	const target = parseDescriptor(value);

	if (!target) {
		return null;
	}

	if (target.name === "tmdb_movie" && target.scope === undefined) {
		const providerId = parseTmdbIdOrNull(target.id);

		return providerId === null
			? null
			: {
					provider: "radarr",
					providerId,
				};
	}

	if (target.name !== "tvdb_show") {
		return null;
	}

	const providerId = parseTvdbIdOrNull(target.id);

	if (providerId === null) {
		return null;
	}

	if (target.scope === undefined) {
		return {
			provider: "sonarr",
			providerId,
		};
	}

	const match = /^s(\d+)$/.exec(target.scope);

	if (!match) {
		return null;
	}

	const season = Number(match[1]);

	if (!Number.isSafeInteger(season)) {
		return null;
	}

	return {
		provider: "sonarr",
		providerId,
		season,
	};
}

function normalizeSeasons(seasons: readonly number[]): number[] {
	return [...new Set(seasons)]
		.filter((season) => Number.isSafeInteger(season) && season >= 0)
		.toSorted((left, right) => left - right);
}

function parseSeerrTarget(
	values: readonly string[],
): SeerrUpstreamTarget | null {
	const descriptors = values.flatMap((value) => {
		const target = parseDescriptor(value);
		return target ? [target] : [];
	});
	const movieTmdbIds = descriptors.flatMap((target) => {
		if (target.name !== "tmdb_movie" || target.scope !== undefined) return [];

		const tmdbId = parseTmdbIdOrNull(target.id);
		return tmdbId === null ? [] : [tmdbId];
	});

	if (movieTmdbIds.length > 0) {
		const tmdbId = movieTmdbIds.toSorted((left, right) => left - right)[0];
		if (tmdbId === undefined) return null;

		return {
			mediaType: "movie",
			tmdbId,
		};
	}

	const tmdbTargets = descriptors.flatMap((target) => {
		if (target.name !== "tmdb_show") return [];

		const tmdbId = parseTmdbIdOrNull(target.id);
		const season = parseSeasonScope(target.scope);
		return tmdbId === null || season === null ? [] : [{ tmdbId, season }];
	});
	const tmdbIds = new Set(tmdbTargets.map((target) => target.tmdbId));
	if (tmdbIds.size !== 1) return null;

	const tmdbId = tmdbTargets[0]?.tmdbId;
	if (tmdbId === undefined) return null;

	const tmdbSeasons = normalizeSeasons(
		tmdbTargets.map((target) => target.season),
	);

	const tvdbTargets = descriptors.flatMap((target) => {
		if (target.name !== "tvdb_show") return [];

		const tvdbId = parseTvdbIdOrNull(target.id);
		const season = parseSeasonScope(target.scope);
		return tvdbId === null || season === null ? [] : [{ tvdbId, season }];
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
		...(tvdbId === undefined ? {} : { tvdbId }),
	};
}

function parseSeasonScope(scope: string | undefined): number | null {
	const match = /^s(\d+)$/.exec(scope ?? "");
	if (!match) return null;

	const season = Number(match[1]);
	return Number.isSafeInteger(season) ? season : null;
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
