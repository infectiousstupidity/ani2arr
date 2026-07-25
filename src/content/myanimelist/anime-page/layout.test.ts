/** Tests for MyAnimeList anime detail page DOM readers. */
// src/content/myanimelist/anime-page/layout.test.ts

import { describe, expect, it, vi } from "vitest";
import {
	ANCHOR_ID,
	ensureActionsAnchor,
	readAnimePageData,
	readLabeledFacts,
	removeLayoutArtifacts,
} from "./layout";

const MAIN_USER_STATUS_SELECTOR =
	"#content .anime-detail-header-stats .js-user-status-block";
const MAIN_USER_STATUS_FALLBACK_SELECTOR =
	"#content .anime-detail-header-stats .user-status-block";

type FakeElement = {
	textContent?: string | null;
	querySelector: (selector: string) => FakeElement | null;
	querySelectorAll: (selector: string) => FakeElement[];
};

function createElement(input: {
	textContent?: string;
	children?: Record<string, FakeElement | null>;
	lists?: Record<string, FakeElement[]>;
}): FakeElement {
	return {
		textContent: input.textContent ?? null,
		querySelector: (selector) => input.children?.[selector] ?? null,
		querySelectorAll: (selector) => input.lists?.[selector] ?? [],
	};
}

function createDocument(input: {
	title?: string;
	englishTitle?: string;
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
			: createElement({
					textContent: `${input.title}${input.englishTitle ?? ""}`,
					children: {
						strong: createElement({ textContent: input.title }),
					},
				});
	const englishTitle =
		input.englishTitle === undefined
			? null
			: createElement({ textContent: input.englishTitle });
	return createElement({
		children: {
			"h1.title-name": title,
			"h1.title-name > strong": title?.querySelector("strong") ?? null,
			"p.title-english": englishTitle,
			"#content .leftside, .leftside": leftside,
		},
	}) as unknown as Document;
}

type FakeLayoutElement = {
	id: string;
	style: Record<string, string>;
	after: ReturnType<typeof vi.fn>;
	remove: ReturnType<typeof vi.fn>;
};

function createLayoutElement(id = ""): FakeLayoutElement {
	return {
		id,
		style: {},
		after: vi.fn(),
		remove: vi.fn(),
	};
}

function createLayoutDocument(
	input: {
		primaryStatus?: boolean;
		fallbackStatus?: boolean;
		existingAnchor?: FakeLayoutElement;
		title?: boolean;
		sidebarControl?: boolean;
	} = {},
) {
	const primaryStatus = createLayoutElement();
	const fallbackStatus = createLayoutElement();
	const title = createLayoutElement();
	const sidebarControl = createLayoutElement();
	let anchor = input.existingAnchor ?? null;

	const querySelector = vi.fn((selector: string) => {
		if (selector === MAIN_USER_STATUS_SELECTOR) {
			return input.primaryStatus ? primaryStatus : null;
		}
		if (selector === MAIN_USER_STATUS_FALLBACK_SELECTOR) {
			return input.fallbackStatus ? fallbackStatus : null;
		}
		if (selector === `#${ANCHOR_ID}`) return anchor;
		if (selector === "h1.title-name") return input.title ? title : null;
		if (selector === ".profileRows") {
			return input.sidebarControl ? sidebarControl : null;
		}
		return null;
	});

	const createElement = vi.fn(() => {
		anchor = createLayoutElement();
		return anchor;
	});

	return {
		doc: { querySelector, createElement } as unknown as Document,
		primaryStatus,
		fallbackStatus,
		title,
		sidebarControl,
		createElement,
	};
}

describe("MyAnimeList page readers", () => {
	it("reads the real MAL 63816 titles, synonym, and format", () => {
		const doc = createDocument({
			title: " Sousou no Frieren: Ougonkyou-hen ",
			englishTitle: " Frieren: Beyond Journey's End - Golden Land Arc ",
			rows: [
				{ label: "Type:", value: "TV" },
				{ label: "Japanese:", value: "葬送のフリーレン 黄金郷編" },
				{
					label: "Synonyms:",
					value: "Frieren at the Funeral Season 3",
				},
			],
		});

		expect(readAnimePageData(doc)).toEqual({
			title: "Sousou no Frieren: Ougonkyou-hen",
			format: "TV",
			metadata: {
				titles: {
					romaji: "Sousou no Frieren: Ougonkyou-hen",
					english: "Frieren: Beyond Journey's End - Golden Land Arc",
					native: "葬送のフリーレン 黄金郷編",
				},
				synonyms: ["Frieren at the Funeral Season 3"],
				format: "TV",
			},
		});
	});

	it("handles missing optional labels", () => {
		const doc = createDocument({ title: "Test" });

		expect(readLabeledFacts(doc).size).toBe(0);
		expect(readAnimePageData(doc)).toEqual({
			title: "Test",
			format: null,
			metadata: {
				titles: { romaji: "Test" },
				synonyms: [],
				format: null,
			},
		});
	});
});

describe("MyAnimeList action placement", () => {
	it("creates the anchor below the main user-status row", () => {
		const { doc, primaryStatus, fallbackStatus } = createLayoutDocument({
			primaryStatus: true,
			fallbackStatus: true,
		});

		const anchor = ensureActionsAnchor(doc);

		expect(anchor).not.toBeNull();
		expect(anchor?.id).toBe(ANCHOR_ID);
		expect(anchor?.style.display).toBe("block");
		expect(anchor?.style.clear).toBe("both");
		expect(anchor?.style.margin).toBe("8px 0 0");
		expect(primaryStatus.after).toHaveBeenCalledOnce();
		expect(primaryStatus.after).toHaveBeenCalledWith(anchor);
		expect(fallbackStatus.after).not.toHaveBeenCalled();
	});

	it("uses the same-location user-status fallback", () => {
		const { doc, fallbackStatus } = createLayoutDocument({
			fallbackStatus: true,
		});

		const anchor = ensureActionsAnchor(doc);

		expect(anchor).not.toBeNull();
		expect(fallbackStatus.after).toHaveBeenCalledWith(anchor);
	});

	it("reuses and repositions an existing anchor", () => {
		const existingAnchor = createLayoutElement(ANCHOR_ID);
		const { doc, primaryStatus, createElement } = createLayoutDocument({
			primaryStatus: true,
			existingAnchor,
		});

		const anchor = ensureActionsAnchor(doc);

		expect(anchor).toBe(existingAnchor);
		expect(createElement).not.toHaveBeenCalled();
		expect(existingAnchor.style).toEqual({
			display: "block",
			clear: "both",
			margin: "8px 0 0",
		});
		expect(primaryStatus.after).toHaveBeenCalledWith(existingAnchor);
	});

	it("returns null and creates nothing without a main user-status row", () => {
		const { doc, createElement } = createLayoutDocument();

		expect(ensureActionsAnchor(doc)).toBeNull();
		expect(createElement).not.toHaveBeenCalled();
	});

	it("does not fall back to the title or sidebar controls", () => {
		const { doc, title, sidebarControl, createElement } = createLayoutDocument({
			title: true,
			sidebarControl: true,
		});

		expect(ensureActionsAnchor(doc)).toBeNull();
		expect(createElement).not.toHaveBeenCalled();
		expect(title.after).not.toHaveBeenCalled();
		expect(sidebarControl.after).not.toHaveBeenCalled();
	});

	it("removes the injected anchor", () => {
		const anchor = createLayoutElement(ANCHOR_ID);
		const { doc } = createLayoutDocument({ existingAnchor: anchor });

		removeLayoutArtifacts(doc);

		expect(anchor.remove).toHaveBeenCalledOnce();
	});
});
