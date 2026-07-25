/** Single content entrypoint for all supported AniList, AniChart, and MAL surfaces. */

import "@/shared/styles/content-base.css";
import { main as anichartBrowseMain } from "@/content/anichart/browse";
import { main as anilistAnimeMain } from "@/content/anilist/anime-page";
import { main as anilistBrowseMain } from "@/content/anilist/browse";
import { main as myAnimeListAnimeMain } from "@/content/myanimelist/anime-page";
import { main as myAnimeListBrowseMain } from "@/content/myanimelist/browse";
import { isEarlyBrowseSurface } from "@/content/myanimelist/browse/surface";
import type { ContentScriptContext } from "wxt/utils/content-script-context";

const noop = (): void => {};

function waitForDocumentBody(ctx: ContentScriptContext): Promise<boolean> {
	if (document.body) return Promise.resolve(ctx.isValid);
	if (ctx.isInvalid) return Promise.resolve(false);

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

function waitForDocumentEnd(ctx: ContentScriptContext): Promise<boolean> {
	if (document.readyState !== "loading") {
		return Promise.resolve(ctx.isValid);
	}
	if (ctx.isInvalid) return Promise.resolve(false);

	return new Promise((resolve) => {
		let settled = false;
		let removeInvalidation = noop;
		const onReady = () => finish(true);

		function finish(ready: boolean): void {
			if (settled) return;
			settled = true;
			document.removeEventListener("DOMContentLoaded", onReady);
			removeInvalidation();
			resolve(ready && ctx.isValid);
		}

		removeInvalidation = ctx.onInvalidated(() => finish(false));
		ctx.addEventListener(document, "DOMContentLoaded", onReady, { once: true });
	});
}

export async function runSupportedSitesContent(
	ctx: ContentScriptContext,
): Promise<void> {
	if (isEarlyBrowseSurface(location.href)) {
		await Promise.all([
			(async () => {
				if (!(await waitForDocumentBody(ctx))) return;
				await myAnimeListBrowseMain(ctx);
			})(),
			(async () => {
				if (!(await waitForDocumentEnd(ctx))) return;
				await myAnimeListAnimeMain(ctx);
			})(),
		]);
		return;
	}

	if (!(await waitForDocumentEnd(ctx))) return;

	const hostname = location.hostname;
	if (hostname === "anilist.co") {
		await Promise.all([anilistAnimeMain(ctx), anilistBrowseMain(ctx)]);
		return;
	}

	if (hostname === "myanimelist.net") {
		await Promise.all([myAnimeListAnimeMain(ctx), myAnimeListBrowseMain(ctx)]);
		return;
	}

	await anichartBrowseMain(ctx);
}

export default defineContentScript({
	matches: [
		"https://anilist.co/*",
		"https://anichart.net/*",
		"https://www.anichart.net/*",
		"https://myanimelist.net/*",
	],
	cssInjectionMode: "ui",
	runAt: "document_start",
	main: runSupportedSitesContent,
});
