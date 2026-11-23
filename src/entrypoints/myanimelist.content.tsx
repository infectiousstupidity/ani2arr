/** MyAnimeList content entrypoint with early browse startup. */

import "@/shared/styles/content-base.css";
import { main as myAnimeListAnimeMain } from "@/content/myanimelist/anime-page";
import { main as myAnimeListBrowseMain } from "@/content/myanimelist/browse";
import { isBrowseSurface } from "@/content/myanimelist/browse/surface";
import { readMyAnimeListIdFromUrl } from "@/myanimelist/url";
import type { ContentScriptContext } from "wxt/utils/content-script-context";

const noop = (): void => {};

async function waitForBody(ctx: ContentScriptContext): Promise<boolean> {
	if (document.body) return ctx.isValid;
	if (ctx.isInvalid) return false;

	return new Promise((resolve) => {
		let settled = false;
		let removeInvalidation = noop;
		const observer = new MutationObserver(() => {
			if (document.body) finish(true);
		});

		function finish(ready: boolean): void {
			if (settled) return;
			settled = true;
			observer.disconnect();
			removeInvalidation();
			resolve(ready && ctx.isValid);
		}

		removeInvalidation = ctx.onInvalidated(() => finish(false));
		observer.observe(document, { childList: true, subtree: true });
	});
}

export async function runMyAnimeListContent(
	ctx: ContentScriptContext,
): Promise<void> {
	const url = location.href;
	if (isBrowseSurface(url)) {
		if (!(await waitForBody(ctx))) return;
		await myAnimeListBrowseMain(ctx);
		return;
	}

	if (readMyAnimeListIdFromUrl(url) !== null) {
		await myAnimeListAnimeMain(ctx);
	}
}

export default defineContentScript({
	matches: ["https://myanimelist.net/*"],
	cssInjectionMode: "ui",
	runAt: "document_start",
	main: runMyAnimeListContent,
});
