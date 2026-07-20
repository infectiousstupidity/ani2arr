/** Single content entrypoint for all supported AniList, AniChart, and MAL surfaces. */

import "@/shared/styles/content-base.css";
import { main as anichartBrowseMain } from "@/content/anichart/browse";
import { main as anilistAnimeMain } from "@/content/anilist/anime-page";
import { main as anilistBrowseMain } from "@/content/anilist/browse";
import { main as myAnimeListAnimeMain } from "@/content/myanimelist/anime-page";
import { main as myAnimeListBrowseMain } from "@/content/myanimelist/browse";

export default defineContentScript({
	matches: [
		"https://anilist.co/*",
		"https://anichart.net/*",
		"https://www.anichart.net/*",
		"https://myanimelist.net/*",
	],
	cssInjectionMode: "ui",
	runAt: "document_end",
	async main(ctx) {
		const hostname = location.hostname;
		if (hostname === "anilist.co") {
			await Promise.all([anilistAnimeMain(ctx), anilistBrowseMain(ctx)]);
			return;
		}

		if (hostname === "myanimelist.net") {
			await Promise.all([
				myAnimeListAnimeMain(ctx),
				myAnimeListBrowseMain(ctx),
			]);
			return;
		}

		await anichartBrowseMain(ctx);
	},
});
