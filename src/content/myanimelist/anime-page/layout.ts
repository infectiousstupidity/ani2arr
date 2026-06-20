/** DOM readers and layout helpers for MyAnimeList anime detail pages. */
// src/content/myanimelist/anime-page/layout.ts

import {
	parseAniListMediaFormatLabel,
	type AniListMediaFormat,
} from "@/anilist/types";
import {
	parseMyAnimeListIdOrNull,
	type MyAnimeListId,
} from "@/myanimelist/types";

export const TITLE_SELECTOR = "h1.title-name";
export const DETAILS_COLUMN_SELECTOR = "#content .leftside, .leftside";
export const IMAGE_SELECTOR = 'img[itemprop="image"]';
export const UI_NAME = "a2a-myanimelist-anime-page-ui";
export const ANCHOR_ID = "a2a-myanimelist-actions-anchor";

const noop = (): void => {};

function createAbortError(): DOMException {
	return new DOMException("The operation was aborted.", "AbortError");
}

export function readMyAnimeListIdFromUrl(value: string): MyAnimeListId | null {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}

	const pathMatch = /^\/anime\/(\d+)(?:\/|$)/.exec(url.pathname);
	const rawId =
		pathMatch?.[1] ??
		(url.pathname === "/anime.php" ? url.searchParams.get("id") : null);
	return parseMyAnimeListIdOrNull(rawId === null ? null : Number(rawId));
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

export function readTitleFromPage(doc: Document = document): string | null {
	const title = doc.querySelector<HTMLElement>(TITLE_SELECTOR)?.textContent?.trim();
	return title ? title.replaceAll(/\s+/g, " ") : null;
}

export function readImageFromPage(doc: Document = document): string | null {
	const source = doc
		.querySelector<HTMLImageElement>(IMAGE_SELECTOR)
		?.getAttribute("src")
		?.trim();
	return source || null;
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

export function readFormatFromPage(doc: Document = document): AniListMediaFormat | null {
	return parseAniListMediaFormatLabel(readLabeledFacts(doc).get("type"));
}

export function ensureActionsAnchor(doc: Document = document): HTMLElement | null {
	const title = doc.querySelector<HTMLElement>(TITLE_SELECTOR);
	if (!title) return null;

	let anchor = doc.querySelector<HTMLElement>(`#${ANCHOR_ID}`);
	if (!anchor) {
		anchor = doc.createElement("div");
		anchor.id = ANCHOR_ID;
		anchor.style.display = "block";
		anchor.style.margin = "8px 0 12px";
		title.after(anchor);
	}

	return anchor;
}

export function removeLayoutArtifacts(doc: Document = document): void {
	doc.querySelector<HTMLElement>(`#${ANCHOR_ID}`)?.remove();
}

export function attachSizeSync(host: HTMLElement): () => void {
	Object.assign(host.style, {
		display: "block",
		position: "static",
		width: "100%",
		maxWidth: "420px",
		margin: "0",
	});

	return noop;
}
