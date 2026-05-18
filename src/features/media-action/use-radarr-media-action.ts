/** Radarr media-action workflow shared by AniList browse overlays and anime-page buttons. */
// src/features/media-action/use-radarr-media-action.ts

import type { AniListId } from "@/anilist/anilist-id";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import { buildProviderOpenUrl } from "@/providers/provider-links";
import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import { parseTmdbIdOrNull, type TmdbId } from "@/providers/schemas";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import { useProviderBaseUrl } from "@/queries/provider-base-url";
import {
	buildRadarrQuickAddInput,
	useAddMovie,
	useMovieStatus,
} from "@/queries/radarr";
import { getMediaActionStatus, type MediaActionStatus } from "./state";

interface RadarrMediaActionInput {
	anilistId: AniListId;
	displayTitle: string;
	providerTitle: string | null;
	metadata: AniListMediaHint | null;
	isConfigured: boolean;
	defaultForm: RadarrFormState | null;
	enabled: boolean;
	statusBlocked?: boolean;
	forceVerify?: boolean;
	priority?: "high" | "normal";
	onConfigure(): void;
	onOpenMapping(): void;
}

export interface RadarrMediaAction {
	status: MediaActionStatus;
	externalHref: string | null;
	runPrimaryAction(): void;
}

type MovieStatusQuery = ReturnType<typeof useMovieStatus>;
type AddMovieMutation = ReturnType<typeof useAddMovie>;

function isQueryChecking(input: {
	isLoading: boolean;
	fetchStatus: "fetching" | "paused" | "idle";
	data: unknown;
}): boolean {
	return input.isLoading || (input.fetchStatus === "fetching" && !input.data);
}

function shouldEnableStatus(input: RadarrMediaActionInput): boolean {
	return input.enabled && input.isConfigured && input.statusBlocked !== true;
}

function buildStatusPayload(
	input: RadarrMediaActionInput,
): Parameters<typeof useMovieStatus>[0] {
	const payload: Parameters<typeof useMovieStatus>[0] = {
		anilistId: input.anilistId,
		metadata: input.metadata,
	};
	if (input.providerTitle !== null) {
		payload.title = input.providerTitle;
	}
	return payload;
}

function buildStatusOptions(
	input: RadarrMediaActionInput,
	enabled: boolean,
): NonNullable<Parameters<typeof useMovieStatus>[1]> {
	const options: NonNullable<Parameters<typeof useMovieStatus>[1]> = {
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
	mediaInput: RadarrMediaActionInput;
	movieStatus: MovieStatusQuery;
	addMovie: AddMovieMutation;
}): {
	status: MediaActionStatus;
	tmdbId: TmdbId | null;
	providerRouteSlug: string | null;
} {
	const tmdbId = parseTmdbIdOrNull(input.movieStatus.data?.providerId);
	const providerRouteSlug = getProviderRouteSlug(
		"radarr",
		input.movieStatus.data?.movie ?? input.addMovie.data ?? null,
	);

	return {
		tmdbId,
		providerRouteSlug,
		status: getMediaActionStatus({
			isConfigured: input.mediaInput.isConfigured,
			isChecking:
				input.mediaInput.statusBlocked === true ||
				isQueryChecking(input.movieStatus),
			isAdding: input.addMovie.isPending,
			hasAddError: input.addMovie.isError,
			hasStatusError: input.movieStatus.isError,
			addSucceeded: input.addMovie.isSuccess,
			providerMappingState: input.movieStatus.data?.providerMappingState,
			isInLibrary: input.movieStatus.data?.isInLibrary ?? null,
			hasProviderId: tmdbId !== null || input.addMovie.data?.tmdbId != null,
			canQuickAdd:
				input.mediaInput.providerTitle !== null &&
				input.mediaInput.defaultForm !== null,
		}),
	};
}

function quickAdd(input: {
	mediaInput: RadarrMediaActionInput;
	tmdbId: TmdbId | null;
	addMovie: AddMovieMutation;
}): void {
	if (input.mediaInput.providerTitle === null) return;

	const quickAddInput = buildRadarrQuickAddInput({
		anilistId: input.mediaInput.anilistId,
		tmdbId: input.tmdbId,
		title: input.mediaInput.providerTitle,
		metadata: input.mediaInput.metadata,
		form: input.mediaInput.defaultForm,
	});
	if (quickAddInput !== null) {
		input.addMovie.mutate(quickAddInput);
	}
}

function runPrimaryAction(input: {
	status: MediaActionStatus;
	mediaInput: RadarrMediaActionInput;
	movieStatus: MovieStatusQuery;
	addMovie: AddMovieMutation;
	tmdbId: TmdbId | null;
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
			void input.movieStatus.refetch({ throwOnError: false }).catch(() => {});
			return;
		}
		case "retry-add": {
			input.addMovie.reset();
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

export function useRadarrMediaAction(
	input: RadarrMediaActionInput,
): RadarrMediaAction {
	const statusEnabled = shouldEnableStatus(input);
	const movieStatus = useMovieStatus(
		buildStatusPayload(input),
		buildStatusOptions(input, statusEnabled),
	);
	const addMovie = useAddMovie();
	const baseUrl = useProviderBaseUrl("radarr", {
		enabled: input.enabled && input.isConfigured,
	});
	const details = getStatusDetails({
		mediaInput: input,
		movieStatus,
		addMovie,
	});
	const externalHref = buildProviderOpenUrl({
		provider: "radarr",
		baseUrl: baseUrl.data ?? "",
		isInLibrary:
			details.status.state === "in-library" &&
			details.providerRouteSlug !== null,
		...(details.providerRouteSlug
			? { providerRouteSlug: details.providerRouteSlug }
			: {}),
		searchTerm: movieStatus.data?.successfulSynonym ?? input.displayTitle,
	});

	return {
		status: details.status,
		externalHref,
		runPrimaryAction: () => {
			runPrimaryAction({
				status: details.status,
				mediaInput: input,
				movieStatus,
				addMovie,
				tmdbId: details.tmdbId,
			});
		},
	};
}
