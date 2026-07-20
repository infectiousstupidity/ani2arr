/** Thin WXT boot file for the MyAnimeList browse content script. */
// src/entrypoints/myanimelist-browse.content.tsx

import { main } from "@/content/myanimelist/browse";

export default defineContentScript({
	matches: ["https://myanimelist.net/*"],
	cssInjectionMode: "ui",
	main,
});
