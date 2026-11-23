/** Pure AniBridge v3 row parser for normalized upstream mapping records. */

import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import { parseMyAnimeListIdOrNull } from "@/myanimelist/types";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type TmdbId,
	type TvdbId,
} from "@/providers/schemas";
import {
	createMappingRecord,
	type UpstreamMappingRecord,
} from "../mapping-record";
import { sourceIdentityKey, type SourceIdentity } from "../source-identity";

export type ParsedAniBridgeData = {
	records: Record<string, UpstreamMappingRecord>;
};

// Parsing deliberately enumerates the released descriptor variants and trust checks.
// eslint-disable-next-line complexity
export function parseAniBridgeData(payload: unknown): ParsedAniBridgeData {
	const records: Record<string, UpstreamMappingRecord> = {};
	if (!payload || typeof payload !== "object" || Array.isArray(payload))
		return { records };
	for (const [rawRowKey, rawTargets] of Object.entries(
		payload as Record<string, unknown>,
	)) {
		if (
			!rawTargets ||
			typeof rawTargets !== "object" ||
			Array.isArray(rawTargets)
		)
			continue;
		const source = parseSourceDescriptor(parseDescriptor(rawRowKey));
		if (source === null) continue;
		const rawTargetKeys = Object.keys(rawTargets);
		const tmdbMovie: TmdbId[] = [];
		const tmdbShow: Array<{ id: TmdbId; seasons?: number[] }> = [];
		const tvdbShow: Array<{ id: TvdbId; seasons?: number[] }> = [];
		for (const rawTarget of rawTargetKeys) {
			const target = parseDescriptor(rawTarget);
			if (!target) continue;
			if (target.name === "tmdb_movie" && target.scope === undefined) {
				const id = parseTmdbIdOrNull(target.id);
				if (id !== null) tmdbMovie.push(id);
			} else if (target.name === "tmdb_show") {
				const id = parseTmdbIdOrNull(target.id);
				const season = parseOptionalSeasonScope(target.scope);
				if (id !== null && season !== null)
					tmdbShow.push({
						id,
						...(season === undefined ? {} : { seasons: [season] }),
					});
			} else if (target.name === "tvdb_show") {
				const id = parseTvdbIdOrNull(target.id);
				const season = parseOptionalSeasonScope(target.scope);
				if (id !== null && season !== null)
					tvdbShow.push({
						id,
						...(season === undefined ? {} : { seasons: [season] }),
					});
			}
		}
		const linkedAniListId =
			source.source === "mal" ? parseUniqueAniListTarget(rawTargetKeys) : null;
		if (
			tmdbMovie.length === 0 &&
			tmdbShow.length === 0 &&
			tvdbShow.length === 0 &&
			linkedAniListId === null
		)
			continue;
		const record = createMappingRecord({ tmdbMovie, tmdbShow, tvdbShow });
		records[sourceIdentityKey(source)] = {
			...record,
			...(linkedAniListId === null ? {} : { linkedAniListId }),
		};
	}
	return { records };
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
	const ids = values.flatMap((value) => {
		const target = parseDescriptor(value);
		if (target?.name !== "anilist" || target.scope !== undefined) return [];
		const id = parseAniListIdOrNull(target.id);
		return id === null ? [] : [id];
	});
	const unique = [...new Set(ids)];
	return unique.length === 1 ? (unique[0] ?? null) : null;
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

type Descriptor = { name: string; id: number; scope?: string };

function parseDescriptor(value: string): Descriptor | null {
	const parts = value.split(":");
	if (parts.length !== 2 && parts.length !== 3) return null;
	const [name, rawId, scope] = parts;
	const id = Number(rawId);
	if (!name || !Number.isSafeInteger(id) || id <= 0) return null;
	return { name, id, ...(scope === undefined ? {} : { scope }) };
}
