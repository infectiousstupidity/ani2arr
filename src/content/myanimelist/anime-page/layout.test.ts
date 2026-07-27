// @vitest-environment happy-dom

/** Tests for MyAnimeList anime detail page DOM readers. */

import { describe, expect, it } from "vitest";
import { readAnimePageData, readLabeledFacts } from "./layout";

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
