/** Pure AniBridge v3 row parser for upstream targets and source crosswalks. */
// src/mapping/upstream/anibridge.parser.ts

import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import { parseMyAnimeListIdOrNull } from "@/myanimelist/types";
import { parseTmdbIdOrNull, parseTvdbIdOrNull } from "@/providers/schemas";
import {
	sourceIdentityKey,
	type SourceIdentity,
} from "@/mapping/source-identity";
import type { AniBridgeEntries, AniBridgeTarget } from "@/mapping/types";

export type AniListCrosswalkMappings = Record<string, AniListId>;

export type ParsedAniBridgeData = {
	entries: AniBridgeEntries;
	aniListCrosswalks: AniListCrosswalkMappings;
};

export function parseAniBridgeEntries(payload: unknown): AniBridgeEntries {
	return parseAniBridgeData(payload).entries;
}

export function parseAniBridgeAniListCrosswalks(
	payload: unknown,
): AniListCrosswalkMappings {
	return parseAniBridgeData(payload).aniListCrosswalks;
}

export function parseAniBridgeData(payload: unknown): ParsedAniBridgeData {
	const entries: AniBridgeEntries = {};
	const aniListCrosswalks: AniListCrosswalkMappings = {};

	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return { entries, aniListCrosswalks };
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
		const aniListId = parseUniqueAniListTarget(rawDescriptorKeys);

		for (const sourceIdentity of sourceIdentities) {
			if (sourceIdentity.source === "anilist") {
				for (const target of targets) {
					addAniBridgeTarget(entries, sourceIdentity.id, target);
				}
			}

			if (sourceIdentity.source === "mal" && aniListId !== null) {
				aniListCrosswalks[sourceIdentityKey(sourceIdentity)] = aniListId;
			}
		}
	}

	return { entries, aniListCrosswalks };
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
		const existingSeason = "season" in existing ? existing.season : undefined;

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
