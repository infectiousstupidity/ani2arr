/** Pure AniBridge v3 row parser for normalized upstream source records. */
// src/mapping/upstream/anibridge.parser.ts

import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import { parseMyAnimeListIdOrNull } from "@/myanimelist/types";
import { parseTmdbIdOrNull, parseTvdbIdOrNull } from "@/providers/schemas";
import { sourceIdentityKey, type SourceIdentity } from "@/mapping/source-identity";
import type {
	UpstreamSourceRecords,
	UpstreamTarget,
} from "@/mapping/types";

export type ParsedAniBridgeData = {
	records: UpstreamSourceRecords;
};

export function parseAniBridgeData(payload: unknown): ParsedAniBridgeData {
	const records: UpstreamSourceRecords = {};

	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return { records };
	}

	for (const [rawRowKey, rawTargets] of Object.entries(
		payload as Record<string, unknown>,
	)) {
		if (
			!rawTargets ||
			typeof rawTargets !== "object" ||
			Array.isArray(rawTargets)
		) {
			continue;
		}

		const source = parseSourceDescriptor(parseDescriptor(rawRowKey));
		if (source === null) continue;

		const rawTargetKeys = Object.keys(rawTargets);
		const targets = rawTargetKeys.flatMap((rawTarget) => {
			const target = parseAniBridgeTarget(rawTarget);
			return target === null ? [] : [target];
		});
		const linkedAniListId =
			source.source === "mal"
				? parseUniqueAniListTarget(rawTargetKeys)
				: null;
		if (targets.length === 0 && linkedAniListId === null) continue;

		records[sourceIdentityKey(source)] = {
			...(linkedAniListId === null ? {} : { linkedAniListId }),
			targets,
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
	const aniListIds = values.flatMap((value) => {
		const target = parseDescriptor(value);
		if (target?.name !== "anilist" || target.scope !== undefined) return [];

		const id = parseAniListIdOrNull(target.id);
		return id === null ? [] : [id];
	});
	const uniqueIds = [...new Set(aniListIds)];

	return uniqueIds.length === 1 ? (uniqueIds[0] ?? null) : null;
}

function parseAniBridgeTarget(value: string): UpstreamTarget | null {
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
