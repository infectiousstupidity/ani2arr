/** Sonarr add workflow and payload helpers for save-time series creation. */
// src/providers/sonarr/add.ts

import type {
	SonarrAddPayloadOptions,
	SonarrLookupSeries,
	SonarrQualityProfileId,
	SonarrSeries,
	SonarrTagId,
	TvdbId,
} from "./types";
import type { SonarrClient } from "./client";
import type { SonarrSeriesType } from "./schemas";
import type { ProviderCredentials } from "../types";
import type { SonarrFormState } from "./form-state";
import { createError, ErrorCode } from "@/shared/errors";
import { resolveSonarrTagIds } from "./tags";

export type SonarrAddSeriesPayload = {
	rootFolderPath: string;
	qualityProfileId: SonarrQualityProfileId;
	seriesType: SonarrSeriesType;
	seasonFolder: boolean;
	monitored: boolean;
	tags: SonarrTagId[];
	addOptions: SonarrAddPayloadOptions;
} & SonarrLookupSeries;

type AddSonarrSeriesInput = {
	tvdbId: TvdbId;
	title: string;
	form: SonarrFormState;
	defaults: SonarrFormState;
	credentials: ProviderCredentials;
};

type AddSonarrSeriesDeps = {
	client: Pick<
		SonarrClient,
		"lookupSeriesByTvdbId" | "addSeries" | "getTags" | "createTag"
	>;
};

function buildAddSonarrSeriesPayload(
	series: SonarrLookupSeries,
	options: {
		rootFolderPath: string;
		qualityProfileId: SonarrQualityProfileId;
		seriesType: SonarrSeriesType;
		seasonFolder: boolean;
		monitor: SonarrAddSeriesPayload["addOptions"]["monitor"];
		searchForMissingEpisodes: boolean;
		searchForCutoffUnmetEpisodes: boolean;
		tags: SonarrTagId[];
	},
): SonarrAddSeriesPayload {
	return {
		...series,
		rootFolderPath: options.rootFolderPath,
		addOptions: {
			monitor: options.monitor,
			searchForMissingEpisodes: options.searchForMissingEpisodes,
			searchForCutoffUnmetEpisodes: options.searchForCutoffUnmetEpisodes,
		},
		qualityProfileId: options.qualityProfileId,
		seriesType: options.seriesType,
		seasonFolder: options.seasonFolder,
		monitored: options.monitor !== "none",
		tags: options.tags,
	};
}

export async function addSonarrSeries(
	input: AddSonarrSeriesInput,
	deps: AddSonarrSeriesDeps,
): Promise<SonarrSeries> {
	const payload = await resolveSonarrAddPayload({
		api: deps.client,
		credentials: input.credentials,
		defaults: input.defaults,
		form: input.form,
		title: input.title,
		tvdbId: input.tvdbId,
	});

	return deps.client.addSeries(payload, input.credentials);
}

async function resolveSonarrAddPayload(input: {
	api: Pick<SonarrClient, "lookupSeriesByTvdbId" | "getTags" | "createTag">;
	credentials: ProviderCredentials;
	defaults: SonarrFormState;
	form: SonarrFormState;
	title: string;
	tvdbId: TvdbId;
}): Promise<SonarrAddSeriesPayload> {
	const { api, credentials, defaults, form, tvdbId } = input;
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
		actionLabel: "add",
	});
	const rootFolderPath = resolveRequiredRootFolderPath({
		value: form.rootFolderPath,
		fallback: defaults.rootFolderPath,
		actionLabel: "add",
	});

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

	const series = await api.lookupSeriesByTvdbId(tvdbId, credentials);

	if (!series) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Sonarr lookup did not return a series for TVDB ID ${tvdbId}.`,
			"Sonarr could not find this series in its lookup catalog.",
			{ tvdbId },
		);
	}

	const tags = await resolveSonarrTagIds({
		api,
		credentials,
		existingIdsFromForm: form.tags,
		freeformLabelsFromForm: form.freeformTags,
	});

	return buildAddSonarrSeriesPayload(series, {
		qualityProfileId,
		rootFolderPath,
		seasonFolder,
		seriesType,
		tags,
		monitor,
		searchForMissingEpisodes,
		searchForCutoffUnmetEpisodes,
	});
}

function resolveRequiredQualityProfileId(input: {
	value: SonarrQualityProfileId | undefined;
	fallback: SonarrQualityProfileId | undefined;
	actionLabel: "add";
}): SonarrQualityProfileId {
	const resolvedValue =
		typeof input.value === "number" && Number.isFinite(input.value)
			? input.value
			: input.fallback;

	if (typeof resolvedValue !== "number" || !Number.isFinite(resolvedValue)) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Missing Sonarr quality profile for ${input.actionLabel}.`,
			"Select a Sonarr quality profile before adding this series.",
		);
	}

	return resolvedValue;
}

function resolveRequiredRootFolderPath(input: {
	value: string | undefined;
	fallback: string | undefined;
	actionLabel: "add";
}): string {
	const resolvedValue = input.value?.trim() || input.fallback?.trim() || "";

	if (!resolvedValue) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Missing Sonarr root folder for ${input.actionLabel}.`,
			"Select a Sonarr root folder before adding this series.",
		);
	}

	return resolvedValue;
}
