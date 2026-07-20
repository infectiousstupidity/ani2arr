/** Source identity helpers for AniList and MyAnimeList mapping keys. */
// src/mapping/source-identity.ts

import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import {
	parseMyAnimeListIdOrNull,
	type MyAnimeListId,
} from "@/myanimelist/types";

export type SourceProvider = "anilist" | "mal";

export type SourceIdentity =
	| { source: "anilist"; id: AniListId }
	| { source: "mal"; id: MyAnimeListId };

const SOURCE_IDENTITY_KEY_PATTERN = /^(anilist|mal):([1-9]\d*)$/;

export function sourceIdentityKey(identity: SourceIdentity): string {
	return `${identity.source}:${identity.id}`;
}

export function parseSourceIdentityKey(
	value: unknown,
): SourceIdentity | null {
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

export function normalizeStoredSourceKey(rawKey: string): string | null {
	const source = parseSourceIdentityKey(rawKey);
	if (source !== null) return sourceIdentityKey(source);

	/** LEGACY: pre-MAL mapping stores used raw AniList ID object keys. */
	const anilistId = parseAniListIdOrNull(Number(rawKey));
	return anilistId === null
		? null
		: sourceIdentityKey({ source: "anilist", id: anilistId });
}
