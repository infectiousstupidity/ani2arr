/** Source-neutral anime formats normalized by supported content adapters. */

export const ANIME_FORMATS = [
	"TV",
	"TV_SHORT",
	"MOVIE",
	"SPECIAL",
	"OVA",
	"ONA",
	"MUSIC",
] as const;

export type AnimeFormat = (typeof ANIME_FORMATS)[number];

const ANIME_FORMAT_SET = new Set<string>(ANIME_FORMATS);

export const parseAnimeFormat = (value: unknown): AnimeFormat | null => {
	if (typeof value !== "string") return null;

	const normalized = value.trim().toUpperCase();
	return ANIME_FORMAT_SET.has(normalized) ? (normalized as AnimeFormat) : null;
};

const normalizeAnimeFormatLabel = (value: string): string =>
	value
		.toLowerCase()
		.replaceAll(/\s+/g, " ")
		.replaceAll(/\s*\/\s*/g, " / ")
		.trim();

export const parseAnimeFormatLabel = (
	label: string | null | undefined,
): AnimeFormat | null => {
	switch (normalizeAnimeFormatLabel(label ?? "")) {
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
