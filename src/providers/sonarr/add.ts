/** Sonarr add workflow and payload helpers for save-time series creation. */
// src/providers/sonarr/add.ts

import type {
	SonarrAddPayloadOptions,
	SonarrLookupSeries,
	SonarrQualityProfileId,
	SonarrSeries,
	SonarrSeriesType,
	SonarrTagId,
	TvdbId,
} from "./types";
import type { SonarrClient } from "./client";
import type { ProviderCredentials } from "../types";
import type { SonarrFormState } from "../settings/provider-settings.schema";
import { createError, ErrorCode } from "@/shared/errors";
import { resolveSonarrTagIds } from "./tags";

export type AddSonarrSeriesPayload = {
	title: string;
	tvdbId: TvdbId;
	rootFolderPath: string;
	qualityProfileId: SonarrQualityProfileId;
	seriesType: SonarrSeriesType;
	seasonFolder: boolean;
	monitored: boolean;
	tags: SonarrTagId[];
	addOptions: SonarrAddPayloadOptions;
};

type AddSonarrSeriesInput = {
	tvdbId: TvdbId;
	title: string;
	form: SonarrFormState;
	defaults: SonarrFormState;
	credentials: ProviderCredentials;
};

type AddSonarrSeriesDeps = {
	client: Pick<SonarrClient, "addSeries" | "getTags" | "createTag">;
};

export function buildAddSonarrSeriesPayload(
	series: SonarrLookupSeries,
	options: {
		rootFolderPath: string;
		qualityProfileId: SonarrQualityProfileId;
		seriesType: SonarrSeriesType;
		seasonFolder: boolean;
		monitor: AddSonarrSeriesPayload["addOptions"]["monitor"];
		searchForMissingEpisodes: boolean;
		searchForCutoffUnmetEpisodes: boolean;
		tags: SonarrTagId[];
	},
): AddSonarrSeriesPayload {
	return {
		title: series.title,
		tvdbId: series.tvdbId,
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
	api: Pick<SonarrClient, "getTags" | "createTag">;
	credentials: ProviderCredentials;
	defaults: SonarrFormState;
	form: SonarrFormState;
	title: string;
	tvdbId: TvdbId;
}): Promise<AddSonarrSeriesPayload> {
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

	const tags = await resolveSonarrTagIds({
		api,
		credentials,
		existingIdsFromForm: form.tags,
		freeformLabelsFromForm: form.freeformTags,
	});

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
