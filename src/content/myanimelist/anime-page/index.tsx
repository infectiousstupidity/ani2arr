/** MyAnimeList anime-page content mount using MAL identity and AniBridge crosswalks. */
// src/content/myanimelist/anime-page/index.tsx

import { QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { createRoot, type Root } from "react-dom/client";
import {
	createShadowRootUi,
	type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";
import {
	createContentEntrypointShell,
	type ContentEntrypointShellContext,
} from "@/content/core/create-content-script-shell";
import { ContentRoot, type AnimePageTarget } from "@/content/anime-page/root";
import "@/content/anime-page/style.css";
import "@/shared/styles/content-base.css";
import { readMyAnimeListIdFromUrl } from "@/myanimelist/url";
import { createExtensionQueryClient } from "@/queries/query-client";
import { getAni2arrApi } from "@/rpc";
import { ExtensionErrorBoundary } from "@/shared/ui/feedback/extension-error-boundary";
import { logger } from "@/shared/utils/logger";
import {
	ANCHOR_ID,
	TITLE_SELECTOR,
	UI_NAME,
	attachSizeSync,
	ensureActionsAnchor,
	readFormatFromPage,
	readTitleFromPage,
	removeLayoutArtifacts,
	waitForElement,
} from "./layout";

const log = logger.create("MyAnimeList Content");
const queryClient = createExtensionQueryClient();
const MAL_PAGE = new MatchPattern("https://myanimelist.net/*");

let ui: ShadowRootContentScriptUi<Root> | null = null;
let stopSizeSync: (() => void) | null = null;

async function getAniListIdForMount(
	source: AnimePageTarget["source"],
): Promise<AnimePageTarget["anilistId"] | null> {
	const api = getAni2arrApi();
	const existing = await api.getAniListIdForSource(source);
	if (existing !== null) return existing;

	await api.initMappings();
	return api.getAniListIdForSource(source);
}

const removeAnimeUI = (): void => {
	try {
		ui?.remove();
	} catch (error) {
		log.error("Error removing MAL UI:", error);
	}
	ui = null;
	stopSizeSync?.();
	stopSizeSync = null;
	removeLayoutArtifacts();
};

const isAnimePageUrl = (url: string): boolean =>
	readMyAnimeListIdFromUrl(url) !== null;

const isAnimePageShellEligible = async ({
	url,
	publicOptions,
	signal,
}: Pick<
	ContentEntrypointShellContext,
	"url" | "publicOptions" | "signal"
>): Promise<boolean> => {
	if (!MAL_PAGE.includes(url) || !isAnimePageUrl(url)) return false;
	if (
		(publicOptions.ui?.animePages.sonarr.enabled ?? true) === false &&
		(publicOptions.ui?.animePages.radarr.enabled ?? true) === false &&
		(publicOptions.ui?.animePages.seerr.enabled ?? true) === false
	) {
		return false;
	}

	await waitForElement(TITLE_SELECTOR, { signal });
	return true;
};

async function mountAnimePageUI({
	ctx,
	url,
	isCurrent,
}: ContentEntrypointShellContext): Promise<void> {
	const malId = readMyAnimeListIdFromUrl(url);
	if (malId === null) return;

	const source = { source: "mal", id: malId } as const;
	const anilistId = await getAniListIdForMount(source);
	if (anilistId === null) return;

	const mountTarget = ensureActionsAnchor();
	if (!mountTarget) return;

	const target: AnimePageTarget = {
		source,
		anilistId,
		format: readFormatFromPage(document),
		title: readTitleFromPage(document),
	};

	if (!isCurrent()) {
		removeAnimeUI();
		return;
	}

	if (ui) {
		ui.remove();
		stopSizeSync?.();
		ui = null;
		stopSizeSync = null;
	}

	const nextUi = await createShadowRootUi(ctx, {
		name: UI_NAME,
		mode: "closed",
		position: "inline",
		anchor: `#${ANCHOR_ID}`,
		append: "last",
		onMount: (uiContainer, _shadow, shadowHost): Root => {
			stopSizeSync = attachSizeSync(shadowHost);
			const root = createRoot(uiContainer);
			root.render(
				<ExtensionErrorBoundary scope="myanimelist-anime-root">
					<QueryClientProvider client={queryClient}>
						<Tooltip.Provider>
							<ContentRoot target={target} />
						</Tooltip.Provider>
					</QueryClientProvider>
				</ExtensionErrorBoundary>,
			);
			return root;
		},
		onRemove: (mounted?: Root) => {
			mounted?.unmount();
			stopSizeSync?.();
			stopSizeSync = null;
		},
	});

	if (!isCurrent()) {
		nextUi.remove();
		return;
	}

	ui = nextUi;
	ui.autoMount();
}

export const main = createContentEntrypointShell({
	isEligible: isAnimePageShellEligible,
	mount: mountAnimePageUI,
	remove: removeAnimeUI,
	onError: (error, phase, url) => {
		log.error(
			`MyAnimeList anime page shell failed during ${phase}.`,
			{ url },
			error,
		);
	},
});
