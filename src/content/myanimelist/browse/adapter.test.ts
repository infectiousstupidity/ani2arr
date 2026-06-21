/** Tests for MyAnimeList browse card parsing. */
// src/content/myanimelist/browse/adapter.test.ts

import { describe, expect, it } from "vitest";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseMyAnimeListBrowseCard } from "./adapter";

type FakeElement = {
	textContent?: string | null;
	getAttribute: (name: string) => string | null;
	querySelector: (selector: string) => FakeElement | null;
};

function fakeElement(input: {
	textContent?: string;
	attributes?: Record<string, string>;
	children?: Record<string, FakeElement | null>;
} = {}): FakeElement {
	return {
		textContent: input.textContent ?? null,
		getAttribute: (name) => input.attributes?.[name] ?? null,
		querySelector: (selector) => input.children?.[selector] ?? null,
	};
}

describe("parseMyAnimeListBrowseCard", () => {
	it("parses seasonal cards", () => {
		const link = fakeElement({
			textContent: "Fullmetal Alchemist: Brotherhood",
			attributes: { href: "/anime/5114/Fullmetal_Alchemist__Brotherhood" },
		});
		const card = fakeElement({
			children: {
				".title h2 a": link,
				".info .item": fakeElement({ textContent: "TV" }),
			},
		}) as unknown as Element;

		expect(parseMyAnimeListBrowseCard(card)).toMatchObject({
			source: { source: "mal", id: parseMyAnimeListId(5114) },
			title: "Fullmetal Alchemist: Brotherhood",
			format: "TV",
		});
	});

	it("parses ranking rows", () => {
		const link = fakeElement({
			textContent: "Cowboy Bebop",
			attributes: { href: "/anime/1/Cowboy_Bebop" },
		});
		const card = fakeElement({
			children: {
				"a[href*='/anime/']": link,
				".information": fakeElement({ textContent: "TV (26 eps)" }),
			},
		}) as unknown as Element;

		expect(parseMyAnimeListBrowseCard(card)).toMatchObject({
			source: { source: "mal", id: parseMyAnimeListId(1) },
			title: "Cowboy Bebop",
			format: "TV",
		});
	});

	it("strips video suffixes from anime card links", () => {
		const link = fakeElement({
			textContent: "Fullmetal Alchemist: Brotherhood",
			attributes: {
				href: "/anime/5114/Fullmetal_Alchemist__Brotherhood/video",
			},
		});
		const card = fakeElement({
			children: {
				"a[href*='/anime/']": link,
			},
		}) as unknown as Element;

		expect(parseMyAnimeListBrowseCard(card)).toMatchObject({
			source: { source: "mal", id: parseMyAnimeListId(5114) },
			title: "Fullmetal Alchemist: Brotherhood",
		});
	});

	it("parses search list rows", () => {
		const link = fakeElement({
			textContent: "Frieren: Beyond Journey's End",
			attributes: { href: "/anime/52991/Sousou_no_Frieren" },
		});
		const card = fakeElement({
			children: {
				"a[href*='/anime/']": link,
				".information": fakeElement({ textContent: "TV (28 eps)" }),
			},
		}) as unknown as Element;

		expect(parseMyAnimeListBrowseCard(card)).toMatchObject({
			source: { source: "mal", id: parseMyAnimeListId(52_991) },
			title: "Frieren: Beyond Journey's End",
			format: "TV",
		});
	});

	it("parses advanced search anchors", () => {
		const card = fakeElement({
			textContent: "Mushishi",
			attributes: { href: "/anime/457/Mushishi" },
		}) as unknown as Element;

		expect(parseMyAnimeListBrowseCard(card)).toMatchObject({
			source: { source: "mal", id: parseMyAnimeListId(457) },
			title: "Mushishi",
			format: null,
		});
	});

	it("falls back to image alt text when link text is empty", () => {
		const link = fakeElement({
			textContent: " ",
			attributes: { href: "/anime/16498/Shingeki_no_Kyojin" },
		});
		const card = fakeElement({
			children: {
				"a[href*='/anime/']": link,
				img: fakeElement({
					attributes: { alt: "Attack on Titan" },
				}),
			},
		}) as unknown as Element;

		expect(parseMyAnimeListBrowseCard(card)).toMatchObject({
			source: { source: "mal", id: parseMyAnimeListId(16_498) },
			title: "Attack on Titan",
		});
	});

	it("returns null for invalid cards", () => {
		expect(parseMyAnimeListBrowseCard(fakeElement() as unknown as Element)).toBeNull();
	});
});
