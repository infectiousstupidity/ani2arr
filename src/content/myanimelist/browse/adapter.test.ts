/** Focused placement and identity tests for MyAnimeList browse cards. */

import { describe, expect, it } from "vitest";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseMyAnimeListBrowseCard } from "./adapter";

const ANIME_LINK_SELECTOR = "a[href*='/anime/']";
const AUTOCOMPLETE_SELECTOR = "#advancedSearchResultList > div > div > a";

type FakeElement = {
	tagName: string;
	textContent: string | null;
	parentElement: FakeElement | null;
	getAttribute: (name: string) => string | null;
	matches: (selector: string) => boolean;
	querySelector: (selector: string) => FakeElement | null;
	querySelectorAll: (selector: string) => FakeElement[];
};

function fakeElement(
	input: {
		tagName?: string;
		textContent?: string;
		attributes?: Record<string, string>;
		matches?: string;
		parentElement?: FakeElement;
		children?: Record<string, FakeElement | null>;
		childLists?: Record<string, FakeElement[]>;
	} = {},
): FakeElement {
	return {
		tagName: input.tagName ?? "DIV",
		textContent: input.textContent ?? null,
		parentElement: input.parentElement ?? null,
		getAttribute: (name) => input.attributes?.[name] ?? null,
		matches: (selector) => selector === input.matches,
		querySelector: (selector) => input.children?.[selector] ?? null,
		querySelectorAll: (selector) => input.childLists?.[selector] ?? [],
	};
}

function animeLink(input: {
	id: number;
	title?: string;
	imageAlt?: string;
}): FakeElement {
	const image = input.imageAlt
		? fakeElement({ tagName: "IMG", attributes: { alt: input.imageAlt } })
		: null;
	return fakeElement({
		tagName: "A",
		textContent: input.title ?? "",
		attributes: { href: `/anime/${input.id}/title` },
		children: { img: image },
	});
}

describe("parseMyAnimeListBrowseCard", () => {
	it("mounts a ranking row in its Status cell", () => {
		const posterLink = animeLink({ id: 52_991, imageAlt: "Sousou no Frieren" });
		const titleLink = animeLink({ id: 52_991, title: "Sousou no Frieren" });
		const statusCell = fakeElement({ tagName: "TD" });
		const card = fakeElement({
			matches: "tr.ranking-list",
			children: {
				".anime_ranking_h3 a": titleLink,
				"td.status": statusCell,
			},
			childLists: { [ANIME_LINK_SELECTOR]: [posterLink, titleLink] },
		}) as unknown as Element;

		const parsed = parseMyAnimeListBrowseCard(card);

		expect(parsed).toMatchObject({
			source: { source: "mal", id: parseMyAnimeListId(52_991) },
			title: "Sousou no Frieren",
			presentation: "status-column",
		});
		expect(parsed?.mountTarget).toBe(statusCell);
		expect(
			parseMyAnimeListBrowseCard(
				fakeElement({
					matches: "tr.ranking-list",
					children: { ".anime_ranking_h3 a": titleLink },
					childLists: { [ANIME_LINK_SELECTOR]: [posterLink, titleLink] },
				}) as unknown as Element,
			),
		).toBeNull();
	});

	it("mounts a seasonal card action row on the whole card", () => {
		const posterLink = animeLink({ id: 457, imageAlt: "Mushishi" });
		const titleLink = animeLink({ id: 457, title: "Mushishi" });
		const seasonalList = fakeElement({
			children: {
				".anime-header": fakeElement({ textContent: "TV (New)" }),
			},
		});
		const card = fakeElement({
			matches: ".seasonal-anime.js-seasonal-anime",
			parentElement: seasonalList,
			children: { ".title h2 a": titleLink },
			childLists: { [ANIME_LINK_SELECTOR]: [posterLink, titleLink] },
		}) as unknown as Element;

		const parsed = parseMyAnimeListBrowseCard(card);

		expect(parsed?.mountTarget).toBe(card);
		expect(parsed?.presentation).toBe("action-row");
		expect(parsed?.format).toBe("TV");
	});

	it("uses only an image-bearing autocomplete anchor", () => {
		const posterLink = animeLink({ id: 457, imageAlt: "Mushishi" });
		const card = {
			...posterLink,
			matches: (selector: string) => selector === AUTOCOMPLETE_SELECTOR,
		} as unknown as Element;

		const parsed = parseMyAnimeListBrowseCard(card);

		expect(parsed).toMatchObject({
			source: { source: "mal", id: parseMyAnimeListId(457) },
			title: "Mushishi",
		});
		expect(parsed?.mountTarget).toBe(card);
		expect(
			parseMyAnimeListBrowseCard({
				...animeLink({ id: 457 }),
				matches: (selector: string) => selector === AUTOCOMPLETE_SELECTOR,
			} as unknown as Element),
		).toBeNull();
	});

	it.each([
		{
			name: "a non-anime result",
			card: fakeElement({ matches: "#anime + article > .list" }),
		},
		{
			name: "an anime link without a poster",
			card: fakeElement({
				matches: "#anime + article > .list",
				childLists: { [ANIME_LINK_SELECTOR]: [animeLink({ id: 1 })] },
			}),
		},
		{
			name: "different poster and title IDs",
			card: fakeElement({
				matches: ".seasonal-anime.js-seasonal-anime",
				children: { ".title h2 a": animeLink({ id: 2, title: "Wrong" }) },
				childLists: {
					[ANIME_LINK_SELECTOR]: [animeLink({ id: 1, imageAlt: "Correct" })],
				},
			}),
		},
	])("rejects $name", ({ card }) => {
		expect(parseMyAnimeListBrowseCard(card as unknown as Element)).toBeNull();
	});
});
