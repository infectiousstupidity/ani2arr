/** DOM target tests for browse-card light-DOM portal containers. */
// src/content/browse/use-browse-card-targets.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import {
	BROWSE_OVERLAY_CONTAINER_CLASS,
	type BrowseAdapter,
	type HostMediaTarget,
} from "./types";
import {
	cleanupBrowseCardTargets,
	scanBrowseCardTargets,
} from "./use-browse-card-targets";

class FakeNode {
	parentElement: FakeElement | null = null;
}

class FakeElement extends FakeNode {
	readonly children: FakeElement[] = [];
	readonly attributes = new Map<string, string>();
	readonly dataset: Record<string, string> = {};
	readonly classList = {
		contains: (className: string) =>
			this.className.split(/\s+/).includes(className),
	};
	className = "";
	textContent = "";
	ownerDocument = fakeDocument;

	constructor(readonly tagName: string) {
		super();
	}

	append(child: FakeElement): void {
		child.parentElement = this;
		this.children.push(child);
	}

	remove(): void {
		if (!this.parentElement) return;
		const siblings = this.parentElement.children;
		const index = siblings.indexOf(this);
		if (index !== -1) siblings.splice(index, 1);
		this.parentElement = null;
	}

	matches(selector: string): boolean {
		if (selector.startsWith(".")) {
			return this.classList.contains(selector.slice(1));
		}
		return this.tagName.toLowerCase() === selector.toLowerCase();
	}

	querySelectorAll(selector: string): FakeElement[] {
		const matches: FakeElement[] = [];
		for (const child of this.children) {
			if (child.matches(selector)) matches.push(child);
			matches.push(...child.querySelectorAll(selector));
		}
		return matches;
	}

	querySelector(selector: string): FakeElement | null {
		for (const child of this.children) {
			if (child.matches(selector)) return child;

			const match = child.querySelector(selector);
			if (match) return match;
		}

		return null;
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
		if (name === "class") this.className = value;
		if (name.startsWith("data-")) {
			this.dataset[toDatasetKey(name)] = value;
		}
	}

	getAttribute(name: string): string | null {
		if (name === "class") return this.className;
		return this.attributes.get(name) ?? null;
	}

	getAttributeNames(): string[] {
		return [...this.attributes.keys()];
	}

	removeAttribute(name: string): void {
		this.attributes.delete(name);
		if (name.startsWith("data-")) {
			delete this.dataset[toDatasetKey(name)];
		}
	}
}

function toDatasetKey(attributeName: string): string {
	return attributeName
		.slice("data-".length)
		.replaceAll(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

const fakeDocument = {
	body: null as FakeElement | null,
	documentElement: null as FakeElement | null,
	createElement(tagName: string): FakeElement {
		return new FakeElement(tagName);
	},
	querySelector(selector: string): FakeElement | null {
		return fakeDocument.body?.querySelector(selector) ?? null;
	},
};

function createCard(input: {
	id: number;
	title: string;
	href?: string;
}): FakeElement {
	const card = new FakeElement("div");
	card.className = "card";
	card.dataset.id = String(input.id);
	card.dataset.title = input.title;

	const cover = new FakeElement("a");
	cover.className = "cover";
	cover.setAttribute("href", input.href ?? `/anime/${input.id}`);
	card.append(cover);

	return card;
}

function getCover(card: FakeElement): FakeElement {
	const cover = card.querySelector(".cover");
	if (!cover) throw new Error("Expected cover");
	return cover;
}

function getPlacementContainer(card: FakeElement): FakeElement | null {
	return getCover(card).querySelector(`.${BROWSE_OVERLAY_CONTAINER_CLASS}`);
}

function createAdapter(
	input: {
		anchorCorner?: BrowseAdapter["anchorCorner"];
	} = {},
): BrowseAdapter {
	const adapter: BrowseAdapter = {
		cardSelector: ".card",
		parseCard(card: Element): HostMediaTarget | null {
			const fakeCard = card as unknown as FakeElement;
			const cover = fakeCard.querySelector(".cover");
			if (!cover) return null;
			const anilistId = parseAniListId(Number(fakeCard.dataset.id));
			return {
				source: { source: "anilist", id: anilistId },
				anilistId,
				title: fakeCard.dataset.title ?? "",
				format: null,
				mountTarget: cover as unknown as HTMLElement,
			};
		},
		getScanRoot: () => fakeDocument.body as unknown as Element,
		getObserverRoot: () => fakeDocument.body as unknown as Node,
	};
	if (input.anchorCorner) {
		adapter.anchorCorner = input.anchorCorner;
	}
	return adapter;
}

function createOptions(adapter = createAdapter()) {
	return { adapter };
}

describe("scanBrowseCardTargets", () => {
	beforeEach(() => {
		fakeDocument.body = new FakeElement("body");
		fakeDocument.documentElement = fakeDocument.body;
		vi.stubGlobal("document", fakeDocument);
		vi.stubGlobal("Element", FakeElement);
		vi.stubGlobal("HTMLElement", FakeElement);
	});

	it("creates, reuses, and cleans one portal target", () => {
		const card = createCard({ id: 101, title: "First" });
		fakeDocument.body?.append(card);
		const options = createOptions(
			createAdapter({ anchorCorner: "bottom-left" }),
		);

		const firstTargets = scanBrowseCardTargets(options);
		const firstContainer = getPlacementContainer(card);
		const secondTargets = scanBrowseCardTargets(options);

		expect(firstTargets).toHaveLength(1);
		expect(secondTargets).toHaveLength(1);
		expect(firstContainer).not.toBeNull();
		expect(secondTargets[0]?.container).toBe(firstContainer);
		expect(getCover(card).dataset.a2aProcessed).toBe("anilist:101");
		expect(firstContainer?.dataset.corner).toBe("bottom-left");

		cleanupBrowseCardTargets(firstTargets);

		expect(getCover(card).dataset.a2aProcessed).toBeUndefined();
		expect(getPlacementContainer(card)).toBeNull();
	});

	it("uses unique stable portal keys for duplicate media cards", () => {
		const firstCard = createCard({
			id: 147_105,
			title: "Tongari Boushi no Atelier",
			href: "/anime/147105/Tongari-Boushi-no-Atelier/",
		});
		const secondCard = createCard({
			id: 147_105,
			title: "Tongari Boushi no Atelier",
			href: "/anime/147105/Tongari-Boushi-no-Atelier/",
		});
		fakeDocument.body?.append(firstCard);
		fakeDocument.body?.append(secondCard);
		const options = createOptions();

		const firstTargets = scanBrowseCardTargets(options);
		const firstKeys = firstTargets.map((target) => target.key);
		const secondTargets = scanBrowseCardTargets(options);
		const secondKeys = secondTargets.map((target) => target.key);

		expect(firstTargets).toHaveLength(2);
		expect(new Set(firstKeys).size).toBe(2);
		expect(secondKeys).toEqual(firstKeys);
	});
});
