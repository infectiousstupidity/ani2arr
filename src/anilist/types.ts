/** Plain AniList domain types and small guards with no runtime schema library. */
// src/anilist/types.ts

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

export const ANILIST_MEDIA_FORMATS = [
	"TV",
	"TV_SHORT",
	"MOVIE",
	"SPECIAL",
	"OVA",
	"ONA",
	"MUSIC",
	"MANGA",
	"NOVEL",
	"ONE_SHOT",
] as const;

export type AniListMediaFormat = (typeof ANILIST_MEDIA_FORMATS)[number];

const ANILIST_MEDIA_FORMAT_SET = new Set<string>(ANILIST_MEDIA_FORMATS);

export const parseAniListMediaFormat = (
	value: unknown,
): AniListMediaFormat | null => {
	if (typeof value !== "string") return null;

	const normalized = value.trim().toUpperCase();
	return ANILIST_MEDIA_FORMAT_SET.has(normalized)
		? (normalized as AniListMediaFormat)
		: null;
};

const normalizeMediaFormatLabel = (value: string): string =>
	value
		.toLowerCase()
		.replaceAll(/\s+/g, " ")
		.replaceAll(/\s*\/\s*/g, " / ")
		.trim();

export const parseAniListMediaFormatLabel = (
	label: string | null | undefined,
): AniListMediaFormat | null => {
	const normalized = normalizeMediaFormatLabel(label ?? "");
	switch (normalized) {
		case "tv":
		case "tv show": {
			return "TV";
		}
		case "tv short":
		case "tv shorts": {
			return "TV_SHORT";
		}
		case "movie":
		case "movies": {
			return "MOVIE";
		}
		case "music": {
			return "MUSIC";
		}
		case "ova": {
			return "OVA";
		}
		case "ona": {
			return "ONA";
		}
		case "special":
		case "specials":
		case "ova / ona / special": {
			return "SPECIAL";
		}
		default: {
			return null;
		}
	}
};

export interface AniListTitles {
	romaji?: string | undefined;
	english?: string | undefined;
	native?: string | undefined;
}

export interface AniListMedia {
	id: AniListId;
	format: AniListMediaFormat | null;
	title: AniListTitles;
	startDate?: { year?: number | null | undefined } | undefined;
	synonyms: string[];
	relations?: {
		edges: Array<{
			relationType: string;
			node: {
				id: AniListId;
				format?: AniListMediaFormat | null | undefined;
				title?: AniListTitles | undefined;
				startDate?: { year?: number | null | undefined } | undefined;
				synonyms?: string[] | undefined;
			};
		}>;
	} | undefined;
	bannerImage?: string | null | undefined;
	coverImage?: {
		extraLarge?: string | null | undefined;
		large?: string | null | undefined;
		medium?: string | null | undefined;
		color?: string | null | undefined;
	} | null | undefined;
	seasonYear?: number | null | undefined;
}

export interface AniListMediaHint {
	titles?: AniListTitles | null | undefined;
	synonyms?: string[] | null | undefined;
	startYear?: number | null | undefined;
	format?: AniListMediaFormat | null | undefined;
	relationPrequelIds?: number[] | null | undefined;
	coverImage?: string | null | undefined;
}

export interface AniListMetadata {
	id: AniListId;
	titles: AniListTitles;
	seasonYear?: number | null | undefined;
	format?: AniListMediaFormat | null | undefined;
	coverImage?: {
		medium?: string | null | undefined;
		large?: string | null | undefined;
	} | null | undefined;
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

	constructor(message: string, options?: { status?: number; retryAfterMs?: number }) {
		super(message);
		this.name = "AniListError";
		if (options?.status !== undefined) this.status = options.status;
		if (options?.retryAfterMs !== undefined) {
			this.retryAfterMs = options.retryAfterMs;
		}
	}
}
