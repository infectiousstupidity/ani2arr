/** MyAnimeList anime-page content mount using MAL identity and AniBridge crosswalks. */
// src/content/myanimelist/anime-page/index.tsx

import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import {
	createShadowRootUi,
	type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";
import { type AnimePageTarget, ContentRoot } from "@/content/anime-page/root";
import {
	type ContentEntrypointShellContext,
	createContentEntrypointShell,
} from "@/content/core/create-content-script-shell";
import { readMyAnimeListIdFromUrl } from "@/myanimelist/url";
import { createExtensionQueryClient } from "@/queries/query-client";
import { queryKeys } from "@/queries/query-keys";
import { ExtensionErrorBoundary } from "@/shared/ui/feedback/extension-error-boundary";
import { logger } from "@/shared/utils/logger";
import { ACTIONS_HOST_SELECTOR, readAnimePageData, UI_NAME } from "./layout";

const log = logger.create("MyAnimeList Content");
const queryClient = createExtensionQueryClient();
const MAL_PAGE = new MatchPattern("https://myanimelist.net/*");

let ui: ShadowRootContentScriptUi<Root> | null = null;

const removeAnimeUI = (): void => {
	try {
		ui?.remove();
	} catch (error) {
		log.error("Error removing MAL UI:", error);
	}
	ui = null;
};

const isAnimePageUrl = (url: string): boolean =>
	readMyAnimeListIdFromUrl(url) !== null;

const isAnimePageShellEligible = ({
	url,
	publicOptions,
}: Pick<ContentEntrypointShellContext, "url" | "publicOptions">): boolean => {
	if (!MAL_PAGE.includes(url) || !isAnimePageUrl(url)) return false;

	return !(
		(publicOptions.ui?.animePages.sonarr.enabled ?? true) === false &&
		(publicOptions.ui?.animePages.radarr.enabled ?? true) === false &&
		(publicOptions.ui?.animePages.seerr.enabled ?? true) === false
	);
};

async function mountAnimePageUI({
	ctx,
	url,
	isCurrent,
	publicOptions,
}: ContentEntrypointShellContext): Promise<void> {
	queryClient.setQueryData(queryKeys.publicOptions(), publicOptions);

	const malId = readMyAnimeListIdFromUrl(url);
	if (malId === null || !isCurrent()) return;

	const source = { source: "mal", id: malId } as const;

	ui?.remove();
	ui = null;

	const nextUi = await createShadowRootUi(ctx, {
		name: UI_NAME,
		mode: "closed",
		position: "inline",
		anchor: ACTIONS_HOST_SELECTOR,
		append: "after",
		onMount: (uiContainer, _shadow, shadowHost): Root => {
			const pageData = readAnimePageData(document);
			const target: AnimePageTarget = {
				source,
				...pageData,
			};

			Object.assign(uiContainer.style, {
				width: "300px",
				maxWidth: "100%",
			});
			Object.assign(shadowHost.style, {
				display: "block",
				position: "static",
				clear: "both",
				width: "100%",
				maxWidth: "300px",
				margin: "8px 0 0",
			});

			const root = createRoot(uiContainer);
			root.render(
				<ExtensionErrorBoundary scope="myanimelist-anime-root">
					<QueryClientProvider client={queryClient}>
						<Tooltip.Provider>
							<ContentRoot target={target} compactActions />
						</Tooltip.Provider>
					</QueryClientProvider>
				</ExtensionErrorBoundary>,
			);
			return root;
		},
		onRemove: (mounted?: Root) => {
			mounted?.unmount();
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
