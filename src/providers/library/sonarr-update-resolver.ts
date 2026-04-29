/** Sonarr-only update payload resolver for provider library mutations. */
// src/providers/library/sonarr-update-resolver.ts

import type { SonarrClient } from "@/providers/clients/sonarr.client";
import {
	createError,
	ErrorCode,
	logError,
	normalizeError,
} from "@/shared/errors";
import type { SonarrFormState } from "@/providers/settings/provider-settings.schema";
import type {
	ProviderCredentials,
	SonarrSeries,
	SonarrSeriesId,
	TvdbId,
} from "@/providers";
import { buildProviderFolderSlug, joinRootAndSlug } from "./paths";
import {
	resolveMutationTagIds,
	resolveRequiredQualityProfileId,
	resolveRequiredRootFolderPath,
	shouldMoveProviderFiles,
} from "./mutation-helpers";

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

export async function resolveSonarrSeriesUpdate(
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
