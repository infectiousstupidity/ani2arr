/** Tests for AniChart browse card parsing against host DOM quirks. */
// src/content/anichart/browse/adapter.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { anichartBrowseAdapter } from "./adapter";

class FakeTextNode {
	readonly nodeType = 3;
	constructor(readonly textContent: string) {}
}

class FakeElement {
	readonly nodeType = 1;
	readonly childNodes: Array<FakeElement | FakeTextNode> = [];
	private readonly attributes = new Map<string, string>();
	parentElement: FakeElement | null = null;
	textContent = "";

	constructor(
		readonly tagName: string,
		readonly className = "",
	) {}

	append(child: FakeElement | FakeTextNode): void {
		this.childNodes.push(child);
		if (child instanceof FakeElement) {
			child.parentElement = this;
		}
	}

	appendText(text: string): void {
		this.append(new FakeTextNode(text));
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	getAttribute(name: string): string | null {
		return this.attributes.get(name) ?? null;
	}

	closest(selector: string): FakeElement | null {
		if (this.matches(selector)) return this;
		return this.parentElement?.closest(selector) ?? null;
	}

	querySelector(selector: string): FakeElement | null {
		for (const child of this.childNodes) {
			if (!(child instanceof FakeElement)) continue;
			if (child.matches(selector)) return child;
			const match = child.querySelector(selector);
			if (match) return match;
		}
		return null;
	}

	private matches(selector: string): boolean {
		if (selector.includes(",")) {
			return selector.split(",").some((part) => this.matches(part.trim()));
		}
		const [tagName, className] = selector.split(".");
		const tagMatches =
			!tagName || this.tagName.toLowerCase() === tagName.toLowerCase();
		const classMatches =
			!className || this.className.split(/\s+/).includes(className);
		return tagMatches && classMatches;
	}
}

function createAniChartCard(input: {
	headingText: string;
	nestedHeadingText?: string;
}): FakeElement {
	const section = new FakeElement("section");
	const heading = new FakeElement("h2", "section-heading");
	heading.appendText(`\n ${input.headingText} \n`);

	if (input.nestedHeadingText) {
		const nested = new FakeElement("span", "tooltip-text");
		nested.textContent = input.nestedHeadingText;
		heading.append(nested);
	}

	const card = new FakeElement("div", "media-card");
	const cover = new FakeElement("a", "cover");
	cover.setAttribute("href", "https://anilist.co/anime/210031/Example");
	const title = new FakeElement("a", "title");
	title.textContent = "Example Title";
	cover.append(title);
	card.append(cover);
	section.append(heading);
	section.append(card);

	return card;
}

describe("anichartBrowseAdapter", () => {
	beforeEach(() => {
		vi.stubGlobal("Node", { TEXT_NODE: 3 });
	});

	it("parses the direct section heading without nested filter text", () => {
		const card = createAniChartCard({
			headingText: "TV",
			nestedHeadingText: "ShareSearchSort",
		});

		const parsed = anichartBrowseAdapter.parseCard(
			card as unknown as Element,
		);

		expect(parsed).toMatchObject({
			anilistId: 210_031,
			title: "Example Title",
			format: "TV",
		});
	});

	it("skips music sections from direct heading text", () => {
		const card = createAniChartCard({
			headingText: "Music",
			nestedHeadingText: "ShareSearchSort",
		});

		expect(
			anichartBrowseAdapter.parseCard(card as unknown as Element),
		).toBeNull();
	});
});
