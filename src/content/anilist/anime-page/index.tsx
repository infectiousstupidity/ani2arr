/** AniList anime-page content entrypoint mount and cleanup orchestration. */
// src/content/anilist/anime-page/index.tsx

import { createRoot, type Root } from "react-dom/client";
import {
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { parseAniListIdOrNull } from "@/anilist/anilist-id";
import {
	createContentEntrypointShell,
	type ContentEntrypointShellContext,
} from "@/content/core/create-content-script-shell";
import "@/shared/styles/content-base.css";
import { ExtensionErrorBoundary } from "@/shared/ui/feedback/extension-error-boundary";
import { logger } from "@/shared/utils/logger";
import {
	createShadowRootUi,
	type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";
import {
	ACTIONS_SELECTOR,
	ANCHOR_ID,
	SIDEBAR_SELECTOR,
	UI_NAME,
	attachSizeSync,
	ensureActionsAnchor,
	removeLayoutArtifacts,
	readFormatFromSidebar,
	startAnchorKeeper,
	waitForElement,
} from "./layout";
import { ContentRoot, type AnimePageTarget } from "./root";
import "./style.css";

const log = logger.create("AniList Content");

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000,
			gcTime: 30 * 60 * 1000,
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

const ANIME_PAGE = new MatchPattern("*://anilist.co/anime/*");

let ui: ShadowRootContentScriptUi<Root> | null = null;
let stopAnchorKeeper: (() => void) | null = null;
let stopSizeSync: (() => void) | null = null;

const removeAnimeUI = (): void => {
	try {
		ui?.remove();
	} catch (error) {
		log.error("Error removing UI:", error);
	}
	ui = null;
	stopAnchorKeeper?.();
	stopAnchorKeeper = null;
	stopSizeSync?.();
	stopSizeSync = null;
	removeLayoutArtifacts();
};

const isAnimePageShellEligible = async ({
	url,
	publicOptions,
	signal,
}: Pick<
	ContentEntrypointShellContext,
	"url" | "publicOptions" | "signal"
>): Promise<boolean> => {
	if (!ANIME_PAGE.includes(url)) {
		return false;
	}

	if (
		(publicOptions.ui?.animePages.sonarr.enabled ?? true) === false &&
		(publicOptions.ui?.animePages.radarr.enabled ?? true) === false
	) {
		return false;
	}

	await Promise.all([
		waitForElement(ACTIONS_SELECTOR, { signal }),
		waitForElement(SIDEBAR_SELECTOR, { signal }),
	]);
	return true;
};

async function mountAnimePageUI({
	ctx,
	url,
	isCurrent,
}: ContentEntrypointShellContext): Promise<void> {
	const idMatch = new URL(url).pathname.match(/\/anime\/(\d+)/);
	const anilistId = parseAniListIdOrNull(
		idMatch?.[1] ? Number.parseInt(idMatch[1], 10) : null,
	);
	if (!anilistId) return;

	stopAnchorKeeper?.();
	stopAnchorKeeper = startAnchorKeeper();
	const mountTarget = ensureActionsAnchor();
	if (!mountTarget) return;

	const target: AnimePageTarget = {
		anilistId,
		format: readFormatFromSidebar(document),
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
		position: "inline",
		anchor: `#${ANCHOR_ID}`,
		append: "last",
		onMount: (
			uiContainer: HTMLElement,
			_shadow: ShadowRoot,
			shadowHost: HTMLElement,
		): Root => {
			stopSizeSync = attachSizeSync(shadowHost);
			const root = createRoot(uiContainer);
			root.render(
				<ExtensionErrorBoundary scope="anilist-anime-root">
					<QueryClientProvider client={queryClient}>
						<TooltipProvider>
							<ContentRoot target={target} />
						</TooltipProvider>
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
			`AniList anime page shell failed during ${phase}.`,
			{ url },
			error,
		);
	},
});
