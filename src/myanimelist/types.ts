/** MyAnimeList domain identifiers and strict parser helpers. */
// src/myanimelist/types.ts

import type { Brand } from "@/shared/types/brand";
import type {
	AniListMediaFormat,
	AniListMediaHint,
	AniListTitles,
} from "@/anilist/types";

export type MyAnimeListId = Brand<number, "MyAnimeListId">;

export const isMyAnimeListId = (value: unknown): value is MyAnimeListId =>
	typeof value === "number" &&
	Number.isFinite(value) &&
	Number.isInteger(value) &&
	value > 0;

export function parseMyAnimeListId(value: unknown): MyAnimeListId {
	if (!isMyAnimeListId(value)) {
		throw new Error("Invalid MyAnimeList ID");
	}
	return value;
}

export const parseMyAnimeListIdOrNull = (
	value: unknown,
): MyAnimeListId | null => (isMyAnimeListId(value) ? value : null);

export interface MyAnimeListMetadata {
	id: MyAnimeListId;
	titles: AniListTitles;
	synonyms: string[];
	format: AniListMediaFormat | null;
	year: number | null;
	episodes: number | null;
	status: string | null;
	synopsis: string | null;
	coverImage: {
		large: string | null;
		medium: string | null;
		small: string | null;
	} | null;
	bannerImage: null;
}

export function metadataHintFromMyAnimeListMetadata(
	metadata?: MyAnimeListMetadata | null,
): AniListMediaHint | null {
	if (!metadata) return null;

	return {
		titles:
			Object.keys(metadata.titles).length > 0 ? metadata.titles : null,
		synonyms: metadata.synonyms.length > 0 ? metadata.synonyms : null,
		startYear: metadata.year,
		format: metadata.format,
		relationPrequelIds: null,
		coverImage:
			metadata.coverImage?.large ?? metadata.coverImage?.medium ?? null,
	};
}
