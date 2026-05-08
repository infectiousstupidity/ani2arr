/** AniList anime-page surface composition and mount orchestration. */
// src/content/anilist/anime-page/index.tsx
/* eslint-disable complexity -- Existing page root coordinates several AniList surface workflows. */

import React, { useState } from "react";
import ReactDOM, { Root } from "react-dom/client";
import {
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { browser } from "wxt/browser";
import type { AniListId } from "@/anilist";
import { parseAniListIdOrNull } from "@/anilist/anilist-id";
import { getAni2arrApi } from "@/rpc";
import type {
	CheckMovieStatusResponse,
	CheckSeriesStatusResponse,
} from "@/rpc/types";
import {
	buildMovieStatusResponseFromLibraryStatus,
	buildSeriesStatusResponseFromLibraryStatus,
} from "@/rpc/status-response-adapter";
import { ExtensionErrorBoundary } from "@/shared/ui/feedback/extension-error-boundary";
import { useTheme } from "@/shared/hooks/use-theme";
import { useAniListMetadataBatch } from "@/queries";
import {
	createContentEntrypointShell,
	type ContentEntrypointShellContext,
} from "@/content/core/create-content-script-shell";
import { useA2aBroadcasts } from "@/queries/use-a2a-broadcasts";
import { useMappingIdentities } from "@/queries/mapping";
import { usePublicOptions } from "@/queries/options";
import {
	defaultRadarrFormState,
	defaultSonarrFormState,
} from "@/options";
import MediaActions from "./media-actions";
import { logger } from "@/shared/utils/logger";
import { metadataHintFromAniListMetadata } from "@/anilist/metadata-hints";
import {
	getProviderRouteSlug,
	type ProviderRouteSlugSource,
} from "@/providers/provider-route-slug";
import { getProviderBaseUrl } from "@/options/provider-config";
import { resolveProviderForAniListFormat } from "@/providers/provider-routing";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import type { HostMediaTarget } from "@/content/browse/types";
import type { EffectiveMappingPresence } from "@/mapping/queries/mapping-identities";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import {
	useAddMovie,
	useMovieLibraryStatus,
	useMovieStatus,
} from "@/queries/radarr";
import {
	useAddSeries,
	useSeriesLibraryStatus,
	useSeriesStatus,
} from "@/queries/sonarr";
import { MediaModal } from "@/features/media-modal";
import {
	createLaunchSnapshot,
	type RadarrLaunchSnapshot,
	type SonarrLaunchSnapshot,
} from "@/features/media-modal/launch-snapshot";
import { useMediaModalState } from "@/features/media-modal/hooks/use-media-modal-state";
import {
	buildProviderActionModel,
	deriveProviderActionSummary,
	type ProviderActionModel,
} from "@/features/provider-action";
import { buildProviderOpenUrl } from "@/providers/provider-links";
import "@/shared/styles/base.css";
import "./style.css";
import {
	createShadowRootUi,
	type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";
import { ConfirmProvider } from "@/shared/hooks/use-confirm";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type Provider,
} from "@/providers";
import {
	ACTIONS_SELECTOR,
	ANCHOR_ID,
	SIDEBAR_SELECTOR,
	UI_NAME,
	attachSizeSync,
	ensureActionsAnchor,
	removeLayoutArtifacts,
	resolveAnimePageProvider,
	readFormatFromSidebar,
	shouldSkipByFormat,
	startAnchorKeeper,
	waitForElement,
} from "./layout";

const log = logger.create("AniList Content");

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000, // 5 minutes
			gcTime: 30 * 60 * 1000, // 30 minutes
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

const ANIME_PAGE = new MatchPattern("*://anilist.co/anime/*");

/* -------------------------------- React UI -------------------------------- */

interface ContentRootProps {
	target: HostMediaTarget;
}

type PublicOptionsData = Awaited<ReturnType<typeof usePublicOptions>>["data"];
type AnimePageStatusData =
	| CheckMovieStatusResponse
	| CheckSeriesStatusResponse;
type AnimePageStatusQuery = {
	data: AnimePageStatusData | undefined;
	isError: boolean;
	fetchStatus: ReturnType<typeof useMovieStatus>["fetchStatus"];
	refetch: (
		options?: Parameters<ReturnType<typeof useMovieStatus>["refetch"]>[0],
	) => Promise<unknown>;
};

interface AnimePageProviderSelection {
	statusQuery: AnimePageStatusQuery;
	seriesStatusData: CheckSeriesStatusResponse | undefined;
	movieStatusData: CheckMovieStatusResponse | undefined;
	providerStatusData:
		| CheckMovieStatusResponse
		| CheckSeriesStatusResponse
		| undefined;
	hasMapping: boolean;
	isAdding: boolean;
	hasAddError: boolean;
	addSucceeded: boolean;
}

interface AnimePageActionViewModel {
	uiEnabled: boolean;
	providerSelection: AnimePageProviderSelection;
	actionModel: ProviderActionModel;
	externalHref: string | null;
}

function getMappedIdentityFromIdentities(
	identities: readonly EffectiveMappingPresence[],
	anilistId: AniListId,
): EffectiveMappingPresence | null {
	return (
		identities.find(
			(identity) =>
				identity.anilistId === anilistId &&
				identity.providerMappingState === "mapped" &&
				identity.providerId !== null,
		) ?? null
	);
}

function getMappedProviderFromIdentities(
	identities: readonly EffectiveMappingPresence[],
	anilistId: AniListId,
): Provider | null {
	return getMappedIdentityFromIdentities(identities, anilistId)?.provider ?? null;
}

async function resolveMappedProviderForAniListId(
	anilistId: AniListId,
): Promise<Provider | null> {
	try {
		return getMappedProviderFromIdentities(
			await getAni2arrApi().getMappingIdentities([anilistId]),
			anilistId,
		);
	} catch {
		return null;
	}
}

function createAnimePageLaunchSnapshot(input: {
	provider: "radarr";
	status: CheckMovieStatusResponse | null | undefined;
}): RadarrLaunchSnapshot;
function createAnimePageLaunchSnapshot(input: {
	provider: "sonarr";
	status: CheckSeriesStatusResponse | null | undefined;
}): SonarrLaunchSnapshot;
function createAnimePageLaunchSnapshot(input:
	| {
			provider: "radarr";
			status: CheckMovieStatusResponse | null | undefined;
	  }
	| {
			provider: "sonarr";
			status: CheckSeriesStatusResponse | null | undefined;
	  },
): RadarrLaunchSnapshot | SonarrLaunchSnapshot {
	const source = input.status ? "live" : "unknown";
	const verifiedAt = input.status ? Date.now() : null;

	if (input.provider === "radarr") {
		return createLaunchSnapshot({
			provider: "radarr",
			status: input.status ?? null,
			source,
			verifiedAt,
		});
	}

	return createLaunchSnapshot({
		provider: "sonarr",
		status: input.status ?? null,
		source,
		verifiedAt,
	});
}

function isProviderUiEnabled(
	provider: Provider,
	options: PublicOptionsData,
): boolean {
	return provider === "radarr"
		? (options?.ui?.animePages.radarr.enabled ?? true)
		: (options?.ui?.animePages.sonarr.enabled ?? true);
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

function quickAddAnimePageProvider(input: {
	provider: Provider;
	isConfigured: boolean;
	defaults: SonarrFormState | RadarrFormState;
	anilistId: AniListId;
	title: string;
	resolvedMetadata: AniListMediaHint | null;
	providerStatusData: AnimePageStatusData | undefined;
	addSeriesMutation: ReturnType<typeof useAddSeries>;
	addMovieMutation: ReturnType<typeof useAddMovie>;
}): void {
	if (!input.isConfigured) {
		openAnimePageSettings(input.provider);
		return;
	}

	if (input.provider === "radarr") {
		const tmdbId = parseTmdbIdOrNull(input.providerStatusData?.providerId);
		if (tmdbId === null) {
			return;
		}

		input.addMovieMutation.mutate({
			anilistId: input.anilistId,
			tmdbId,
			title: input.title,
			primaryTitleHint: input.title,
			metadata: input.resolvedMetadata,
			form: { ...(input.defaults as RadarrFormState) },
		});
		return;
	}

	const tvdbId = parseTvdbIdOrNull(input.providerStatusData?.providerId);
	if (tvdbId === null) {
		return;
	}

	input.addSeriesMutation.mutate({
		anilistId: input.anilistId,
		tvdbId,
		title: input.title,
		primaryTitleHint: input.title,
		metadata: input.resolvedMetadata,
		form: { ...(input.defaults as SonarrFormState) },
	});
}

function getAnimePageProviderRouteSlug(input: {
	provider: Provider;
	movieStatusData: CheckMovieStatusResponse | undefined;
	seriesStatusData: CheckSeriesStatusResponse | undefined;
	addMovieMutation: ReturnType<typeof useAddMovie>;
	addSeriesMutation: ReturnType<typeof useAddSeries>;
}): string | null {
	if (input.provider === "radarr") {
		return getProviderRouteSlug(
			"radarr",
			(input.movieStatusData?.movie ??
				input.addMovieMutation.data ??
				null) as ProviderRouteSlugSource | null,
		);
	}

	return getProviderRouteSlug(
		"sonarr",
		(input.seriesStatusData?.series ??
			input.addSeriesMutation.data ??
			null) as ProviderRouteSlugSource | null,
	);
}

function getAnimePageDefaults(input: {
	provider: Provider | null;
	options: PublicOptionsData;
}): SonarrFormState | RadarrFormState {
	if (input.provider === "radarr") {
		return input.options?.providers.radarr.defaults ?? defaultRadarrFormState();
	}

	return input.options?.providers.sonarr.defaults ?? defaultSonarrFormState();
}

function selectAnimePageProviderSelection(input: {
	provider: Provider;
	movieStatusQuery: AnimePageStatusQuery;
	seriesStatusQuery: AnimePageStatusQuery;
	addMovieMutation: ReturnType<typeof useAddMovie>;
	addSeriesMutation: ReturnType<typeof useAddSeries>;
}): AnimePageProviderSelection {
	if (input.provider === "radarr") {
		const providerStatusData = input.movieStatusQuery.data as
			| CheckMovieStatusResponse
			| undefined;

		return {
			statusQuery: input.movieStatusQuery,
			seriesStatusData: undefined,
			movieStatusData: providerStatusData,
			providerStatusData,
			hasMapping:
				providerStatusData?.providerId != null ||
				input.addMovieMutation.data?.tmdbId != null,
			isAdding: input.addMovieMutation.isPending,
			hasAddError: input.addMovieMutation.isError,
			addSucceeded: input.addMovieMutation.isSuccess,
		};
	}

	const providerStatusData = input.seriesStatusQuery.data as
		| CheckSeriesStatusResponse
		| undefined;

	return {
		statusQuery: input.seriesStatusQuery,
		seriesStatusData: providerStatusData,
		movieStatusData: undefined,
		providerStatusData,
		hasMapping:
			providerStatusData?.providerId != null ||
			input.addSeriesMutation.data?.tvdbId != null,
		isAdding: input.addSeriesMutation.isPending,
		hasAddError: input.addSeriesMutation.isError,
		addSucceeded: input.addSeriesMutation.isSuccess,
	};
}

function runAnimePagePrimaryAction(input: {
	primaryAction: ProviderActionModel["primaryAction"];
	provider: Provider;
	mediaModal: ReturnType<typeof useMediaModalState>;
	providerStatusData:
		| CheckMovieStatusResponse
		| CheckSeriesStatusResponse
		| undefined;
	optionsError: boolean;
	refetchOptions: ReturnType<typeof usePublicOptions>["refetch"];
	refetchStatus: AnimePageStatusQuery["refetch"];
	isConfigured: boolean;
	defaults: SonarrFormState | RadarrFormState;
	anilistId: AniListId;
	title: string;
	resolvedMetadata: AniListMediaHint | null;
	addSeriesMutation: ReturnType<typeof useAddSeries>;
	addMovieMutation: ReturnType<typeof useAddMovie>;
}): void {
	switch (input.primaryAction) {
		case "configure": {
			openAnimePageSettings(input.provider);
			return;
		}
		case "open-mapping": {
			if (input.provider === "radarr") {
				input.mediaModal.open({
					anilistId: input.anilistId,
					provider: "radarr",
					initialView: "mapping",
					openSource: "content",
					launchTitle: input.title,
					launchMetadata: input.resolvedMetadata,
					launchSnapshot: createAnimePageLaunchSnapshot({
						provider: "radarr",
						status: input.providerStatusData as
							| CheckMovieStatusResponse
							| undefined,
					}),
				});
				return;
			}

			input.mediaModal.open({
				anilistId: input.anilistId,
				provider: "sonarr",
				initialView: "mapping",
				openSource: "content",
				launchTitle: input.title,
				launchMetadata: input.resolvedMetadata,
				launchSnapshot: createAnimePageLaunchSnapshot({
					provider: "sonarr",
					status: input.providerStatusData as
						| CheckSeriesStatusResponse
						| undefined,
				}),
			});
			return;
		}
		case "retry-status": {
			if (input.optionsError) {
				void input.refetchOptions().catch(() => {});
				return;
			}

			void input.refetchStatus({ throwOnError: false }).catch(() => {});
			return;
		}
		case "quick-add":
		case "retry-add": {
			quickAddAnimePageProvider({
				provider: input.provider,
				isConfigured: input.isConfigured,
				defaults: input.defaults,
				anilistId: input.anilistId,
				title: input.title,
				resolvedMetadata: input.resolvedMetadata,
				providerStatusData: input.providerStatusData,
				addSeriesMutation: input.addSeriesMutation,
				addMovieMutation: input.addMovieMutation,
			});
			return;
		}
		default: {
			return;
		}
	}
}

function shouldEnableAnimePageStatusQuery(input: {
	target: Provider;
	provider: Provider | null;
	isConfigured: boolean;
}): boolean {
	return input.isConfigured && input.provider === input.target;
}

function buildAnimePageActionViewModel(input: {
	provider: Provider;
	options: PublicOptionsData;
	optionsPending: boolean;
	optionsError: boolean;
	title: string;
	isConfigured: boolean;
	movieStatusQuery: AnimePageStatusQuery;
	seriesStatusQuery: AnimePageStatusQuery;
	addMovieMutation: ReturnType<typeof useAddMovie>;
	addSeriesMutation: ReturnType<typeof useAddSeries>;
}): AnimePageActionViewModel {
	const providerBaseUrl = getProviderBaseUrl(input.provider, input.options);
	const providerSelection = selectAnimePageProviderSelection({
		provider: input.provider,
		movieStatusQuery: input.movieStatusQuery,
		seriesStatusQuery: input.seriesStatusQuery,
		addMovieMutation: input.addMovieMutation,
		addSeriesMutation: input.addSeriesMutation,
	});
	const actionSummary = deriveProviderActionSummary({
		isConfigured: input.isConfigured,
		isChecking:
			input.optionsPending ||
			(providerSelection.statusQuery.fetchStatus === "fetching" &&
				!providerSelection.statusQuery.data),
		providerMappingState:
			providerSelection.providerStatusData?.providerMappingState,
		isInLibrary: providerSelection.providerStatusData?.isInLibrary ?? null,
		hasStatusError: input.optionsError || providerSelection.statusQuery.isError,
		isAdding: providerSelection.isAdding,
		hasAddError: providerSelection.hasAddError,
		addSucceeded: providerSelection.addSucceeded,
		hasMapping: providerSelection.hasMapping,
	});
	const providerRouteSlug = getAnimePageProviderRouteSlug({
		provider: input.provider,
		movieStatusData: providerSelection.movieStatusData,
		seriesStatusData: providerSelection.seriesStatusData,
		addMovieMutation: input.addMovieMutation,
		addSeriesMutation: input.addSeriesMutation,
	});
	const resolvedSearchTerm =
		providerSelection.statusQuery.data?.successfulSynonym ?? input.title;
	const externalHref = buildProviderOpenUrl({
		provider: input.provider,
		baseUrl: providerBaseUrl,
		isInLibrary:
			actionSummary.state === "in-library" && Boolean(providerRouteSlug),
		...(providerRouteSlug ? { providerRouteSlug } : {}),
		...(resolvedSearchTerm ? { searchTerm: resolvedSearchTerm } : {}),
	});

	return {
		uiEnabled: isProviderUiEnabled(input.provider, input.options),
		providerSelection,
		actionModel: buildProviderActionModel({
			summary: actionSummary,
			hasExternalHref: Boolean(externalHref),
			canQuickAdd: true,
		}),
		externalHref,
	};
}

export const ContentRoot: React.FC<ContentRootProps> = ({
	target,
}) => {
	const { anilistId } = target;
	const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
	useTheme({ current: hostElement });
	useA2aBroadcasts();

	const mediaModal = useMediaModalState();
	const publicOptionsQuery = usePublicOptions();
	const {
		data: options,
		isPending: optionsPending,
		isError: optionsError,
	} = publicOptionsQuery;
	const hasConfiguredProvider = Boolean(
		options?.providers.sonarr.isConfigured ||
		options?.providers.radarr.isConfigured,
	);
	const metadataBatch = useAniListMetadataBatch([anilistId], {
		enabled: hasConfiguredProvider,
	});
	const mappingIdentities = useMappingIdentities([anilistId], {
		enabled: true,
	});
	const canonicalMetadata = metadataHintFromAniListMetadata(
		metadataBatch.data?.metadata?.[0] ?? null,
	);
	const resolvedMetadata = canonicalMetadata;
	const mappedIdentity = getMappedIdentityFromIdentities(
		mappingIdentities.data ?? [],
		anilistId,
	);
	const provider =
		mappedIdentity?.provider ??
		resolveProviderForAniListFormat(target.format);
	const mappedSonarrProviderId =
		mappedIdentity?.provider === "sonarr"
			? parseTvdbIdOrNull(mappedIdentity.providerId)
			: null;
	const mappedRadarrProviderId =
		mappedIdentity?.provider === "radarr"
			? parseTmdbIdOrNull(mappedIdentity.providerId)
			: null;
	const title =
		resolvedMetadata?.titles?.english?.trim() ||
		resolvedMetadata?.titles?.romaji?.trim() ||
		resolvedMetadata?.titles?.native?.trim() ||
		`AniList #${anilistId}`;
	const isConfigured = provider
		? options?.providers[provider]?.isConfigured === true
		: false;
	const defaults = getAnimePageDefaults({ provider, options });

	const seriesStatusQuery = useSeriesStatus(
		{ anilistId, title, metadata: resolvedMetadata },
		{
			enabled: shouldEnableAnimePageStatusQuery({
				target: "sonarr",
				provider,
				isConfigured,
			}) && mappedIdentity === null,
			force_verify: true,
			priority: "high",
		},
	);
	const movieStatusQuery = useMovieStatus(
		{ anilistId, title, metadata: resolvedMetadata },
		{
			enabled: shouldEnableAnimePageStatusQuery({
				target: "radarr",
				provider,
				isConfigured,
			}) && mappedIdentity === null,
			force_verify: true,
			priority: "high",
		},
	);
	const seriesLibraryStatusQuery = useSeriesLibraryStatus(
		mappedSonarrProviderId,
		{
			enabled:
				isConfigured && provider === "sonarr" && mappedSonarrProviderId !== null,
			forceVerify: true,
		},
	);
	const movieLibraryStatusQuery = useMovieLibraryStatus(
		mappedRadarrProviderId,
		{
			enabled:
				isConfigured && provider === "radarr" && mappedRadarrProviderId !== null,
			forceVerify: true,
		},
	);
	let adaptedSeriesStatusData: CheckSeriesStatusResponse | undefined;
	if (
		mappedIdentity?.provider === "sonarr" &&
		mappedSonarrProviderId !== null &&
		seriesLibraryStatusQuery.data
	) {
		adaptedSeriesStatusData = buildSeriesStatusResponseFromLibraryStatus({
			providerId: mappedSonarrProviderId,
			...(mappedIdentity.mappingSource
				? { mappingSource: mappedIdentity.mappingSource }
				: {}),
			...(mappedIdentity.mappingReason
				? { mappingReason: mappedIdentity.mappingReason }
				: {}),
			libraryStatus: seriesLibraryStatusQuery.data,
		});
	}
	let adaptedMovieStatusData: CheckMovieStatusResponse | undefined;
	if (
		mappedIdentity?.provider === "radarr" &&
		mappedRadarrProviderId !== null &&
		movieLibraryStatusQuery.data
	) {
		adaptedMovieStatusData = buildMovieStatusResponseFromLibraryStatus({
			providerId: mappedRadarrProviderId,
			...(mappedIdentity.mappingSource
				? { mappingSource: mappedIdentity.mappingSource }
				: {}),
			...(mappedIdentity.mappingReason
				? { mappingReason: mappedIdentity.mappingReason }
				: {}),
			libraryStatus: movieLibraryStatusQuery.data,
		});
	}
	const effectiveSeriesStatusQuery: AnimePageStatusQuery =
		mappedIdentity?.provider === "sonarr"
			? {
					data: adaptedSeriesStatusData,
					isError: seriesLibraryStatusQuery.isError,
					fetchStatus: seriesLibraryStatusQuery.fetchStatus,
					refetch: seriesLibraryStatusQuery.refetch,
				}
			: seriesStatusQuery;
	const effectiveMovieStatusQuery: AnimePageStatusQuery =
		mappedIdentity?.provider === "radarr"
			? {
					data: adaptedMovieStatusData,
					isError: movieLibraryStatusQuery.isError,
					fetchStatus: movieLibraryStatusQuery.fetchStatus,
					refetch: movieLibraryStatusQuery.refetch,
				}
			: movieStatusQuery;
	const addSeriesMutation = useAddSeries();
	const addMovieMutation = useAddMovie();

	if (!provider) {
		return null;
	}

	const viewModel = buildAnimePageActionViewModel({
		provider,
		options,
		optionsPending,
		optionsError,
		title,
		isConfigured,
		movieStatusQuery: effectiveMovieStatusQuery,
		seriesStatusQuery: effectiveSeriesStatusQuery,
		addMovieMutation,
		addSeriesMutation,
	});
	const handlePrimaryAction = () => {
		runAnimePagePrimaryAction({
			primaryAction: viewModel.actionModel.primaryAction,
			provider,
			mediaModal,
			providerStatusData: viewModel.providerSelection.providerStatusData,
			optionsError,
			refetchOptions: publicOptionsQuery.refetch,
			refetchStatus: viewModel.providerSelection.statusQuery.refetch,
			isConfigured,
			defaults,
			anilistId,
			title,
			resolvedMetadata,
			addSeriesMutation,
			addMovieMutation,
		});
	};

	if (!viewModel.uiEnabled) {
		return null;
	}

	return (
		<div ref={setHostElement} style={{ width: "100%" }}>
			<ConfirmProvider portalContainer={hostElement ?? null}>
				<MediaActions
					provider={provider}
					actionModel={viewModel.actionModel}
					externalHref={viewModel.externalHref}
					onPrimaryAction={handlePrimaryAction}
					onOpenSetup={() => {
						if (provider === "radarr") {
							mediaModal.open({
								anilistId,
								provider: "radarr",
								initialView: "setup",
								openSource: "content",
								launchTitle: title,
								launchMetadata: resolvedMetadata,
								launchSnapshot: createAnimePageLaunchSnapshot({
									provider: "radarr",
									status: viewModel.providerSelection.movieStatusData,
								}),
							});
							return;
						}

						mediaModal.open({
							anilistId,
							provider: "sonarr",
							initialView: "setup",
							openSource: "content",
							launchTitle: title,
							launchMetadata: resolvedMetadata,
							launchSnapshot: createAnimePageLaunchSnapshot({
								provider: "sonarr",
								status: viewModel.providerSelection.seriesStatusData,
							}),
						});
					}}
					onOpenMapping={() => {
						if (provider === "radarr") {
							mediaModal.open({
								anilistId,
								provider: "radarr",
								initialView: "mapping",
								openSource: "content",
								launchTitle: title,
								launchMetadata: resolvedMetadata,
								launchSnapshot: createAnimePageLaunchSnapshot({
									provider: "radarr",
									status: viewModel.providerSelection.movieStatusData,
								}),
							});
							return;
						}

						mediaModal.open({
							anilistId,
							provider: "sonarr",
							initialView: "mapping",
							openSource: "content",
							launchTitle: title,
							launchMetadata: resolvedMetadata,
							launchSnapshot: createAnimePageLaunchSnapshot({
								provider: "sonarr",
								status: viewModel.providerSelection.seriesStatusData,
							}),
						});
					}}
					portalContainer={hostElement ?? undefined}
				/>
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
};

/* -------------------------- Content-script boot --------------------------- */

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

	const provider = await resolveAnimePageProvider(signal);
	const idMatch = new URL(url).pathname.match(/\/anime\/(\d+)/);
	const anilistId = parseAniListIdOrNull(
		idMatch?.[1] ? Number.parseInt(idMatch[1], 10) : null,
	);
	const mappedProvider = anilistId
		? await resolveMappedProviderForAniListId(anilistId)
		: null;
	const routedProvider = mappedProvider ?? provider;
	if (!routedProvider) {
		return false;
	}

	return routedProvider === "radarr"
		? (publicOptions.ui?.animePages.radarr.enabled ?? true)
		: (publicOptions.ui?.animePages.sonarr.enabled ?? true);
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

	const mappedProvider = await resolveMappedProviderForAniListId(anilistId);
	if (!mappedProvider && shouldSkipByFormat(document)) {
		removeAnimeUI();
		log.debug("AniList page skipped due to format being movie/music");
		return;
	}

	const sidebarFormat = readFormatFromSidebar(document);

	stopAnchorKeeper?.();
	stopAnchorKeeper = startAnchorKeeper();
	const mountTarget = ensureActionsAnchor();
	if (!mountTarget) return;
	const target: HostMediaTarget = {
		anilistId,
		format: sidebarFormat,
		mountTarget,
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
			const root = ReactDOM.createRoot(uiContainer);
			root.render(
				<ExtensionErrorBoundary scope="anilist-anime-root">
					<QueryClientProvider client={queryClient}>
						<TooltipProvider>
							<ContentRoot
								target={target}
							/>
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
