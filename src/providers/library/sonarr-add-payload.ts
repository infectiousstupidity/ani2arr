/** Sonarr-only add payload builder for provider library mutations. */
// src/providers/library/sonarr-add-payload.ts

import type {
	AddSonarrSeriesPayload,
	SonarrClient,
} from "@/providers/clients/sonarr.client";
import type { SonarrFormState } from "@/providers/settings/provider-settings.schema";
import type { ProviderCredentials, TvdbId } from "@/providers";
import {
	resolveMutationTagIds,
	resolveRequiredQualityProfileId,
	resolveRequiredRootFolderPath,
} from "./mutation-helpers";
import { createError, ErrorCode } from "@/shared/errors";

type ResolveSonarrAddPayloadInput = {
	api: Pick<SonarrClient, "getTags" | "createTag">;
	credentials: ProviderCredentials;
	defaults: SonarrFormState;
	form: SonarrFormState;
	title: string;
	tvdbId: TvdbId;
};

export async function resolveSonarrAddPayload(
	input: ResolveSonarrAddPayloadInput,
): Promise<AddSonarrSeriesPayload> {
	const { api, credentials, defaults, form, title, tvdbId } = input;
	const monitor = form.addOptions?.monitor ?? defaults.addOptions?.monitor;
	const seasonFolder = form.seasonFolder ?? defaults.seasonFolder;
	const seriesType = form.seriesType ?? defaults.seriesType;
	const searchForMissingEpisodes =
		form.addOptions?.searchForMissingEpisodes ??
		defaults.addOptions?.searchForMissingEpisodes;
	const searchForCutoffUnmetEpisodes =
		form.addOptions?.searchForCutoffUnmetEpisodes ??
		defaults.addOptions?.searchForCutoffUnmetEpisodes;

	const qualityProfileId = resolveRequiredQualityProfileId({
		value: form.qualityProfileId,
		fallback: defaults.qualityProfileId,
		provider: "sonarr",
		entityLabel: "series",
		actionLabel: "add",
	});

	const rootFolderPath = resolveRequiredRootFolderPath({
		value: form.rootFolderPath,
		fallback: defaults.rootFolderPath,
		provider: "sonarr",
		entityLabel: "series",
		actionLabel: "add",
	});

	const tags = await resolveMutationTagIds(
		api,
		credentials,
		form.tags,
		form.freeformTags,
		"sonarr",
	);

	if (seasonFolder === undefined) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing Sonarr season-folder setting for add.",
			"Select whether Sonarr should create season folders before adding this series.",
		);
	}

	if (!seriesType) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing Sonarr series type for add.",
			"Select a Sonarr series type before adding this series.",
		);
	}

	if (!monitor) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing Sonarr monitor option for add.",
			"Select a Sonarr monitoring option before adding this series.",
		);
	}

	if (
		searchForMissingEpisodes === undefined ||
		searchForCutoffUnmetEpisodes === undefined
	) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing Sonarr search settings for add.",
			"Select Sonarr search options before adding this series.",
		);
	}

	return {
		title,
		tvdbId,
		qualityProfileId,
		rootFolderPath,
		seasonFolder,
		monitored: monitor !== "none",
		seriesType,
		tags,
		addOptions: {
			monitor,
			searchForMissingEpisodes,
			searchForCutoffUnmetEpisodes,
		},
	};
}
