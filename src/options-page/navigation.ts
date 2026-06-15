/** Hash route helpers for the options page navigation and deep links. */
// src/options-page/navigation.ts

import { useSyncExternalStore } from "react";

export type PageId =
	| "sonarr"
	| "radarr"
	| "seerr"
	| "mappings"
	| "ui"
	| "advanced";

const DEFAULT_PAGE: PageId = "sonarr";
const VALID_PAGES = new Set<PageId>([
	"sonarr",
	"radarr",
	"seerr",
	"mappings",
	"ui",
	"advanced",
]);

export function getHashPage(): PageId {
	if (globalThis.window === undefined) return DEFAULT_PAGE;
	return getPageFromHash(getCurrentHash());
}

function getPageFromHash(currentHash: string): PageId {
	const hash = currentHash.replace(/^#\/?/, "");
	const basePage = hash.split("?", 1)[0];

	if (VALID_PAGES.has(basePage as PageId)) {
		return basePage as PageId;
	}
	return DEFAULT_PAGE;
}

export function setHashPage(page: PageId) {
	if (globalThis.window === undefined) return;
	globalThis.location.hash = page;
}

export function getCurrentHash(): string {
	if (globalThis.window === undefined) return "";
	return globalThis.location.hash;
}

function subscribeHashRoute(onStoreChange: () => void): () => void {
	globalThis.addEventListener("hashchange", onStoreChange);
	return () => globalThis.removeEventListener("hashchange", onStoreChange);
}

export function useHashRoute() {
	const hash = useSyncExternalStore(
		subscribeHashRoute,
		getCurrentHash,
		getCurrentHash,
	);
	const page = getPageFromHash(hash);
	return { page, hash, setPage: setHashPage };
}
