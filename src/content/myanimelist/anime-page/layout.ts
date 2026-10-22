/** DOM readers and layout helpers for MyAnimeList anime detail pages. */
// src/content/myanimelist/anime-page/layout.ts

import {
	type AniListMediaFormat,
	type AniListMediaHint,
	parseAniListMediaFormatLabel,
} from "@/anilist/types";

export const TITLE_SELECTOR = "h1.title-name";
export const DETAILS_COLUMN_SELECTOR = "#content .leftside, .leftside";
export const ACTIONS_HOST_SELECTOR = [
	"#content .anime-detail-header-stats .js-user-status-block",
	"#content .anime-detail-header-stats .user-status-block",
].join(", ");
export const UI_NAME = "a2a-myanimelist-anime-page-ui";

function readText(element: Element | null): string | null {
	const value = element?.textContent?.replaceAll(/\s+/g, " ").trim();
	return value || null;
}

export function readLabeledFacts(
	doc: Document = document,
): Map<string, string> {
	const facts = new Map<string, string>();
	const root = doc.querySelector(DETAILS_COLUMN_SELECTOR);
	if (!root) return facts;

	for (const node of root.querySelectorAll<HTMLElement>(".spaceit_pad")) {
		const label = node.querySelector("span.dark_text")?.textContent;
		if (!label) continue;

		const value = node.textContent
			?.replace(label, "")
			.replaceAll(/\s+/g, " ")
			.trim();
		if (value) facts.set(label.replace(":", "").trim().toLowerCase(), value);
	}

	return facts;
}

export function readAnimePageData(doc: Document = document): {
	title: string | null;
	format: AniListMediaFormat | null;
	metadata: AniListMediaHint;
} {
	const facts = readLabeledFacts(doc);
	const title =
		readText(doc.querySelector(`${TITLE_SELECTOR} > strong`)) ??
		readText(doc.querySelector(TITLE_SELECTOR));
	const english =
		readText(doc.querySelector("p.title-english")) ?? facts.get("english");
	const native = facts.get("japanese");
	const synonyms = [
		...new Set(
			(facts.get("synonyms") ?? "")
				.split(",")
				.map((synonym) => synonym.trim())
				.filter(Boolean),
		),
	];
	const format = parseAniListMediaFormatLabel(facts.get("type"));

	return {
		title,
		format,
		metadata: {
			titles: {
				...(title === null ? {} : { romaji: title }),
				...(english === undefined || english === null ? {} : { english }),
				...(native === undefined ? {} : { native }),
			},
			synonyms,
			format,
		},
	};
}
