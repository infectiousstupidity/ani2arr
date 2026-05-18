/** AniList anime-page content surface mount and provider action rendering. */
// src/content/anilist/anime-page/index.tsx

import { useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { browser } from "wxt/browser";
import type { AniListId } from "@/anilist";
import { parseAniListIdOrNull } from "@/anilist/anilist-id";
import { metadataHintFromAniListMetadata } from "@/anilist/metadata-hints";
import type {
	AniListMediaFormat,
	AniListMediaHint,
} from "@/anilist/schemas/media.schema";
import {
	resolveAniListTargetProvider,
} from "@/content/anilist/target-provider";
import {
	createContentEntrypointShell,
	type ContentEntrypointShellContext,
} from "@/content/core/create-content-script-shell";
import { MediaModal, type MediaModalMetadataHint } from "@/features/media-modal";
import { useMediaModalState } from "@/features/media-modal/hooks/use-media-modal-state";
import { useRadarrMediaAction } from "@/features/media-action/use-radarr-media-action";
import { useSonarrMediaAction } from "@/features/media-action/use-sonarr-media-action";
import type { Provider } from "@/providers";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import { useAniListMetadataBatch } from "@/queries";
import { useMappingIdentities } from "@/queries/mapping";
import { usePublicOptions } from "@/queries/options";
import { useA2aBroadcasts } from "@/queries/use-a2a-broadcasts";
import { ConfirmProvider } from "@/shared/hooks/use-confirm";
import { useTheme } from "@/shared/hooks/use-theme";
import "@/shared/styles/base.css";
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
import MediaActions from "./media-actions";
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

interface ContentRootProps {
	target: {
		anilistId: AniListId;
		format: AniListMediaFormat | null;
	};
}

interface AnimeProviderActionProps {
	anilistId: AniListId;
	displayTitle: string;
	providerTitle: string | null;
	metadata: AniListMediaHint | null;
	isConfigured: boolean;
	statusBlocked: boolean;
	portalContainer: HTMLElement | null;
	onOpenSetup(): void;
	onOpenMapping(): void;
}

interface SonarrAnimeActionProps extends AnimeProviderActionProps {
	defaultForm: SonarrFormState | null;
}

interface RadarrAnimeActionProps extends AnimeProviderActionProps {
	defaultForm: RadarrFormState | null;
}

type PublicOptionsData = Awaited<ReturnType<typeof usePublicOptions>>["data"];
type AnimePageModalView = "setup" | "mapping";

interface AnimePageOptionsState {
	sonarrEnabled: boolean;
	radarrEnabled: boolean;
	hasConfiguredProvider: boolean;
}

function trimToNull(value: string | null | undefined): string | null {
	const trimmed = value?.trim() ?? "";
	return trimmed.length > 0 ? trimmed : null;
}

function getMetadataTitle(metadata: AniListMediaHint | null): string | null {
	return (
		trimToNull(metadata?.titles?.english) ??
		trimToNull(metadata?.titles?.romaji) ??
		trimToNull(metadata?.titles?.native)
	);
}

function getModalMetadataHint(input: {
	title: string;
	format: AniListMediaFormat | null;
	metadata: AniListMediaHint | null;
}): MediaModalMetadataHint {
	return {
		title: input.title,
		format: input.metadata?.format ?? input.format,
		coverImage: input.metadata?.coverImage ?? null,
	};
}

function isProviderUiEnabled(
	provider: Provider,
	options: PublicOptionsData,
): boolean {
	return provider === "radarr"
		? (options?.ui?.animePages.radarr.enabled ?? true)
		: (options?.ui?.animePages.sonarr.enabled ?? true);
}

function getAnimePageOptionsState(
	options: PublicOptionsData,
): AnimePageOptionsState {
	const sonarrEnabled = options?.ui?.animePages.sonarr.enabled ?? true;
	const radarrEnabled = options?.ui?.animePages.radarr.enabled ?? true;

	return {
		sonarrEnabled,
		radarrEnabled,
		hasConfiguredProvider: Boolean(
			(sonarrEnabled && options?.providers.sonarr.isConfigured) ||
				(radarrEnabled && options?.providers.radarr.isConfigured),
		),
	};
}

function isProviderConfigured(
	provider: Provider,
	options: PublicOptionsData,
): boolean {
	return options?.providers[provider].isConfigured === true;
}

function isStatusBlocked(input: {
	optionsPending: boolean;
	isConfigured: boolean;
	providerTitle: string | null;
	metadataReadyForStatus: boolean;
}): boolean {
	return (
		input.optionsPending ||
		(input.isConfigured &&
			input.providerTitle === null &&
			!input.metadataReadyForStatus)
	);
}

function openAnimeMediaModal(input: {
	mediaModal: ReturnType<typeof useMediaModalState>;
	anilistId: AniListId;
	provider: Provider;
	initialView: AnimePageModalView;
	metadataHint: MediaModalMetadataHint;
}): void {
	input.mediaModal.open({
		anilistId: input.anilistId,
		provider: input.provider,
		initialView: input.initialView,
		openSource: "content",
		metadataHint: input.metadataHint,
	});
}

function openAnimePageSettings(provider: Provider): void {
	void browser.runtime
		.sendMessage({
			_a2a: true,
			type: "OPEN_OPTIONS_PAGE",
			sectionId: provider,
			timestamp: Date.now(),
		})
		.catch(() => {});
}

function SonarrAnimePageActions({
	anilistId,
	displayTitle,
	providerTitle,
	metadata,
	isConfigured,
	defaultForm,
	statusBlocked,
	portalContainer,
	onOpenSetup,
	onOpenMapping,
}: SonarrAnimeActionProps): ReactElement {
	const mediaAction = useSonarrMediaAction({
		anilistId,
		displayTitle,
		providerTitle,
		metadata,
		isConfigured,
		defaultForm,
		enabled: true,
		statusBlocked,
		forceVerify: true,
		priority: "high",
		onConfigure: () => openAnimePageSettings("sonarr"),
		onOpenMapping,
	});

	return (
		<MediaActions
			provider="sonarr"
			state={mediaAction.status.state}
			errorSource={mediaAction.status.errorSource}
			hasMapping={mediaAction.status.hasMapping}
			disabled={mediaAction.status.disabled}
			externalHref={mediaAction.externalHref}
			onPrimaryAction={mediaAction.runPrimaryAction}
			onOpenSetup={onOpenSetup}
			onOpenMapping={onOpenMapping}
			portalContainer={portalContainer ?? undefined}
		/>
	);
}

function RadarrAnimePageActions({
	anilistId,
	displayTitle,
	providerTitle,
	metadata,
	isConfigured,
	defaultForm,
	statusBlocked,
	portalContainer,
	onOpenSetup,
	onOpenMapping,
}: RadarrAnimeActionProps): ReactElement {
	const mediaAction = useRadarrMediaAction({
		anilistId,
		displayTitle,
		providerTitle,
		metadata,
		isConfigured,
		defaultForm,
		enabled: true,
		statusBlocked,
		forceVerify: true,
		priority: "high",
		onConfigure: () => openAnimePageSettings("radarr"),
		onOpenMapping,
	});

	return (
		<MediaActions
			provider="radarr"
			state={mediaAction.status.state}
			errorSource={mediaAction.status.errorSource}
			hasMapping={mediaAction.status.hasMapping}
			disabled={mediaAction.status.disabled}
			externalHref={mediaAction.externalHref}
			onPrimaryAction={mediaAction.runPrimaryAction}
			onOpenSetup={onOpenSetup}
			onOpenMapping={onOpenMapping}
			portalContainer={portalContainer ?? undefined}
		/>
	);
}

export function ContentRoot({ target }: ContentRootProps): ReactElement | null {
	const { anilistId } = target;
	const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
	useTheme({ current: hostElement });
	useA2aBroadcasts();

	const mediaModal = useMediaModalState();
	const publicOptionsQuery = usePublicOptions();
	const options = publicOptionsQuery.data;
	const optionState = getAnimePageOptionsState(options);
	const metadataBatch = useAniListMetadataBatch([anilistId], {
		enabled: optionState.hasConfiguredProvider,
	});
	const mappingIdentities = useMappingIdentities([anilistId], {
		enabled: optionState.sonarrEnabled || optionState.radarrEnabled,
	});
	const metadata = metadataHintFromAniListMetadata(
		metadataBatch.data?.metadata?.[0] ?? null,
	);
	const providerTitle = getMetadataTitle(metadata);
	const displayTitle = providerTitle ?? `AniList #${anilistId}`;
	const provider = resolveAniListTargetProvider({
		anilistId,
		format: target.format,
		mappedIdentities: mappingIdentities.data ?? [],
	});

	if (!provider || !isProviderUiEnabled(provider, options)) {
		return null;
	}

	const isConfigured = isProviderConfigured(provider, options);
	const metadataReadyForStatus =
		!optionState.hasConfiguredProvider ||
		metadataBatch.isFetched ||
		metadataBatch.isError;
	const statusBlocked = isStatusBlocked({
		optionsPending: publicOptionsQuery.isPending,
		isConfigured,
		providerTitle,
		metadataReadyForStatus,
	});
	const metadataHint = getModalMetadataHint({
		title: displayTitle,
		format: target.format,
		metadata,
	});
	const openSetup = () => {
		openAnimeMediaModal({
			mediaModal,
			anilistId,
			provider,
			initialView: "setup",
			metadataHint,
		});
	};
	const openMapping = () => {
		openAnimeMediaModal({
			mediaModal,
			anilistId,
			provider,
			initialView: "mapping",
			metadataHint,
		});
	};

	return (
		<div ref={setHostElement} style={{ width: "100%" }}>
			<ConfirmProvider portalContainer={hostElement ?? null}>
				{provider === "sonarr" ? (
					<SonarrAnimePageActions
						anilistId={anilistId}
						displayTitle={displayTitle}
						providerTitle={providerTitle}
						metadata={metadata}
						isConfigured={isConfigured}
						defaultForm={options?.providers.sonarr.defaults ?? null}
						statusBlocked={statusBlocked}
						portalContainer={hostElement}
						onOpenSetup={openSetup}
						onOpenMapping={openMapping}
					/>
				) : (
					<RadarrAnimePageActions
						anilistId={anilistId}
						displayTitle={displayTitle}
						providerTitle={providerTitle}
						metadata={metadata}
						isConfigured={isConfigured}
						defaultForm={options?.providers.radarr.defaults ?? null}
						statusBlocked={statusBlocked}
						portalContainer={hostElement}
						onOpenSetup={openSetup}
						onOpenMapping={openMapping}
					/>
				)}
				{hostElement && mediaModal.state ? (
					<MediaModal
						key={`modal-${mediaModal.state.anilistId}`}
						state={mediaModal.state}
						onClose={mediaModal.close}
						container={hostElement}
					/>
				) : null}
			</ConfirmProvider>
		</div>
	);
}

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
	signal,
	isCurrent,
}: ContentEntrypointShellContext): Promise<void> {
	const idMatch = new URL(url).pathname.match(/\/anime\/(\d+)/);
	const anilistId = parseAniListIdOrNull(
		idMatch?.[1] ? Number.parseInt(idMatch[1], 10) : null,
	);
	if (!anilistId) return;

	await Promise.all([
		waitForElement(ACTIONS_SELECTOR, { signal }),
		waitForElement(SIDEBAR_SELECTOR, { signal }),
	]);

	if (!isCurrent()) return;

	stopAnchorKeeper?.();
	stopAnchorKeeper = startAnchorKeeper();
	const mountTarget = ensureActionsAnchor();
	if (!mountTarget) return;

	const target: ContentRootProps["target"] = {
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

// eslint-disable-next-line react-refresh/only-export-components -- Content scripts export their WXT entrypoint.
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
