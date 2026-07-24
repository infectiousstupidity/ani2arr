/** MyAnimeList browse surface adapter for seasonal, ranking, and search cards. */
// src/content/myanimelist/browse/adapter.ts

import { parseAniListMediaFormatLabel } from "@/anilist/types";
import { readMyAnimeListIdFromUrl } from "@/myanimelist/url";
import type { MyAnimeListId } from "@/myanimelist/types";
import {
	BROWSE_CREATED_ATTRIBUTE,
	type BrowseAdapter,
	type HostMediaTarget,
} from "@/content/browse/types";

const SEASONAL_CARD_SELECTOR = ".seasonal-anime.js-seasonal-anime";
const RANKING_ROW_SELECTOR = "tr.ranking-list";
const GENERAL_SEARCH_CARD_SELECTOR = "#anime + article > .list";
const ANIME_SEARCH_TABLE_SELECTOR = ".js-block-list.list > table";
const ANIME_SEARCH_ROW_SELECTOR = ".js-block-list.list > table > tbody > tr";
const AUTOCOMPLETE_ANCHOR_SELECTOR =
	"#advancedSearchResultList > div > div > a";
const ANIME_LINK_SELECTOR = "a[href*='/anime/']";
const RANKING_STATUS_SELECTOR = "td.status";
const ANIME_SEARCH_HEADER_CLASS = "a2a-anime-search-header";
const ANIME_SEARCH_ACTION_CELL_CLASS = "a2a-anime-search-action-cell";

const CARD_SELECTOR = [
	SEASONAL_CARD_SELECTOR,
	RANKING_ROW_SELECTOR,
	GENERAL_SEARCH_CARD_SELECTOR,
	ANIME_SEARCH_ROW_SELECTOR,
	AUTOCOMPLETE_ANCHOR_SELECTOR,
].join(",");

interface AnimeLink {
	link: HTMLAnchorElement;
	malId: MyAnimeListId;
}

function cleanText(value: string | null | undefined): string | null {
	const cleaned = value?.replaceAll(/\s+/g, " ").trim() ?? "";
	return cleaned || null;
}

function parseAnimeLink(element: Element | null): AnimeLink | null {
	if (!element || element.tagName.toLowerCase() !== "a") return null;

	const href = element.getAttribute("href");
	if (!href) return null;

	try {
		const url = new URL(href, "https://myanimelist.net");
		if (
			url.hostname !== "myanimelist.net" ||
			!/^\/anime\/\d+(?:\/|$)/.test(url.pathname)
		) {
			return null;
		}
	} catch {
		return null;
	}

	const malId = readMyAnimeListIdFromUrl(href);
	return malId === null ? null : { link: element as HTMLAnchorElement, malId };
}

function findPosterLink(card: Element): HTMLAnchorElement | null {
	for (const candidate of card.querySelectorAll(ANIME_LINK_SELECTOR)) {
		const parsed = parseAnimeLink(candidate);
		if (parsed?.link.querySelector("img")) return parsed.link;
	}
	return null;
}

function parseFormat(card: Element) {
	const raw = cleanText(
		card.querySelector<HTMLElement>(".info .item")?.textContent ??
			card.querySelector<HTMLElement>(".information")?.textContent,
	);
	const normalized = raw?.replace(/\s*\(.*/, "");
	return parseAniListMediaFormatLabel(normalized || raw);
}

function parseSeasonalFormat(card: Element) {
	const raw = cleanText(
		card.parentElement?.querySelector<HTMLElement>(".anime-header")
			?.textContent,
	);
	return parseAniListMediaFormatLabel(raw?.replace(/\s*\(.*/, "") ?? raw);
}

function parseFromLinks(input: {
	card: Element;
	posterLink: HTMLAnchorElement | null;
	titleLink: HTMLAnchorElement | null;
}): HostMediaTarget | null {
	const { card, posterLink, titleLink } = input;
	const poster = parseAnimeLink(posterLink);
	const posterImage = poster?.link.querySelector<HTMLImageElement>("img");
	if (!poster || !posterImage) return null;

	const titleAnimeLink = titleLink ? parseAnimeLink(titleLink) : null;
	if (titleLink && (!titleAnimeLink || titleAnimeLink.malId !== poster.malId)) {
		return null;
	}

	const title =
		cleanText(titleAnimeLink?.link.textContent) ??
		cleanText(titleAnimeLink?.link.getAttribute("title")) ??
		cleanText(posterImage.getAttribute("alt"));
	if (title === null) return null;

	return {
		source: { source: "mal", id: poster.malId },
		title,
		format: parseFormat(card),
		mountTarget: poster.link,
	};
}

function parseSeasonalCard(card: Element): HostMediaTarget | null {
	const parsed = parseFromLinks({
		card,
		posterLink: findPosterLink(card),
		titleLink: card.querySelector<HTMLAnchorElement>(".title h2 a"),
	});
	if (!parsed) return null;

	return {
		...parsed,
		format: parseSeasonalFormat(card),
		mountTarget: card as HTMLElement,
		presentation: "action-row",
	};
}

function parseRankingRow(card: Element): HostMediaTarget | null {
	const parsed = parseFromLinks({
		card,
		posterLink: findPosterLink(card),
		titleLink: card.querySelector<HTMLAnchorElement>(".anime_ranking_h3 a"),
	});
	const statusCell = card.querySelector<HTMLElement>(RANKING_STATUS_SELECTOR);
	if (!parsed || !statusCell) return null;

	return {
		...parsed,
		mountTarget: statusCell,
		presentation: "status-column",
	};
}

function parseGeneralSearchCard(card: Element): HostMediaTarget | null {
	return parseFromLinks({
		card,
		posterLink: findPosterLink(card),
		titleLink: card.querySelector<HTMLAnchorElement>(".information .title > a"),
	});
}

function ensureAnimeSearchHeader(table: HTMLTableElement): void {
	const headerRow = table.tBodies.item(0)?.rows.item(0);
	const titleCell = headerRow?.cells.item(1);
	if (!headerRow || !titleCell) return;
	if (headerRow.querySelector(`.${ANIME_SEARCH_HEADER_CLASS}`)) return;

	const headerCell = table.ownerDocument.createElement("td");
	headerCell.className = titleCell.className;
	headerCell.classList.add(ANIME_SEARCH_HEADER_CLASS);
	headerCell.setAttribute(BROWSE_CREATED_ATTRIBUTE, "true");
	headerCell.textContent = "ani2arr";
	titleCell.after(headerCell);
}

function ensureAnimeSearchActionCell(input: {
	row: HTMLTableRowElement;
	titleCell: HTMLTableCellElement;
}): HTMLTableCellElement {
	const existing = input.row.querySelector<HTMLTableCellElement>(
		`:scope > td.${ANIME_SEARCH_ACTION_CELL_CLASS}`,
	);
	if (existing) return existing;

	const actionCell = input.row.ownerDocument.createElement("td");
	actionCell.className = input.titleCell.className;
	actionCell.classList.add(ANIME_SEARCH_ACTION_CELL_CLASS);
	actionCell.setAttribute(BROWSE_CREATED_ATTRIBUTE, "true");
	input.titleCell.after(actionCell);
	return actionCell;
}

function parseAnimeSearchFormat(titleCell: HTMLTableCellElement) {
	const nextCell = titleCell.nextElementSibling;
	const typeCell = nextCell?.classList.contains(ANIME_SEARCH_ACTION_CELL_CLASS)
		? nextCell.nextElementSibling
		: nextCell;
	return parseAniListMediaFormatLabel(cleanText(typeCell?.textContent));
}

function parseAnimeSearchRow(card: Element): HostMediaTarget | null {
	const table = card.closest<HTMLTableElement>(ANIME_SEARCH_TABLE_SELECTOR);
	if (!table) return null;
	ensureAnimeSearchHeader(table);
	const row = card as HTMLTableRowElement;

	const titleLink = card.querySelector<HTMLAnchorElement>(
		".title a.hoverinfo_trigger",
	);
	const parsed = parseFromLinks({
		card,
		posterLink: findPosterLink(card),
		titleLink,
	});
	const titleCell = titleLink?.closest<HTMLTableCellElement>("td");
	if (!parsed || !titleCell || titleCell.parentElement !== card) return null;
	const format = parseAnimeSearchFormat(titleCell);
	const mountTarget = ensureAnimeSearchActionCell({
		row,
		titleCell,
	});
	if (format === "MUSIC") return null;

	return {
		...parsed,
		format,
		mountTarget,
		presentation: "status-column",
	};
}

function parseAutocompleteAnchor(card: Element): HostMediaTarget | null {
	const ownLink = parseAnimeLink(card)?.link ?? null;
	return parseFromLinks({
		card,
		posterLink: ownLink,
		titleLink: null,
	});
}

export function parseMyAnimeListBrowseCard(
	card: Element,
): HostMediaTarget | null {
	if (card.matches(SEASONAL_CARD_SELECTOR)) return parseSeasonalCard(card);
	if (card.matches(RANKING_ROW_SELECTOR)) return parseRankingRow(card);
	if (card.matches(GENERAL_SEARCH_CARD_SELECTOR)) {
		return parseGeneralSearchCard(card);
	}
	if (card.matches(ANIME_SEARCH_ROW_SELECTOR)) return parseAnimeSearchRow(card);
	if (card.matches(AUTOCOMPLETE_ANCHOR_SELECTOR)) {
		return parseAutocompleteAnchor(card);
	}
	return null;
}

export const myAnimeListBrowseAdapter: BrowseAdapter = {
	cardSelector: CARD_SELECTOR,
	parseCard: parseMyAnimeListBrowseCard,
	getObserverRoot: () => document.body ?? document.documentElement,
	getScanRoot: () => document.body ?? null,
	anchorCorner: "top-left",
	stackDirection: "down",
};
