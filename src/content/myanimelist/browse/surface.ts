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

export function isBrowseSurface(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.hostname !== "myanimelist.net") return false;
		if (parsed.pathname === "/anime.php") {
			return !parsed.searchParams.has("id");
		}
		return MAL_BROWSE_PATHS.some((path) => isBrowsePath(parsed.pathname, path));
	} catch {
		return false;
	}
}
