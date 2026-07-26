/** Jikan anime client and defensive response normalization. */

import {
	parseAniListMediaFormatLabel,
	type AniListMediaFormat,
	type AniListTitles,
} from "@/anilist/types";
import {
	isMyAnimeListId,
	type MyAnimeListId,
	type MyAnimeListMetadata,
} from "@/myanimelist/types";

const JIKAN_API_URL = "https://api.jikan.moe/v4";

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value !== null && typeof value === "object"
		? (value as Record<string, unknown>)
		: null;

const stringOrNull = (value: unknown): string | null => {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const positiveIntegerOrNull = (value: unknown): number | null =>
	typeof value === "number" && Number.isInteger(value) && value > 0
		? value
		: null;

const normalizeTitles = (anime: Record<string, unknown>): AniListTitles => {
	const titles: AniListTitles = {};
	const english = stringOrNull(anime.title_english);
	const romaji = stringOrNull(anime.title);
	const native = stringOrNull(anime.title_japanese);
	if (english) titles.english = english;
	if (romaji) titles.romaji = romaji;
	if (native) titles.native = native;
	return titles;
};

const normalizeSynonyms = (value: unknown): string[] =>
	Array.isArray(value)
		? [
				...new Set(
					value
						.map((item) => stringOrNull(item))
						.filter((item): item is string => item !== null),
				),
			]
		: [];

const normalizeFormat = (value: unknown): AniListMediaFormat | null => {
	const label = stringOrNull(value);
	if (!label) return null;

	const normalized = label.toLowerCase();
	if (["cm", "pv", "tv special"].includes(normalized)) return "SPECIAL";
	return parseAniListMediaFormatLabel(label);
};

const yearFromAiredStart = (value: unknown): number | null => {
	const from = stringOrNull(asRecord(value)?.from);
	if (!from) return null;

	const match = /^(\d{4})-/.exec(from);
	return match ? positiveIntegerOrNull(Number(match[1])) : null;
};

const normalizeYear = (anime: Record<string, unknown>): number | null =>
	positiveIntegerOrNull(anime.year) ?? yearFromAiredStart(anime.aired);

const imageUrl = (
	images: Record<string, unknown> | null,
	field: "large_image_url" | "image_url" | "small_image_url",
): string | null => {
	const webp = stringOrNull(asRecord(images?.webp)?.[field]);
	return webp ?? stringOrNull(asRecord(images?.jpg)?.[field]);
};

const normalizeCoverImage = (
	value: unknown,
): MyAnimeListMetadata["coverImage"] => {
	const images = asRecord(value);
	if (!images) return null;

	const large = imageUrl(images, "large_image_url");
	const medium = imageUrl(images, "image_url");
	const small = imageUrl(images, "small_image_url");
	return large || medium || small ? { large, medium, small } : null;
};

export function parseJikanAnimeResponse(value: unknown): MyAnimeListMetadata {
	const anime = asRecord(asRecord(value)?.data);
	if (!anime || !isMyAnimeListId(anime.mal_id)) {
		throw new Error("Jikan response missing valid MAL anime data");
	}

	return {
		id: anime.mal_id,
		titles: normalizeTitles(anime),
		synonyms: normalizeSynonyms(anime.title_synonyms),
		format: normalizeFormat(anime.type),
		year: normalizeYear(anime),
		episodes: positiveIntegerOrNull(anime.episodes),
		status: stringOrNull(anime.status),
		synopsis: stringOrNull(anime.synopsis),
		coverImage: normalizeCoverImage(anime.images),
		bannerImage: null,
	};
}

export async function fetchMyAnimeListMetadata(
	malId: MyAnimeListId,
): Promise<MyAnimeListMetadata> {
	const response = await fetch(`${JIKAN_API_URL}/anime/${malId}`, {
		headers: { Accept: "application/json" },
	});
	if (!response.ok) {
		throw new Error(`Jikan API error: ${response.status}`);
	}

	return parseJikanAnimeResponse(await response.json());
}
