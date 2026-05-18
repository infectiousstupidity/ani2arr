/** Sonarr media-action workflow shared by AniList browse overlays and anime-page buttons. */
// src/features/media-action/use-sonarr-media-action.ts

import type { AniListId } from "@/anilist/anilist-id";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import { buildProviderOpenUrl } from "@/providers/provider-links";
import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import { parseTvdbIdOrNull, type TvdbId } from "@/providers/schemas";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import { useProviderBaseUrl } from "@/queries/provider-base-url";
import {
	buildSonarrQuickAddInput,
	useAddSeries,
	useSeriesStatus,
} from "@/queries/sonarr";
import { getMediaActionStatus, type MediaActionStatus } from "./state";

interface SonarrMediaActionInput {
	anilistId: AniListId;
	displayTitle: string;
	providerTitle: string | null;
	metadata: AniListMediaHint | null;
	isConfigured: boolean;
	defaultForm: SonarrFormState | null;
	enabled: boolean;
	statusBlocked?: boolean;
	forceVerify?: boolean;
	priority?: "high" | "normal";
	onConfigure(): void;
	onOpenMapping(): void;
}

export interface SonarrMediaAction {
	status: MediaActionStatus;
	externalHref: string | null;
	runPrimaryAction(): void;
}

type SeriesStatusQuery = ReturnType<typeof useSeriesStatus>;
type AddSeriesMutation = ReturnType<typeof useAddSeries>;

function isQueryChecking(input: {
	isLoading: boolean;
	fetchStatus: "fetching" | "paused" | "idle";
	data: unknown;
}): boolean {
	return input.isLoading || (input.fetchStatus === "fetching" && !input.data);
}

function shouldEnableStatus(input: SonarrMediaActionInput): boolean {
	return input.enabled && input.isConfigured && input.statusBlocked !== true;
}

function buildStatusPayload(
	input: SonarrMediaActionInput,
): Parameters<typeof useSeriesStatus>[0] {
	const payload: Parameters<typeof useSeriesStatus>[0] = {
		anilistId: input.anilistId,
		metadata: input.metadata,
	};
	if (input.providerTitle !== null) {
		payload.title = input.providerTitle;
	}
	return payload;
}

function buildStatusOptions(
	input: SonarrMediaActionInput,
	enabled: boolean,
): NonNullable<Parameters<typeof useSeriesStatus>[1]> {
	const options: NonNullable<Parameters<typeof useSeriesStatus>[1]> = {
		enabled,
	};
	if (input.forceVerify !== undefined) {
		options.force_verify = input.forceVerify;
	}
	if (input.priority !== undefined) {
		options.priority = input.priority;
	}
	return options;
}

function getStatusDetails(input: {
	mediaInput: SonarrMediaActionInput;
	seriesStatus: SeriesStatusQuery;
	addSeries: AddSeriesMutation;
}): {
	status: MediaActionStatus;
	tvdbId: TvdbId | null;
	providerRouteSlug: string | null;
} {
	const tvdbId = parseTvdbIdOrNull(input.seriesStatus.data?.providerId);
	const providerRouteSlug = getProviderRouteSlug(
		"sonarr",
		input.seriesStatus.data?.series ?? input.addSeries.data ?? null,
	);

	return {
		tvdbId,
		providerRouteSlug,
		status: getMediaActionStatus({
			isConfigured: input.mediaInput.isConfigured,
			isChecking:
				input.mediaInput.statusBlocked === true ||
				isQueryChecking(input.seriesStatus),
			isAdding: input.addSeries.isPending,
			hasAddError: input.addSeries.isError,
			hasStatusError: input.seriesStatus.isError,
			addSucceeded: input.addSeries.isSuccess,
			providerMappingState: input.seriesStatus.data?.providerMappingState,
			isInLibrary: input.seriesStatus.data?.isInLibrary ?? null,
			hasProviderId: tvdbId !== null || input.addSeries.data?.tvdbId != null,
			canQuickAdd:
				input.mediaInput.providerTitle !== null &&
				input.mediaInput.defaultForm !== null,
		}),
	};
}

function quickAdd(input: {
	mediaInput: SonarrMediaActionInput;
	tvdbId: TvdbId | null;
	addSeries: AddSeriesMutation;
}): void {
	if (input.mediaInput.providerTitle === null) return;

	const quickAddInput = buildSonarrQuickAddInput({
		anilistId: input.mediaInput.anilistId,
		tvdbId: input.tvdbId,
		title: input.mediaInput.providerTitle,
		metadata: input.mediaInput.metadata,
		form: input.mediaInput.defaultForm,
	});
	if (quickAddInput !== null) {
		input.addSeries.mutate(quickAddInput);
	}
}

function runPrimaryAction(input: {
	status: MediaActionStatus;
	mediaInput: SonarrMediaActionInput;
	seriesStatus: SeriesStatusQuery;
	addSeries: AddSeriesMutation;
	tvdbId: TvdbId | null;
}): void {
	switch (input.status.action) {
		case "configure": {
			input.mediaInput.onConfigure();
			return;
		}
		case "open-mapping": {
			input.mediaInput.onOpenMapping();
			return;
		}
		case "retry-status": {
			void input.seriesStatus.refetch({ throwOnError: false }).catch(() => {});
			return;
		}
		case "retry-add": {
			input.addSeries.reset();
			quickAdd(input);
			return;
		}
		case "quick-add": {
			quickAdd(input);
			return;
		}
		case "none": {
			return;
		}
	}
}

export function useSonarrMediaAction(
	input: SonarrMediaActionInput,
): SonarrMediaAction {
	const statusEnabled = shouldEnableStatus(input);
	const seriesStatus = useSeriesStatus(
		buildStatusPayload(input),
		buildStatusOptions(input, statusEnabled),
	);
	const addSeries = useAddSeries();
	const baseUrl = useProviderBaseUrl("sonarr", {
		enabled: input.enabled && input.isConfigured,
	});
	const details = getStatusDetails({
		mediaInput: input,
		seriesStatus,
		addSeries,
	});
	const externalHref = buildProviderOpenUrl({
		provider: "sonarr",
		baseUrl: baseUrl.data ?? "",
		isInLibrary:
			details.status.state === "in-library" &&
			details.providerRouteSlug !== null,
		...(details.providerRouteSlug
			? { providerRouteSlug: details.providerRouteSlug }
			: {}),
		searchTerm: seriesStatus.data?.successfulSynonym ?? input.displayTitle,
	});

	return {
		status: details.status,
		externalHref,
		runPrimaryAction: () => {
			runPrimaryAction({
				status: details.status,
				mediaInput: input,
				seriesStatus,
				addSeries,
				tvdbId: details.tvdbId,
			});
		},
	};
}
