/** Thin MyAnimeList anime-page content entrypoint that delegates to the page owner. */
// src/entrypoints/myanimelist-anime.content.tsx

import { main } from "@/content/myanimelist/anime-page";

export default defineContentScript({
	matches: ["https://myanimelist.net/*"],
	cssInjectionMode: "ui",
	runAt: "document_end",
	main,
});
