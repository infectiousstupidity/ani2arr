/** Focused placement and identity tests for MyAnimeList browse cards. */

import { describe, expect, it } from "vitest";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseMyAnimeListBrowseCard } from "./adapter";

const ANIME_LINK_SELECTOR = "a[href*='/anime/']";
const AUTOCOMPLETE_SELECTOR = "#advancedSearchResultList > div > div > a";

type FakeElement = {
	tagName: string;
	textContent: string | null;
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
		children?: Record<string, FakeElement | null>;
		childLists?: Record<string, FakeElement[]>;
	} = {},
): FakeElement {
	return {
		tagName: input.tagName ?? "DIV",
		textContent: input.textContent ?? null,
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

const surfaceCases = [
	{
		name: "seasonal card",
		surfaceSelector: ".seasonal-anime.js-seasonal-anime",
		titleSelector: ".title h2 a",
	},
	{
		name: "ranking row",
		surfaceSelector: "tr.ranking-list",
		titleSelector: ".anime_ranking_h3 a",
	},
	{
		name: "general search card",
		surfaceSelector: "#anime + article > .list",
		titleSelector: ".information .title > a",
	},
	{
		name: "anime search row",
		surfaceSelector: ".js-block-list.list > table > tbody > tr",
		titleSelector: ".title a.hoverinfo_trigger",
	},
] as const;

describe("parseMyAnimeListBrowseCard", () => {
	it.each(surfaceCases)("mounts a $name on its poster", (surface) => {
		const posterLink = animeLink({ id: 52_991, imageAlt: "Sousou no Frieren" });
		const titleLink = animeLink({ id: 52_991, title: "Sousou no Frieren" });
		const card = fakeElement({
			matches: surface.surfaceSelector,
			children: { [surface.titleSelector]: titleLink },
			childLists: { [ANIME_LINK_SELECTOR]: [posterLink, titleLink] },
		}) as unknown as Element;

		const parsed = parseMyAnimeListBrowseCard(card);

		expect(parsed).toMatchObject({
			source: { source: "mal", id: parseMyAnimeListId(52_991) },
			title: "Sousou no Frieren",
		});
		expect(parsed?.mountTarget).toBe(posterLink);
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
