// @vitest-environment happy-dom

/** Tests for AniChart browse card parsing against host DOM quirks. */

import { describe, expect, it } from "vitest";
import { anichartBrowseAdapter } from "./adapter";

function createAniChartCard(heading: string): Element {
	const fixture = new DOMParser().parseFromString(
		`
		<section>
			<h2 class="section-heading">
				${heading}
				<span class="tooltip-text">ShareSearchSort</span>
			</h2>
			<div class="media-card">
				<a class="cover" href="https://anilist.co/anime/210031/Example"></a>
				<a class="title">Example Title</a>
			</div>
		</section>
	`,
		"text/html",
	);
	document.body.replaceChildren(...fixture.body.childNodes);

	const card = document.querySelector(".media-card");
	if (!card) throw new Error("Expected AniChart card");
	return card;
}

describe("anichartBrowseAdapter", () => {
	it("parses the direct section heading without nested filter text", () => {
		expect(anichartBrowseAdapter.parseCard(createAniChartCard("TV"))).toMatchObject(
			{
				anilistId: 210_031,
				title: "Example Title",
				format: "TV",
			},
		);
	});

	it("skips music sections from direct heading text", () => {
		expect(
			anichartBrowseAdapter.parseCard(createAniChartCard("Music")),
		).toBeNull();
	});
});
