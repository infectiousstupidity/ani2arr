/** Source identity helpers for AniList and MyAnimeList mapping keys. */
// src/mapping/source-identity.ts

import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import {
	parseMyAnimeListIdOrNull,
	type MyAnimeListId,
} from "@/myanimelist/types";

export type SourceIdentity =
	{ source: "anilist"; id: AniListId } | { source: "mal"; id: MyAnimeListId };

const SOURCE_IDENTITY_KEY_PATTERN = /^(anilist|mal):([1-9]\d*)$/;

export function sourceIdentityKey(identity: SourceIdentity): string {
	return `${identity.source}:${identity.id}`;
}

export function parseSourceIdentityKey(value: unknown): SourceIdentity | null {
	if (typeof value !== "string") return null;

	const match = SOURCE_IDENTITY_KEY_PATTERN.exec(value);
	if (!match) return null;

	const [, source, rawId] = match;
	const numericId = Number(rawId);

	if (source === "anilist") {
		const id = parseAniListIdOrNull(numericId);
		return id === null ? null : { source, id };
	}

	if (source === "mal") {
		const id = parseMyAnimeListIdOrNull(numericId);
		return id === null ? null : { source, id };
	}

	return null;
}

export function normalizeSourceIdentity(
	source: SourceIdentity | AniListId,
): SourceIdentity {
	if (typeof source === "number") {
		return { source: "anilist", id: source };
	}

	return source;
}

export function storageIdentity(
	identity: SourceIdentity,
	anilistId?: AniListId,
): SourceIdentity {
	return anilistId === undefined
		? identity
		: { source: "anilist", id: anilistId };
}
