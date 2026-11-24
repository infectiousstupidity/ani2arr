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

/** Returns the full-size poster for a MAL CDN image URL, dropping the resize prefix and signature. */
export function toMyAnimeListPosterUrl(
	value: string | null | undefined,
): string | null {
	if (!value) return null;

	const url = URL.canParse(value) ? new URL(value) : null;
	if (url?.hostname !== "cdn.myanimelist.net") return null;

	url.pathname = url.pathname.replace(/^\/r\/\d+x\d+(?=\/images\/)/, "");
	url.search = "";
	return url.pathname.startsWith("/images/") ? url.href : null;
}

function stripMyAnimeListVideoSuffix(value: string): string {
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
