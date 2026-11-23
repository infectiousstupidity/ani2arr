/** MyAnimeList URL and href parsers for anime identity extraction. */
// src/myanimelist/url.ts

import {
	parseMyAnimeListIdOrNull,
	type MyAnimeListId,
} from "@/myanimelist/types";

export function buildMyAnimeListAnimeUrl(id: MyAnimeListId): string {
	return `https://myanimelist.net/anime/${id}`;
}

function parseUrl(value: string): URL | null {
	try {
		return new URL(value, "https://myanimelist.net");
	} catch {
		return null;
	}
}

export function stripMyAnimeListVideoSuffix(value: string): string {
	return value.replace(/\/video(?:[/?#].*)?$/i, "");
}

export function readMyAnimeListIdFromUrl(
	value: string | null | undefined,
): MyAnimeListId | null {
	if (!value) return null;

	const url = parseUrl(stripMyAnimeListVideoSuffix(value));
	if (!url) return null;

	const pathMatch = /^\/anime\/(\d+)(?:\/|$)/.exec(url.pathname);
	const rawId =
		pathMatch?.[1] ??
		(url.pathname === "/anime.php" ? url.searchParams.get("id") : null);

	return parseMyAnimeListIdOrNull(rawId === null ? null : Number(rawId));
}
