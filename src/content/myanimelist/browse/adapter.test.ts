// @vitest-environment happy-dom

/** Focused placement and identity tests for MyAnimeList browse cards. */

import { describe, expect, it } from "vitest";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseMyAnimeListBrowseCard } from "./adapter";

function animeLink(
	id: number,
	input: { title?: string; imageAlt?: string } = {},
): string {
	return `
		<a href="/anime/${id}/title">
			${input.imageAlt ? `<img alt="${input.imageAlt}">` : ""}
			${input.title ?? ""}
		</a>
	`;
}

function getCardFixture(markup: string, selector: string): Element {
	const fixture = new DOMParser().parseFromString(markup, "text/html");
	document.body.replaceChildren(...fixture.body.childNodes);
	const card = document.querySelector(selector);
	if (!card) throw new Error(`Expected card matching ${selector}`);
	return card;
}

describe("parseMyAnimeListBrowseCard", () => {
	it("mounts a ranking row in its Status cell", () => {
		const card = getCardFixture(
			`<table><tbody><tr class="ranking-list">
				<td>${animeLink(52_991, { imageAlt: "Sousou no Frieren" })}</td>
				<td class="anime_ranking_h3">${animeLink(52_991, { title: "Sousou no Frieren" })}</td>
				<td class="status"></td>
			</tr></tbody></table>`,
			"tr.ranking-list",
		);
		const statusCell = card.querySelector("td.status");

		const parsed = parseMyAnimeListBrowseCard(card);

		expect(parsed).toMatchObject({
			source: { source: "mal", id: parseMyAnimeListId(52_991) },
			title: "Sousou no Frieren",
			presentation: "status-column",
			mountTarget: statusCell,
		});

		statusCell?.remove();
		expect(parseMyAnimeListBrowseCard(card)).toBeNull();
	});

	it("mounts a seasonal card action row on the whole card", () => {
		const card = getCardFixture(
			`<section>
				<h2 class="anime-header">TV (New)</h2>
				<div class="seasonal-anime js-seasonal-anime">
					${animeLink(457, { imageAlt: "Mushishi" })}
					<div class="title"><h2>${animeLink(457, { title: "Mushishi" })}</h2></div>
				</div>
			</section>`,
			".seasonal-anime",
		);

		expect(parseMyAnimeListBrowseCard(card)).toMatchObject({
			mountTarget: card,
			presentation: "action-row",
			format: "TV",
		});
	});

	it("uses only an image-bearing autocomplete anchor", () => {
		const card = getCardFixture(
			`<div id="advancedSearchResultList"><div><div>
				${animeLink(457, { imageAlt: "Mushishi" })}
			</div></div></div>`,
			"#advancedSearchResultList > div > div > a",
		);

		expect(parseMyAnimeListBrowseCard(card)).toMatchObject({
			source: { source: "mal", id: parseMyAnimeListId(457) },
			title: "Mushishi",
			mountTarget: card,
		});

		card.querySelector("img")?.remove();
		expect(parseMyAnimeListBrowseCard(card)).toBeNull();
	});

	it.each([
		{
			name: "an anime link without a poster",
			markup: `<div id="anime"></div><article><div class="list">${animeLink(1)}</div></article>`,
			selector: "#anime + article > .list",
		},
		{
			name: "different poster and title IDs",
			markup: `<section><div class="seasonal-anime js-seasonal-anime">
				${animeLink(1, { imageAlt: "Correct" })}
				<div class="title"><h2>${animeLink(2, { title: "Wrong" })}</h2></div>
			</div></section>`,
			selector: ".seasonal-anime",
		},
	])("rejects $name", ({ markup, selector }) => {
		expect(
			parseMyAnimeListBrowseCard(getCardFixture(markup, selector)),
		).toBeNull();
	});
});
