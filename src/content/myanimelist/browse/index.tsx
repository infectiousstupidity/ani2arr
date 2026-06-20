/** MyAnimeList browse surface composition for content-owned overlays. */
// src/content/myanimelist/browse/index.tsx

import "@/shared/styles/content-base.css";
import browseLightDomStyles from "@/content/anilist/browse/style.css?inline";
import cardOverlayStyles from "@/features/media-overlay/card-overlay.light-dom.css?inline";
import { createBrowseEntrypointShell } from "@/content/browse/create-browse-entrypoint";
import type { PublicOptions } from "@/settings/types";
import { myAnimeListBrowseAdapter } from "./adapter";

const MAL_BROWSE_PATHS = [
	"/anime/season",
	"/topanime.php",
	"/anime.php",
	"/anime/genre",
	"/anime/producer",
] as const;

function isBrowseSurface(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.hostname !== "myanimelist.net") return false;
		return MAL_BROWSE_PATHS.some((path) => parsed.pathname.startsWith(path));
	} catch {
		return false;
	}
}

const isBrowseShellEligible = ({
	url,
	publicOptions,
}: {
	url: string;
	publicOptions: PublicOptions;
}): boolean => {
	if (!isBrowseSurface(url)) return false;

	return (
		(publicOptions.ui?.browseCards?.sonarr?.enabled ?? true) ||
		(publicOptions.ui?.browseCards?.radarr?.enabled ?? true) ||
		(publicOptions.ui?.browseCards?.seerr?.enabled ?? true)
	);
};

const lightDomStylesText = `${browseLightDomStyles}\n${cardOverlayStyles}`;

export const main = createBrowseEntrypointShell({
	adapter: myAnimeListBrowseAdapter,
	uiName: "a2a-myanimelist-browse-root",
	lightDomStylesText,
	isEligible: isBrowseShellEligible,
});
