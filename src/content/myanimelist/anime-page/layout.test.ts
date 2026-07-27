// @vitest-environment happy-dom

/** Tests for MyAnimeList anime detail page DOM readers. */

import { describe, expect, it } from "vitest";
import {
	ANCHOR_ID,
	ensureActionsAnchor,
	readAnimePageData,
	readLabeledFacts,
	removeLayoutArtifacts,
} from "./layout";

function setBody(markup: string): void {
	const fixture = new DOMParser().parseFromString(markup, "text/html");
	document.body.replaceChildren(...fixture.body.childNodes);
}

function renderAnimePage(input: {
	title: string;
	englishTitle?: string;
	rows?: Array<{ label: string; value: string }>;
}): void {
	const rows = (input.rows ?? [])
		.map(
			({ label, value }) => `
				<div class="spaceit_pad">
					<span class="dark_text">${label}</span> ${value}
				</div>
			`,
		)
		.join("");

	setBody(`
		<div id="content">
			<h1 class="title-name"><strong>${input.title}</strong></h1>
			${input.englishTitle ? `<p class="title-english">${input.englishTitle}</p>` : ""}
			<div class="leftside">${rows}</div>
		</div>
	`);
}

function renderActionLayout(input: {
	primary?: boolean;
	fallback?: boolean;
	existingAnchor?: boolean;
}): void {
	setBody(`
		<div id="content">
			<div class="anime-detail-header-stats">
				${input.primary ? '<div id="primary" class="js-user-status-block"></div>' : ""}
				${input.fallback ? '<div id="fallback" class="user-status-block"></div>' : ""}
			</div>
		</div>
		${input.existingAnchor ? `<div id="${ANCHOR_ID}"></div>` : ""}
	`);
}

describe("MyAnimeList page readers", () => {
	it("reads the real MAL 63816 titles, synonym, and format", () => {
		renderAnimePage({
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

		expect(readAnimePageData()).toEqual({
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
		renderAnimePage({ title: "Test" });

		expect(readLabeledFacts().size).toBe(0);
		expect(readAnimePageData()).toEqual({
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
	it("creates the anchor below the primary user-status row", () => {
		renderActionLayout({ primary: true, fallback: true });
		const primary = document.querySelector("#primary");
		const fallback = document.querySelector("#fallback");

		const anchor = ensureActionsAnchor();

		expect(anchor?.id).toBe(ANCHOR_ID);
		expect(anchor?.style.display).toBe("block");
		expect(anchor?.style.clear).toBe("both");
		expect(anchor?.style.marginTop).toBe("8px");
		expect(primary?.nextElementSibling).toBe(anchor);
		expect(fallback?.nextElementSibling).not.toBe(anchor);
	});

	it("uses the same-location user-status fallback", () => {
		renderActionLayout({ fallback: true });
		const fallback = document.querySelector("#fallback");

		const anchor = ensureActionsAnchor();

		expect(fallback?.nextElementSibling).toBe(anchor);
	});

	it("reuses and repositions an existing anchor", () => {
		renderActionLayout({ primary: true, existingAnchor: true });
		const existingAnchor = document.querySelector(`#${ANCHOR_ID}`);

		const anchor = ensureActionsAnchor();

		expect(anchor).toBe(existingAnchor);
		expect(anchor?.style.marginTop).toBe("8px");
		expect(document.querySelector("#primary")?.nextElementSibling).toBe(anchor);
	});

	it("does not fall back to title or sidebar controls", () => {
		setBody(`
			<h1 class="title-name">Title</h1>
			<div class="profileRows">Sidebar controls</div>
		`);

		expect(ensureActionsAnchor()).toBeNull();
		expect(document.querySelector(`#${ANCHOR_ID}`)).toBeNull();
	});

	it("removes the injected anchor", () => {
		renderActionLayout({ primary: true });
		expect(ensureActionsAnchor()).not.toBeNull();

		removeLayoutArtifacts();

		expect(document.querySelector(`#${ANCHOR_ID}`)).toBeNull();
	});
});
