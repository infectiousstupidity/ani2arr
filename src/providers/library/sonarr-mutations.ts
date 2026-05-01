/** Sonarr add and update workflows for provider library mutations. */
// src/providers/library/sonarr-mutations.ts

import type {
	AddSonarrSeriesPayload,
	SonarrClient,
} from "@/providers/clients/sonarr.client";
import type {
	SonarrEditMonitoringAction,
	SonarrFormState,
} from "@/providers/settings/provider-settings.schema";
import type {
	ProviderCredentials,
	SonarrSeries,
	SonarrSeriesId,
	TvdbId,
} from "@/providers";
import {
	createError,
	ErrorCode,
	logError,
	normalizeError,
} from "@/shared/errors";
import { buildProviderFolderSlug, joinRootAndSlug } from "./paths";
import {
	resolveMutationTagIds,
	resolveRequiredQualityProfileId,
	resolveRequiredRootFolderPath,
	shouldMoveProviderFiles,
} from "./mutation-helpers";

type AddSonarrSeriesInput = {
	tvdbId: TvdbId;
	title: string;
	form: SonarrFormState;
	defaults: SonarrFormState;
	credentials: ProviderCredentials;
};

type UpdateSonarrSeriesInput = {
	tvdbId: TvdbId;
	title: string;
	form: SonarrFormState;
	monitoringAction?: SonarrEditMonitoringAction;
	credentials: ProviderCredentials;
};

type SonarrMutationDeps = {
	client: Pick<
		SonarrClient,
		| "addSeries"
		| "getSeriesByTvdbId"
		| "getSeriesById"
		| "getTags"
		| "createTag"
		| "updateSeries"
		| "applyMonitoringAction"
	>;
	cache: {
		addSeriesToCache(series: SonarrSeries): Promise<void>;
	};
};

type ResolveSonarrAddPayloadInput = {
	api: Pick<SonarrClient, "getTags" | "createTag">;
	credentials: ProviderCredentials;
	defaults: SonarrFormState;
	form: SonarrFormState;
	title: string;
	tvdbId: TvdbId;
};

type ResolveSonarrSeriesUpdateInput = {
	api: Pick<
		SonarrClient,
		"getSeriesByTvdbId" | "getSeriesById" | "getTags" | "createTag"
	>;
	credentials: ProviderCredentials;
	form: SonarrFormState;
	title: string;
	tvdbId: TvdbId;
};

type ResolvedSonarrSeriesUpdate = {
	seriesId: SonarrSeriesId;
	payload: SonarrSeries;
	moveFiles: boolean;
};

export async function addSonarrSeries(
	input: AddSonarrSeriesInput,
	deps: SonarrMutationDeps,
): Promise<SonarrSeries> {
	const { client, cache } = deps;

	const payload = await resolveSonarrAddPayload({
		api: client,
		credentials: input.credentials,
		defaults: input.defaults,
		form: input.form,
		title: input.title,
		tvdbId: input.tvdbId,
	});

	const created = await client.addSeries(payload, input.credentials);
	await cache.addSeriesToCache(created);
	return created;
}

export async function updateSonarrSeries(
	input: UpdateSonarrSeriesInput,
	deps: SonarrMutationDeps,
): Promise<SonarrSeries> {
	const { client, cache } = deps;

	const resolvedUpdate = await resolveSonarrSeriesUpdate({
		api: client,
		credentials: input.credentials,
		form: input.form,
		title: input.title,
		tvdbId: input.tvdbId,
	});

	const updated = await client.updateSeries(
		resolvedUpdate.seriesId,
		resolvedUpdate.payload,
		input.credentials,
		{ moveFiles: resolvedUpdate.moveFiles },
	);

	await cache.addSeriesToCache(updated);

	if (
		input.monitoringAction === undefined ||
		input.monitoringAction === "noChange"
	) {
		return updated;
	}

	try {
		await client.applyMonitoringAction(
			resolvedUpdate.seriesId,
			input.monitoringAction,
			input.credentials,
		);
		const refreshed = await client.getSeriesById(
			resolvedUpdate.seriesId,
			input.credentials,
		);
		await cache.addSeriesToCache(refreshed);
		return refreshed;
	} catch (error) {
		const normalized = normalizeError(error);
		throw createError(
			normalized.code,
			`Updated Sonarr series ${resolvedUpdate.seriesId}, but applying monitoring action '${input.monitoringAction}' failed: ${normalized.message}`,
			`The series was updated, but Sonarr could not apply the monitoring action. ${normalized.userMessage}`,
			{
				...normalized.details,
				partialSuccess: true,
				step: "monitoringAction",
				monitoringAction: input.monitoringAction,
				seriesId: resolvedUpdate.seriesId,
			},
		);
	}
}

async function resolveSonarrAddPayload(
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

async function resolveSonarrSeriesUpdate(
	input: ResolveSonarrSeriesUpdateInput,
): Promise<ResolvedSonarrSeriesUpdate> {
	const { api, credentials, form, title, tvdbId } = input;

	if (!Number.isFinite(tvdbId)) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing or invalid TVDB ID for update.",
			"Unable to update this series because its TVDB ID is unknown.",
		);
	}

	const existing = await api.getSeriesByTvdbId(tvdbId, credentials);
	if (!existing) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Series with TVDB ID ${tvdbId} not found in Sonarr.`,
			"Cannot edit because this series is not present in your Sonarr library.",
		);
	}

	let baseSeries: SonarrSeries = existing;
	try {
		baseSeries = await api.getSeriesById(existing.id, credentials);
	} catch (error) {
		const normalized = normalizeError(error);
		logError(normalized, `Ani2arrApi:updateSeries:fetch:${tvdbId}`);
	}

	const qualityProfileId = resolveRequiredQualityProfileId({
		value: form.qualityProfileId,
		fallback: baseSeries.qualityProfileId,
		provider: "sonarr",
		entityLabel: "series",
		actionLabel: "update",
	});

	const rootFolderPath = resolveRequiredRootFolderPath({
		value: form.rootFolderPath,
		fallback: baseSeries.rootFolderPath,
		provider: "sonarr",
		entityLabel: "series",
		actionLabel: "update",
	});

	const tags = await resolveMutationTagIds(
		api,
		credentials,
		form.tags,
		form.freeformTags,
		"sonarr",
	);
	const seasonFolder = form.seasonFolder ?? baseSeries.seasonFolder;
	const seriesType = form.seriesType ?? baseSeries.seriesType;
	const monitored = form.monitored ?? baseSeries.monitored;

	const nextPath = joinRootAndSlug(
		rootFolderPath,
		buildProviderFolderSlug(baseSeries, title),
	);
	const moveFiles = shouldMoveProviderFiles(baseSeries.path, nextPath);
	const { addOptions, ...baseSeriesWithoutAddOptions } = baseSeries;
	void addOptions;

	return {
		seriesId: baseSeries.id,
		moveFiles,
		payload: {
			...baseSeriesWithoutAddOptions,
			qualityProfileId,
			rootFolderPath,
			path: nextPath,
			...(seasonFolder === undefined ? {} : { seasonFolder }),
			...(seriesType === undefined ? {} : { seriesType }),
			...(monitored === undefined ? {} : { monitored }),
			tags,
		},
	};
}
