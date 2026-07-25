/** DOM readers and layout helpers for MyAnimeList anime detail pages. */
// src/content/myanimelist/anime-page/layout.ts

import {
	parseAniListMediaFormatLabel,
	type AniListMediaFormat,
	type AniListMediaHint,
} from "@/anilist/types";

export const TITLE_SELECTOR = "h1.title-name";
export const DETAILS_COLUMN_SELECTOR = "#content .leftside, .leftside";
export const UI_NAME = "a2a-myanimelist-anime-page-ui";
export const ANCHOR_ID = "a2a-myanimelist-actions-anchor";

const MAIN_USER_STATUS_SELECTOR =
	"#content .anime-detail-header-stats .js-user-status-block";
const MAIN_USER_STATUS_FALLBACK_SELECTOR =
	"#content .anime-detail-header-stats .user-status-block";

function createAbortError(): DOMException {
	return new DOMException("The operation was aborted.", "AbortError");
}

export function waitForElement(
	selector: string,
	input: { root?: ParentNode; signal?: AbortSignal } = {},
): Promise<Element> {
	const { root = document, signal } = input;
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(createAbortError());
			return;
		}

		const existing = root.querySelector(selector);
		if (existing) {
			resolve(existing);
			return;
		}

		const observer = new MutationObserver(() => {
			if (signal?.aborted) {
				observer.disconnect();
				reject(createAbortError());
				return;
			}

			const next = root.querySelector(selector);
			if (!next) return;

			observer.disconnect();
			signal?.removeEventListener("abort", onAbort);
			resolve(next);
		});

		const onAbort = () => {
			observer.disconnect();
			reject(createAbortError());
		};

		signal?.addEventListener("abort", onAbort, { once: true });
		observer.observe(document.body, { childList: true, subtree: true });
	});
}

function readText(element: Element | null): string | null {
	const value = element?.textContent?.replaceAll(/\s+/g, " ").trim();
	return value || null;
}

export function readLabeledFacts(doc: Document = document): Map<string, string> {
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

export function ensureActionsAnchor(doc: Document = document): HTMLElement | null {
	const userStatus =
		doc.querySelector<HTMLElement>(MAIN_USER_STATUS_SELECTOR) ??
		doc.querySelector<HTMLElement>(MAIN_USER_STATUS_FALLBACK_SELECTOR);
	if (!userStatus) return null;

	let anchor = doc.querySelector<HTMLElement>(`#${ANCHOR_ID}`);
	if (!anchor) {
		anchor = doc.createElement("div");
		anchor.id = ANCHOR_ID;
	}

	anchor.style.display = "block";
	anchor.style.clear = "both";
	anchor.style.margin = "8px 0 0";
	userStatus.after(anchor);

	return anchor;
}

export function removeLayoutArtifacts(doc: Document = document): void {
	doc.querySelector<HTMLElement>(`#${ANCHOR_ID}`)?.remove();
}
