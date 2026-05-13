import { useState, useEffect } from "react";

export type PageId = "sonarr" | "radarr" | "mappings" | "ui" | "advanced";

const DEFAULT_PAGE: PageId = "sonarr";
const VALID_PAGES = new Set<PageId>([
	"sonarr",
	"radarr",
	"mappings",
	"ui",
	"advanced",
]);

export function getHashPage(): PageId {
	if (globalThis.window === undefined) return DEFAULT_PAGE;
	const hash = globalThis.location.hash.replace(/^#\/?/, "");
	const basePage = hash.split("?")[0];

	if (VALID_PAGES.has(basePage as PageId)) {
		return basePage as PageId;
	}
	return DEFAULT_PAGE;
}

export function setHashPage(page: PageId) {
	if (globalThis.window === undefined) return;
	globalThis.location.hash = page;
}

export function useHashRoute() {
	const [page, setPage] = useState<PageId>(getHashPage);

	useEffect(() => {
		const handleHashChange = () => setPage(getHashPage());
		globalThis.addEventListener("hashchange", handleHashChange);
		return () => globalThis.removeEventListener("hashchange", handleHashChange);
	}, []);

	return { page, setPage: setHashPage };
}
