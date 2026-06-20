/** MyAnimeList browse surface adapter for seasonal, ranking, and search cards. */
// src/content/myanimelist/browse/adapter.ts

import { parseAniListMediaFormatLabel } from "@/anilist/types";
import {
	parseMyAnimeListIdOrNull,
	type MyAnimeListId,
} from "@/myanimelist/types";
import type { BrowseAdapter, HostMediaTarget } from "@/content/browse/types";

const SEASONAL_CARD_SELECTOR = ".seasonal-anime.js-seasonal-anime";
const RANKING_ROW_SELECTOR = "tr.ranking-list";
const SEARCH_ROW_SELECTOR = ".js-block-list.list > table > tbody > tr";
const ADVANCED_SEARCH_ANCHOR_SELECTOR =
	"#advancedSearchResultList > div > div > a";
const ANIME_LINK_SELECTOR = "a[href*='/anime/']";

const CARD_SELECTOR = [
	SEASONAL_CARD_SELECTOR,
	RANKING_ROW_SELECTOR,
	SEARCH_ROW_SELECTOR,
	ADVANCED_SEARCH_ANCHOR_SELECTOR,
].join(",");

function normalizeAnimeHref(value: string | null | undefined): string {
	return (value ?? "").replace(/\/video(?:[/?#].*)?$/i, "");
}

export function readMyAnimeListIdFromHref(
	value: string | null | undefined,
): MyAnimeListId | null {
	const href = normalizeAnimeHref(value);
	const match = /\/anime\/(\d+)(?:\/|$)/.exec(href);
	return parseMyAnimeListIdOrNull(Number(match?.[1]));
}

function cleanText(value: string | null | undefined): string | null {
	const cleaned = value?.replaceAll(/\s+/g, " ").trim() ?? "";
	return cleaned || null;
}

function ownAnimeLink(card: Element): HTMLAnchorElement | null {
	return card.getAttribute("href")?.includes("/anime/") === true
		? (card as HTMLAnchorElement)
		: null;
}

function parseFormat(card: Element) {
	const raw = cleanText(
		card.querySelector<HTMLElement>(".info .item")?.textContent ??
			card.querySelector<HTMLElement>(".information")?.textContent,
	);
	const normalized = raw?.replace(/\s*\(.*/, "");
	return parseAniListMediaFormatLabel(normalized || raw);
}

function parseFromLink(input: {
	card: Element;
	link: HTMLAnchorElement | null;
}): HostMediaTarget | null {
	const { card, link } = input;
	if (!link) return null;

	const malId = readMyAnimeListIdFromHref(link.getAttribute("href"));
	if (malId === null) return null;

	const title =
		cleanText(link.textContent) ??
		cleanText(link.getAttribute("title")) ??
		cleanText(
			card.querySelector<HTMLImageElement>("img")?.alt ??
				card.querySelector<HTMLImageElement>("img")?.getAttribute("alt"),
		);
	if (title === null) return null;

	return {
		source: { source: "mal", id: malId },
		title,
		format: parseFormat(card),
		mountTarget: link as HTMLElement,
	};
}

function parseSeasonalCard(card: Element): HostMediaTarget | null {
	return parseFromLink({
		card,
		link: card.querySelector<HTMLAnchorElement>(".title h2 a"),
	});
}

function parseRankingRow(card: Element): HostMediaTarget | null {
	return parseFromLink({
		card,
		link:
			card.querySelector<HTMLAnchorElement>("a.hoverinfo_trigger") ??
			card.querySelector<HTMLAnchorElement>(ANIME_LINK_SELECTOR),
	});
}

function parseSearchRow(card: Element): HostMediaTarget | null {
	return parseFromLink({
		card,
		link: card.querySelector<HTMLAnchorElement>(ANIME_LINK_SELECTOR),
	});
}

function parseAdvancedSearchAnchor(card: Element): HostMediaTarget | null {
	return parseFromLink({
		card,
		link: ownAnimeLink(card),
	});
}

export function parseMyAnimeListBrowseCard(
	card: Element,
): HostMediaTarget | null {
	return (
		parseSeasonalCard(card) ??
		parseRankingRow(card) ??
		parseSearchRow(card) ??
		parseAdvancedSearchAnchor(card)
	);
}

export const myAnimeListBrowseAdapter: BrowseAdapter = {
	cardSelector: CARD_SELECTOR,
	parseCard: parseMyAnimeListBrowseCard,
	getObserverRoot: () => document.body ?? document.documentElement,
	getScanRoot: () => document.body ?? null,
	anchorCorner: "top-left",
	stackDirection: "down",
};
