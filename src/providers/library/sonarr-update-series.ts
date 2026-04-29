/** Workflow that resolves provider state and updates an existing Sonarr series. */
// src/providers/library/sonarr-update-series.ts

import { resolveSonarrSeriesUpdate } from "./sonarr-update-resolver";
import type { SonarrLibrary } from "./sonarr-library";
import type { SonarrClient } from "@/providers/clients/sonarr.client";
import type {
	SonarrEditMonitoringAction,
	SonarrFormState,
} from "@/providers/settings/provider-settings.schema";
import type { ProviderCredentials, SonarrSeries, TvdbId } from "@/providers";
import { createError, normalizeError } from "@/shared/errors";

type UpdateSonarrSeriesInput = {
	tvdbId: TvdbId;
	title: string;
	form: SonarrFormState;
	monitoringAction?: SonarrEditMonitoringAction;
	credentials: ProviderCredentials;
};

type UpdateSonarrSeriesDeps = {
	client: Pick<
		SonarrClient,
		| "getSeriesByTvdbId"
		| "getSeriesById"
		| "getTags"
		| "createTag"
		| "updateSeries"
		| "applyMonitoringAction"
	>;
	library: Pick<SonarrLibrary, "addSeriesToCache">;
};

export async function updateSonarrSeries(
	input: UpdateSonarrSeriesInput,
	deps: UpdateSonarrSeriesDeps,
): Promise<SonarrSeries> {
	const { client, library } = deps;

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

	await library.addSeriesToCache(updated);

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
		await library.addSeriesToCache(refreshed);
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
