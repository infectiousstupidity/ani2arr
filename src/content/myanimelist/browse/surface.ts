/** Pure URL matching for MyAnimeList browse-like content surfaces. */
// src/content/myanimelist/browse/surface.ts

const MAL_BROWSE_PATHS = [
	"/anime/season",
	"/topanime.php",
	"/anime/genre",
	"/anime/producer",
] as const;

function isBrowsePath(pathname: string, browsePath: string): boolean {
	return pathname === browsePath || pathname.startsWith(`${browsePath}/`);
}

function parseMyAnimeListUrl(url: string): URL | null {
	try {
		const parsed = new URL(url);
		return parsed.hostname === "myanimelist.net" ? parsed : null;
	} catch {
		return null;
	}
}

export function isBrowseSurface(url: string): boolean {
	const parsed = parseMyAnimeListUrl(url);
	if (!parsed) return false;
	if (parsed.pathname === "/anime.php") {
		return !parsed.searchParams.has("id");
	}
	if (parsed.pathname === "/search/all") return true;
	return MAL_BROWSE_PATHS.some((path) => isBrowsePath(parsed.pathname, path));
}
