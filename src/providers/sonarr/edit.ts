/** Sonarr edit workflow for full-resource update saves and monitoring actions. */
// src/providers/sonarr/edit.ts

import type {
	SonarrEditOptions,
	SonarrQualityProfileId,
	SonarrSeries,
	SonarrSeriesId,
	TvdbId,
} from "./types";
import type { SonarrClient } from "./client";
import type { SonarrFormState } from "./form-state";
import type { SonarrEditMonitoringAction } from "./schemas";
import type { ProviderCredentials } from "../types";
import {
	createError,
	normalizeError,
} from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";
import {
	joinRootAndFolder,
	shouldMoveProviderFiles,
} from "../provider-media-paths";
import { resolveProviderTagIds } from "../provider-tags";

type SonarrSeriesChanges = Partial<SonarrEditOptions>;

type UpdateSonarrSeriesInput = {
	tvdbId: TvdbId;
	title: string;
	form: SonarrFormState;
	monitoringAction?: SonarrEditMonitoringAction;
	credentials: ProviderCredentials;
};

type UpdateSonarrSeriesDeps = {
	client: SonarrClient;
};

type ResolvedSonarrSeriesUpdate = {
	seriesId: SonarrSeriesId;
	payload: SonarrSeries;
	moveFiles: boolean;
};

function buildUpdateSonarrSeriesPayload(
	series: SonarrSeries,
	changes: SonarrSeriesChanges,
): SonarrSeries {
	return {
		...series,
		...changes,
	};
}

export async function updateSonarrSeries(
	input: UpdateSonarrSeriesInput,
	deps: UpdateSonarrSeriesDeps,
): Promise<SonarrSeries> {
	const resolvedUpdate = await resolveSonarrSeriesUpdate({
		client: deps.client,
		credentials: input.credentials,
		form: input.form,
		tvdbId: input.tvdbId,
	});

	const updated = await deps.client.updateSeries(
		resolvedUpdate.seriesId,
		resolvedUpdate.payload,
		input.credentials,
		{ moveFiles: resolvedUpdate.moveFiles },
	);

	if (
		input.monitoringAction === undefined ||
		input.monitoringAction === "noChange"
	) {
		return updated;
	}

	try {
		await deps.client.setSeriesMonitorMode(
			resolvedUpdate.seriesId,
			input.monitoringAction,
			input.credentials,
		);
		return deps.client.getSeriesById(
			resolvedUpdate.seriesId,
			input.credentials,
		);
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

async function resolveSonarrSeriesUpdate(input: {
	client: SonarrClient;
	credentials: ProviderCredentials;
	form: SonarrFormState;
	tvdbId: TvdbId;
}): Promise<ResolvedSonarrSeriesUpdate> {
	const { client, credentials, form, tvdbId } = input;

	if (!Number.isFinite(tvdbId)) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing or invalid TVDB ID for update.",
			"Unable to update this series because its TVDB ID is unknown.",
		);
	}

	const existing = await client.findSeriesByTvdbId(tvdbId, credentials);
	if (!existing) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Series with TVDB ID ${tvdbId} not found in Sonarr.`,
			"Cannot edit because this series is not present in your Sonarr library.",
		);
	}

	const baseSeries = await client.getSeriesById(existing.id, credentials);

	const qualityProfileId = resolveRequiredQualityProfileId({
		value: form.qualityProfileId,
		fallback: baseSeries.qualityProfileId,
	});
	const rootFolderPath = resolveRequiredRootFolderPath({
		value: form.rootFolderPath,
		fallback: baseSeries.rootFolderPath,
	});
	const tags = await resolveProviderTagIds({
		provider: "sonarr",
		client,
		credentials,
		existingIds: form.tags,
		freeformLabels: form.freeformTags,
	});

	const seasonFolder = form.seasonFolder ?? baseSeries.seasonFolder;
	const seriesType = form.seriesType ?? baseSeries.seriesType;
	const monitored = form.monitored ?? baseSeries.monitored;
	const monitorNewItems = form.monitorNewItems ?? baseSeries.monitorNewItems;
	const rootFolderChanged = shouldMoveProviderFiles(
		baseSeries.rootFolderPath,
		rootFolderPath,
	);
	const nextPath = rootFolderChanged
		? await resolveMovedSeriesPath({
				client,
				credentials,
				rootFolderPath,
				seriesId: baseSeries.id,
			})
		: baseSeries.path;
	const moveFiles = shouldMoveProviderFiles(baseSeries.path, nextPath);

	return {
		seriesId: baseSeries.id,
		moveFiles,
		payload: buildUpdateSonarrSeriesPayload(baseSeries, {
			qualityProfileId,
			rootFolderPath,
			path: nextPath,
			seasonFolder,
			seriesType,
			monitored,
			monitorNewItems,
			tags,
		}),
	};
}

async function resolveMovedSeriesPath(input: {
	client: SonarrClient;
	credentials: ProviderCredentials;
	rootFolderPath: string;
	seriesId: SonarrSeriesId;
}): Promise<string> {
	const generated = await input.client.getSeriesFolderName(
		input.seriesId,
		input.credentials,
	);
	const folderName = generated.folder.trim();

	if (!folderName) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing Sonarr series folder for update.",
			"Unable to update this series because Sonarr did not return a generated folder name.",
		);
	}

	return joinRootAndFolder(input.rootFolderPath, folderName);
}

function resolveRequiredQualityProfileId(input: {
	value: SonarrQualityProfileId | undefined;
	fallback: SonarrQualityProfileId | undefined;
}): SonarrQualityProfileId {
	const resolvedValue =
		typeof input.value === "number" && Number.isFinite(input.value)
			? input.value
			: input.fallback;

	if (typeof resolvedValue !== "number" || !Number.isFinite(resolvedValue)) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing Sonarr quality profile for update.",
			"Select a Sonarr quality profile before updating this series.",
		);
	}

	return resolvedValue;
}

function resolveRequiredRootFolderPath(input: {
	value: string | undefined;
	fallback: string | undefined;
}): string {
	const resolvedValue = input.value?.trim() || input.fallback?.trim() || "";

	if (!resolvedValue) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing Sonarr root folder for update.",
			"Select a Sonarr root folder before updating this series.",
		);
	}

	return resolvedValue;
}
