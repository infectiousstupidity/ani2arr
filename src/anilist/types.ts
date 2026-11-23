/** Plain AniList domain types and small guards with no runtime schema library. */
// src/anilist/types.ts

import type { AnimeFormat } from "@/shared/types/anime-format";

export type AniListId = number & { readonly __brand: "AniListId" };

export const isAniListId = (value: unknown): value is AniListId =>
	typeof value === "number" &&
	Number.isFinite(value) &&
	Number.isInteger(value) &&
	value > 0;

export function parseAniListId(value: unknown): AniListId {
	if (!isAniListId(value)) {
		throw new Error("Invalid AniList ID");
	}
	return value;
}

export const parseAniListIdOrNull = (value: unknown): AniListId | null =>
	isAniListId(value) ? value : null;

export interface AniListTitles {
	romaji?: string | undefined;
	english?: string | undefined;
	native?: string | undefined;
}

export interface AniListMedia {
	id: AniListId;
	format: AnimeFormat | null;
	title: AniListTitles;
	startDate?: { year?: number | null | undefined } | undefined;
	synonyms: string[];
	relations?:
		| {
				edges: Array<{
					relationType: string;
					node: {
						id: AniListId;
						format?: AnimeFormat | null | undefined;
						title?: AniListTitles | undefined;
						startDate?: { year?: number | null | undefined } | undefined;
						synonyms?: string[] | undefined;
					};
				}>;
		  }
		| undefined;
	bannerImage?: string | null | undefined;
	coverImage?:
		| {
				extraLarge?: string | null | undefined;
				large?: string | null | undefined;
				medium?: string | null | undefined;
				color?: string | null | undefined;
		  }
		| null
		| undefined;
	seasonYear?: number | null | undefined;
}

export interface AniListMediaHint {
	titles?: AniListTitles | null | undefined;
	synonyms?: string[] | null | undefined;
	startYear?: number | null | undefined;
	format?: AnimeFormat | null | undefined;
	relationPrequelIds?: number[] | null | undefined;
	coverImage?: string | null | undefined;
}

export interface AniListMetadata {
	id: AniListId;
	titles: AniListTitles;
	seasonYear?: number | null | undefined;
	format?: AnimeFormat | null | undefined;
	coverImage?:
		| {
				medium?: string | null | undefined;
				large?: string | null | undefined;
		  }
		| null
		| undefined;
}

export interface AniListMetadataChunkRef {
	file: string;
	count: number;
}

export interface AniListMetadataBundle {
	generatedAt: number;
	entries?: AniListMetadata[] | undefined;
	chunks?: AniListMetadataChunkRef[] | undefined;
}

export class AniListError extends Error {
	public readonly status?: number;
	public readonly retryAfterMs?: number;

	constructor(
		message: string,
		options?: { status?: number; retryAfterMs?: number },
	) {
		super(message);
		this.name = "AniListError";
		if (options?.status !== undefined) this.status = options.status;
		if (options?.retryAfterMs !== undefined) {
			this.retryAfterMs = options.retryAfterMs;
		}
	}
}
