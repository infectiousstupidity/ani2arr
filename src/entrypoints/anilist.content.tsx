/** AniList content entrypoint for anime pages and browse surfaces. */

import "@/shared/styles/content-base.css";
import { main as anilistAnimeMain } from "@/content/anilist/anime-page";
import { main as anilistBrowseMain } from "@/content/anilist/browse";

export default defineContentScript({
	matches: ["https://anilist.co/*"],
	cssInjectionMode: "ui",
	runAt: "document_end",
	async main(ctx) {
		await Promise.all([anilistAnimeMain(ctx), anilistBrowseMain(ctx)]);
	},
});
