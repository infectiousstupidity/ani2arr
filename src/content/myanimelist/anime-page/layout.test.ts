/** Tests for MyAnimeList anime detail page DOM readers. */
// src/content/myanimelist/anime-page/layout.test.ts

import { describe, expect, it } from "vitest";
import { parseMyAnimeListId } from "@/myanimelist/types";
import {
	readFormatFromPage,
	readImageFromPage,
	readLabeledFacts,
	readMyAnimeListIdFromUrl,
	readTitleFromPage,
} from "./layout";

type FakeElement = {
	textContent?: string | null;
	getAttribute?: (name: string) => string | null;
	querySelector: (selector: string) => FakeElement | null;
	querySelectorAll: (selector: string) => FakeElement[];
};

function createElement(input: {
	textContent?: string;
	attributes?: Record<string, string>;
	children?: Record<string, FakeElement | null>;
	lists?: Record<string, FakeElement[]>;
}): FakeElement {
	return {
		textContent: input.textContent ?? null,
		getAttribute: (name) => input.attributes?.[name] ?? null,
		querySelector: (selector) => input.children?.[selector] ?? null,
		querySelectorAll: (selector) => input.lists?.[selector] ?? [],
	};
}

function createDocument(input: {
	title?: string;
	image?: string;
	rows?: Array<{ label: string; value: string }>;
}): Document {
	const rows = (input.rows ?? []).map((row) =>
		createElement({
			textContent: `${row.label} ${row.value}`,
			children: {
				"span.dark_text": createElement({ textContent: row.label }),
			},
		}),
	);
	const leftside = createElement({
		lists: {
			".spaceit_pad": rows,
		},
	});
	const title =
		input.title === undefined
			? null
			: createElement({ textContent: input.title });
	const image =
		input.image === undefined
			? null
			: createElement({ attributes: { src: input.image } });

	return createElement({
		children: {
			"h1.title-name": title,
			'img[itemprop="image"]': image,
			"#content .leftside, .leftside": leftside,
		},
	}) as unknown as Document;
}

describe("readMyAnimeListIdFromUrl", () => {
	it("reads pretty and query anime URLs", () => {
		expect(
			readMyAnimeListIdFromUrl(
				"https://myanimelist.net/anime/5114/Fullmetal_Alchemist__Brotherhood",
			),
		).toBe(parseMyAnimeListId(5114));
		expect(
			readMyAnimeListIdFromUrl("https://myanimelist.net/anime.php?id=5114"),
		).toBe(parseMyAnimeListId(5114));
	});

	it("rejects invalid anime URLs", () => {
		expect(readMyAnimeListIdFromUrl("https://myanimelist.net/topanime.php")).toBeNull();
		expect(readMyAnimeListIdFromUrl("not a url")).toBeNull();
	});
});

describe("MyAnimeList page readers", () => {
	it("reads title, image, labels, and format", () => {
		const doc = createDocument({
			title: " Fullmetal Alchemist: Brotherhood ",
			image: "https://cdn.example.test/fma.jpg",
			rows: [
				{ label: "Type:", value: "TV" },
				{ label: "Episodes:", value: "64" },
			],
		});

		expect(readTitleFromPage(doc)).toBe("Fullmetal Alchemist: Brotherhood");
		expect(readImageFromPage(doc)).toBe("https://cdn.example.test/fma.jpg");
		expect(readLabeledFacts(doc).get("episodes")).toBe("64");
		expect(readFormatFromPage(doc)).toBe("TV");
	});

	it("handles missing optional labels", () => {
		const doc = createDocument({ title: "Test" });

		expect(readLabeledFacts(doc).size).toBe(0);
		expect(readImageFromPage(doc)).toBeNull();
		expect(readFormatFromPage(doc)).toBeNull();
	});
});
