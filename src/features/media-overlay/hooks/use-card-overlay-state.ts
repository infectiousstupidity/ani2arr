/** Overlay-owned provider action state for AniList browse surfaces. */
// src/features/media-overlay/hooks/use-card-overlay-state.ts
/* eslint-disable complexity, react-hooks/preserve-manual-memoization -- Existing overlay hook coordinates provider status, add, and mapping state. */

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { browser } from "wxt/browser";
import type { AniListId } from "@/anilist";
import type { ExtensionError } from "@/shared/errors";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type Provider,
} from "@/providers";
import { getProviderLabel } from "@/providers/provider-labels";
import type {
	RadarrFormState,
	SonarrFormState,
} from "@/providers/settings/provider-settings.schema";
import {
	useAddMovie,
	useMovieLibraryStatus,
	useMovieStatus,
} from "@/providers/hooks/radarr.queries";
import {
	useAddSeries,
	useSeriesLibraryStatus,
	useSeriesStatus,
} from "@/providers/hooks/sonarr.queries";
import type {
	CheckMovieStatusResponse,
	CheckSeriesStatusResponse,
} from "@/rpc/types";
import {
	buildMovieStatusResponseFromLibraryStatus,
	buildSeriesStatusResponseFromLibraryStatus,
} from "@/providers/library/status-response-adapter";
import type { EffectiveMappingPresence } from "@/mapping/queries/mapping-identities";
import {
	buildProviderActionModel,
	deriveProviderActionSummary,
	type ProviderActionModel,
	type ProviderActionState,
	type ProviderActionSummary,
} from "@/features/provider-action";
import {
	createLaunchSnapshot,
	type MediaModalLaunchSnapshot,
} from "@/features/media-modal/launch-snapshot";
import {
	getProviderRouteSlug,
	type ProviderRouteSlugSource,
} from "@/providers/provider-route-slug";

export interface UseCardOverlayStateParams {
	provider: Provider;
	anilistId: AniListId;
	title: string;
	metadata: AniListMediaHint | null;
	defaultForm: SonarrFormState | RadarrFormState | null;
	isConfigured: boolean;
	mappedIdentity?: EffectiveMappingPresence | null;
	enabled?: boolean;
	onOpenMapping?: (snapshot: MediaModalLaunchSnapshot) => void;
}

export interface UseCardOverlayStateResult {
	actionSummary: ProviderActionSummary;
	primaryTitle: string;
	primaryAriaLabel: string;
	handlePrimaryAction: (event: ReactMouseEvent<HTMLButtonElement>) => void;
	providerRouteSlug: string | null;
	resolvedSearchTerm: string;
	launchSnapshot: MediaModalLaunchSnapshot;
}

type OverlayStatusData = CheckMovieStatusResponse | CheckSeriesStatusResponse;
type OverlayStatusQuery = {
	data: OverlayStatusData | undefined;
	isError: boolean;
	error: unknown;
	isLoading: boolean;
	fetchStatus: ReturnType<typeof useMovieStatus>["fetchStatus"];
	refetch: (
		options?: Parameters<ReturnType<typeof useMovieStatus>["refetch"]>[0],
	) => Promise<unknown>;
};

interface OverlayAddSelection {
	isAdding: boolean;
	addSucceeded: boolean;
	addHasError: boolean;
	addError: unknown;
	reset: () => void;
	addedMedia:
		| ReturnType<typeof useAddMovie>["data"]
		| ReturnType<typeof useAddSeries>["data"];
}

const resolveErrorMessage = (error: unknown): string | null => {
	if (!error) return null;
	if (typeof error === "string") return error;
	if (
		typeof error === "object" &&
		error !== null &&
		"userMessage" in (error as ExtensionError)
	) {
		const { userMessage } = error as ExtensionError;
		if (typeof userMessage === "string" && userMessage.trim().length > 0)
			return userMessage;
	}
	if (error instanceof Error) return error.message;
	return null;
};

function getPrimaryTitle(input: {
	actionState: ProviderActionState;
	providerLabel: string;
	canQuickAdd: boolean;
	errorMessage: string | null;
	errorSource: ProviderActionSummary["errorSource"];
}): string {
	const { actionState, providerLabel, canQuickAdd, errorMessage, errorSource } =
		input;

	switch (actionState) {
		case "in-library": {
			return `Already in ${providerLabel}`;
		}
		case "can-add": {
			return canQuickAdd
				? `Quick add to ${providerLabel}`
				: "Defaults unavailable";
		}
		case "unmapped": {
			return `Find ${providerLabel} match manually`;
		}
		case "unknown": {
			return `Retry ${providerLabel} status check`;
		}
		case "checking": {
			return `Checking ${providerLabel} status.`;
		}
		case "adding": {
			return `Adding to ${providerLabel}.`;
		}
		case "error": {
			return (
				errorMessage ??
				(errorSource === "add"
					? `Retry ${providerLabel} add`
					: `Retry ${providerLabel} status check`)
			);
		}
		case "unconfigured": {
			return `Configure ${providerLabel} before adding`;
		}
		default: {
			return providerLabel;
		}
	}
}

function getPrimaryAriaLabel(input: {
	actionState: ProviderActionState;
	primaryTitle: string;
	providerLabel: string;
	errorSource: ProviderActionSummary["errorSource"];
}): string {
	const { actionState, primaryTitle, providerLabel, errorSource } = input;

	switch (actionState) {
		case "unconfigured": {
			return `Open ${providerLabel} settings`;
		}
		case "unmapped": {
			return `Find ${providerLabel} match manually`;
		}
		case "unknown": {
			return `Retry ${providerLabel} status check`;
		}
		case "error": {
			return errorSource === "add"
				? `Retry adding to ${providerLabel}`
				: `Retry ${providerLabel} status check`;
		}
		default: {
			return primaryTitle;
		}
	}
}

function selectOverlayStatusQuery(input: {
	provider: Provider;
	movieStatusQuery: OverlayStatusQuery;
	seriesStatusQuery: OverlayStatusQuery;
}): OverlayStatusQuery {
	return input.provider === "radarr"
		? input.movieStatusQuery
		: input.seriesStatusQuery;
}

function selectOverlayAddSelection(input: {
	provider: Provider;
	addMovieMutation: ReturnType<typeof useAddMovie>;
	addSeriesMutation: ReturnType<typeof useAddSeries>;
}): OverlayAddSelection {
	if (input.provider === "radarr") {
		return {
			isAdding: input.addMovieMutation.isPending,
			addSucceeded: input.addMovieMutation.isSuccess,
			addHasError: input.addMovieMutation.isError,
			addError: input.addMovieMutation.error,
			reset: input.addMovieMutation.reset,
			addedMedia: input.addMovieMutation.data,
		};
	}

	return {
		isAdding: input.addSeriesMutation.isPending,
		addSucceeded: input.addSeriesMutation.isSuccess,
		addHasError: input.addSeriesMutation.isError,
		addError: input.addSeriesMutation.error,
		reset: input.addSeriesMutation.reset,
		addedMedia: input.addSeriesMutation.data,
	};
}

function retryOverlayStatus(input: {
	forceVerifyStatusRef: { current: boolean };
	refetch: OverlayStatusQuery["refetch"];
}): void {
	input.forceVerifyStatusRef.current = true;
	void input
		.refetch({ throwOnError: false })
		.catch(() => {})
		.finally(() => {
			input.forceVerifyStatusRef.current = false;
		});
}

function runOverlayQuickAdd(input: {
	provider: Provider;
	anilistId: AniListId;
	title: string;
	metadata: AniListMediaHint | null;
	defaultForm: SonarrFormState | RadarrFormState | null;
	statusData: OverlayStatusData | undefined;
	addMovieMutation: ReturnType<typeof useAddMovie>;
	addSeriesMutation: ReturnType<typeof useAddSeries>;
}): void {
	if (!input.defaultForm) {
		return;
	}

	if (input.provider === "radarr") {
		const tmdbId = parseTmdbIdOrNull(input.statusData?.providerId);
		if (tmdbId === null) {
			return;
		}

		input.addMovieMutation.mutate({
			anilistId: input.anilistId,
			tmdbId,
			title: input.title,
			primaryTitleHint: input.title,
			metadata: input.metadata,
			form: { ...(input.defaultForm as RadarrFormState) },
		});
		return;
	}

	const tvdbId = parseTvdbIdOrNull(input.statusData?.providerId);
	if (tvdbId === null) {
		return;
	}

	input.addSeriesMutation.mutate({
		anilistId: input.anilistId,
		tvdbId,
		title: input.title,
		primaryTitleHint: input.title,
		metadata: input.metadata,
		form: { ...(input.defaultForm as SonarrFormState) },
	});
}

function runOverlayPrimaryAction(input: {
	event: ReactMouseEvent<HTMLButtonElement>;
	primaryAction: ProviderActionModel["primaryAction"];
	provider: Provider;
	onOpenMapping?: (snapshot: MediaModalLaunchSnapshot) => void;
	defaultForm: SonarrFormState | RadarrFormState | null;
	anilistId: AniListId;
	title: string;
	metadata: AniListMediaHint | null;
	launchSnapshot: MediaModalLaunchSnapshot;
	statusData: OverlayStatusData | undefined;
	addHasError: boolean;
	reset: () => void;
	forceVerifyStatusRef: { current: boolean };
	refetch: OverlayStatusQuery["refetch"];
	addMovieMutation: ReturnType<typeof useAddMovie>;
	addSeriesMutation: ReturnType<typeof useAddSeries>;
}): void {
	input.event.preventDefault();
	input.event.stopPropagation();

	switch (input.primaryAction) {
		case "none": {
			return;
		}
		case "configure": {
			void browser.runtime
				.sendMessage({
					_a2a: true,
					type: "OPEN_OPTIONS_PAGE",
					sectionId: input.provider,
					timestamp: Date.now(),
				})
				.catch(() => {});
			return;
		}
		case "open-mapping": {
			input.onOpenMapping?.(input.launchSnapshot);
			return;
		}
		case "retry-status": {
			retryOverlayStatus({
				forceVerifyStatusRef: input.forceVerifyStatusRef,
				refetch: input.refetch,
			});
			return;
		}
		case "retry-add": {
			if (input.addHasError) {
				input.reset();
			}
			runOverlayQuickAdd({
				provider: input.provider,
				anilistId: input.anilistId,
				title: input.title,
				metadata: input.metadata,
				defaultForm: input.defaultForm,
				statusData: input.statusData,
				addMovieMutation: input.addMovieMutation,
				addSeriesMutation: input.addSeriesMutation,
			});
			return;
		}
		case "quick-add": {
			runOverlayQuickAdd({
				provider: input.provider,
				anilistId: input.anilistId,
				title: input.title,
				metadata: input.metadata,
				defaultForm: input.defaultForm,
				statusData: input.statusData,
				addMovieMutation: input.addMovieMutation,
				addSeriesMutation: input.addSeriesMutation,
			});
			return;
		}
		default: {
			return;
		}
	}
}

function getOverlayHasMapping(input: {
	provider: Provider;
	statusData: OverlayStatusQuery["data"];
	addMovieMutation: ReturnType<typeof useAddMovie>;
	addSeriesMutation: ReturnType<typeof useAddSeries>;
}): boolean {
	if (input.provider === "radarr") {
		return (
			input.statusData?.providerId != null ||
			input.addMovieMutation.data?.tmdbId != null
		);
	}

	return (
		input.statusData?.providerId != null ||
		input.addSeriesMutation.data?.tvdbId != null
	);
}

function getOverlayProviderRouteSlug(input: {
	provider: Provider;
	statusData: OverlayStatusQuery["data"];
	addedMedia: OverlayAddSelection["addedMedia"];
}): string | null {
	if (input.provider === "radarr") {
		return getProviderRouteSlug(
			"radarr",
			((input.statusData as ReturnType<typeof useMovieStatus>["data"])?.movie ??
				input.addedMedia ??
				null) as ProviderRouteSlugSource | null,
		);
	}

	return getProviderRouteSlug(
		"sonarr",
		((input.statusData as ReturnType<typeof useSeriesStatus>["data"])?.series ??
			input.addedMedia ??
			null) as ProviderRouteSlugSource | null,
	);
}

export const useCardOverlayState = ({
	provider,
	anilistId,
	title,
	metadata,
	defaultForm,
	isConfigured,
	mappedIdentity = null,
	enabled,
	onOpenMapping,
}: UseCardOverlayStateParams): UseCardOverlayStateResult => {
	const forceVerifyStatusRef = useRef(false);
	const providerLabel = getProviderLabel(provider);
	const canQuickAdd = defaultForm !== null;
	const statusEnabled = (enabled ?? isConfigured) && isConfigured;
	const mappedSonarrProviderId =
		mappedIdentity?.provider === "sonarr"
			? parseTvdbIdOrNull(mappedIdentity.providerId)
			: null;
	const mappedRadarrProviderId =
		mappedIdentity?.provider === "radarr"
			? parseTmdbIdOrNull(mappedIdentity.providerId)
			: null;
	const hasMappedIdentity =
		mappedIdentity?.provider === provider &&
		mappedIdentity.providerMappingState === "mapped" &&
		mappedIdentity.providerId !== null;

	const seriesStatusQuery = useSeriesStatus(
		{ anilistId, title, metadata },
		{
			enabled: provider === "sonarr" && statusEnabled && !hasMappedIdentity,
			force_verify: () => forceVerifyStatusRef.current,
		},
	);

	const movieStatusQuery = useMovieStatus(
		{ anilistId, title, metadata },
		{
			enabled: provider === "radarr" && statusEnabled && !hasMappedIdentity,
			force_verify: () => forceVerifyStatusRef.current,
		},
	);
	const seriesLibraryStatusQuery = useSeriesLibraryStatus(
		mappedSonarrProviderId
			? {
					anilistId,
					providerId: mappedSonarrProviderId,
				}
			: null,
		{
			enabled:
				provider === "sonarr" &&
				statusEnabled &&
				hasMappedIdentity &&
				mappedSonarrProviderId !== null,
		},
	);
	const movieLibraryStatusQuery = useMovieLibraryStatus(
		mappedRadarrProviderId
			? {
					anilistId,
					providerId: mappedRadarrProviderId,
				}
			: null,
		{
			enabled:
				provider === "radarr" &&
				statusEnabled &&
				hasMappedIdentity &&
				mappedRadarrProviderId !== null,
		},
	);
	let adaptedSeriesStatusData: CheckSeriesStatusResponse | undefined;
	if (
		hasMappedIdentity &&
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
		hasMappedIdentity &&
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
	const effectiveSeriesStatusQuery: OverlayStatusQuery =
		hasMappedIdentity && mappedIdentity?.provider === "sonarr"
			? {
					data: adaptedSeriesStatusData,
					isError: seriesLibraryStatusQuery.isError,
					error: seriesLibraryStatusQuery.error,
					isLoading: seriesLibraryStatusQuery.isLoading,
					fetchStatus: seriesLibraryStatusQuery.fetchStatus,
					refetch: seriesLibraryStatusQuery.refetch,
				}
			: seriesStatusQuery;
	const effectiveMovieStatusQuery: OverlayStatusQuery =
		hasMappedIdentity && mappedIdentity?.provider === "radarr"
			? {
					data: adaptedMovieStatusData,
					isError: movieLibraryStatusQuery.isError,
					error: movieLibraryStatusQuery.error,
					isLoading: movieLibraryStatusQuery.isLoading,
					fetchStatus: movieLibraryStatusQuery.fetchStatus,
					refetch: movieLibraryStatusQuery.refetch,
				}
			: movieStatusQuery;

	const addSeriesMutation = useAddSeries();
	const addMovieMutation = useAddMovie();
	const statusQuery = selectOverlayStatusQuery({
		provider,
		movieStatusQuery: effectiveMovieStatusQuery,
		seriesStatusQuery: effectiveSeriesStatusQuery,
	});
	const addSelection = selectOverlayAddSelection({
		provider,
		addMovieMutation,
		addSeriesMutation,
	});
	const { isAdding, addSucceeded, addHasError, addError, reset, addedMedia } =
		addSelection;
	const statusData = statusQuery.data;
	const launchSnapshot = useMemo(
		() => {
			if (provider === "radarr") {
				return createLaunchSnapshot({
					provider: "radarr",
					status: (statusData as CheckMovieStatusResponse | undefined) ?? null,
					source: statusData ? "cache" : "unknown",
					verifiedAt: null,
				});
			}

			return createLaunchSnapshot({
				provider: "sonarr",
				status: (statusData as CheckSeriesStatusResponse | undefined) ?? null,
				source: statusData ? "cache" : "unknown",
				verifiedAt: null,
			});
		},
		[provider, statusData],
	);

	useEffect(() => {
		reset();
	}, [anilistId, reset, title]);

	const hasPrevData = statusData !== undefined && statusData !== null;
	const providerMappingState = statusData?.providerMappingState;
	const hasMapping = getOverlayHasMapping({
		provider,
		statusData,
		addMovieMutation,
		addSeriesMutation,
	});

	const actionSummary = useMemo(
		() =>
			deriveProviderActionSummary({
				isConfigured,
				isChecking:
					statusQuery.isLoading ||
					(statusQuery.fetchStatus === "fetching" && !hasPrevData),
				providerMappingState,
				isInLibrary: statusData?.isInLibrary ?? null,
				hasStatusError: statusQuery.isError,
				isAdding,
				hasAddError: addHasError,
				addSucceeded,
				hasMapping,
			}),
		[
			addHasError,
			addSucceeded,
			hasMapping,
			hasPrevData,
			isConfigured,
			isAdding,
			providerMappingState,
			statusData?.isInLibrary,
			statusQuery.fetchStatus,
			statusQuery.isError,
			statusQuery.isLoading,
		],
	);
	const actionModel = useMemo(
		() =>
			buildProviderActionModel({
				summary: actionSummary,
				hasExternalHref: false,
				canQuickAdd,
			}),
		[actionSummary, canQuickAdd],
	);

	let errorMessage =
		resolveErrorMessage(addError) ?? resolveErrorMessage(statusQuery.error);
	if (actionSummary.state === "unmapped") {
		errorMessage = `No automatic ${providerLabel} match was found. Click to search manually.`;
	} else if (actionSummary.state === "unknown") {
		errorMessage = `Unable to determine ${providerLabel} status right now. Retry the check.`;
	}

	const primaryTitle = getPrimaryTitle({
		actionState: actionSummary.state,
		providerLabel,
		canQuickAdd,
		errorMessage,
		errorSource: actionSummary.errorSource,
	});
	const primaryAriaLabel = getPrimaryAriaLabel({
		actionState: actionSummary.state,
		primaryTitle,
		providerLabel,
		errorSource: actionSummary.errorSource,
	});
	const providerRouteSlug = useMemo(
		() =>
			getOverlayProviderRouteSlug({
				provider,
				statusData,
				addedMedia,
			}),
		[addedMedia, provider, statusData],
	);
	const resolvedSearchTerm = statusData?.successfulSynonym ?? title;

	const handlePrimaryAction = useCallback(
		(event: ReactMouseEvent<HTMLButtonElement>) => {
			runOverlayPrimaryAction({
				event,
				primaryAction: actionModel.primaryAction,
				provider,
				...(onOpenMapping ? { onOpenMapping } : {}),
				defaultForm,
				anilistId,
				title,
				metadata,
				launchSnapshot,
				statusData,
				addHasError,
				reset,
				forceVerifyStatusRef,
				refetch: statusQuery.refetch,
				addMovieMutation,
				addSeriesMutation,
			});
		},
		[
			addMovieMutation,
			addSeriesMutation,
			addHasError,
			reset,
			actionModel.primaryAction,
			anilistId,
			defaultForm,
			metadata,
			onOpenMapping,
			provider,
			statusData,
			statusQuery.refetch,
			launchSnapshot,
			title,
		],
	);

	return {
		actionSummary,
		primaryTitle,
		primaryAriaLabel,
		handlePrimaryAction,
		providerRouteSlug,
		resolvedSearchTerm,
		launchSnapshot,
	};
};
