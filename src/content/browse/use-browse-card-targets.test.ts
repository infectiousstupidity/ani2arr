// @vitest-environment happy-dom

/** DOM target tests for browse-card light-DOM portal containers. */

import { beforeEach, describe, expect, it } from "vitest";
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

function createCard(id: number, title = "Example"): HTMLElement {
	const card = document.createElement("div");
	card.className = "card";
	card.dataset.id = String(id);
	card.dataset.title = title;

	const cover = document.createElement("a");
	cover.className = "cover";
	cover.href = `/anime/${id}`;
	card.append(cover);
	document.body.append(card);
	return card;
}

function getCover(card: Element): HTMLElement {
	const cover = card.querySelector<HTMLElement>(".cover");
	if (!cover) throw new Error("Expected cover");
	return cover;
}

function getPlacementContainer(card: Element): HTMLElement | null {
	return getCover(card).querySelector(`.${BROWSE_OVERLAY_CONTAINER_CLASS}`);
}

function createAdapter(
	input: {
		anchorCorner?: BrowseAdapter["anchorCorner"];
		presentation?: "status-column";
	} = {},
): BrowseAdapter {
	return {
		cardSelector: ".card",
		parseCard(card): HostMediaTarget | null {
			const mountTarget = card.querySelector<HTMLElement>(
				input.presentation === "status-column" ? ".status" : ".cover",
			);
			if (!mountTarget) return null;
			const anilistId = parseAniListId(Number((card as HTMLElement).dataset.id));
			return {
				source: { source: "anilist", id: anilistId },
				anilistId,
				title: (card as HTMLElement).dataset.title ?? "",
				format: null,
				mountTarget,
				...(input.presentation ? { presentation: input.presentation } : {}),
			};
		},
		getScanRoot: () => document.body,
		getObserverRoot: () => document.body,
		...(input.anchorCorner ? { anchorCorner: input.anchorCorner } : {}),
	};
}

describe("scanBrowseCardTargets", () => {
	beforeEach(() => {
		document.body.replaceChildren();
	});

	it("creates, reuses, and cleans one portal target", () => {
		const card = createCard(101);
		const options = {
			adapter: createAdapter({ anchorCorner: "bottom-left" }),
		};

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
		createCard(147_105, "Tongari Boushi no Atelier");
		createCard(147_105, "Tongari Boushi no Atelier");
		const options = { adapter: createAdapter() };

		const firstKeys = scanBrowseCardTargets(options).map((target) => target.key);
		const secondKeys = scanBrowseCardTargets(options).map((target) => target.key);

		expect(new Set(firstKeys).size).toBe(2);
		expect(secondKeys).toEqual(firstKeys);
	});

	it("prepends, reuses, and cleans a status-column target", () => {
		const card = createCard(52_991, "Sousou no Frieren");
		const statusCell = document.createElement("td");
		statusCell.className = "status";
		const nativeButton = document.createElement("a");
		nativeButton.textContent = "Add to My List";
		statusCell.append(nativeButton);
		card.append(statusCell);
		const options = {
			adapter: createAdapter({ presentation: "status-column" }),
		};

		const firstTargets = scanBrowseCardTargets(options);
		const container = firstTargets[0]?.container;
		const secondTargets = scanBrowseCardTargets(options);

		expect(firstTargets).toHaveLength(1);
		expect(secondTargets[0]?.container).toBe(container);
		expect(container?.dataset.presentation).toBe("status-column");
		expect([...statusCell.children]).toEqual([container, nativeButton]);

		cleanupBrowseCardTargets(firstTargets);

		expect([...statusCell.children]).toEqual([nativeButton]);
		expect(statusCell.dataset.a2aProcessed).toBeUndefined();
	});
});
