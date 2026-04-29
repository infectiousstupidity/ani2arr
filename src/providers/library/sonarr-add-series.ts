/** Workflow that resolves AniList mapping, builds payload, and adds a Sonarr series. */
// src/providers/library/sonarr-add-series.ts

import { resolveSonarrAddPayload } from "./sonarr-add-payload";
import type { AniListId } from "@/anilist";
import type { SonarrLibrary } from "./sonarr-library";
import type { SonarrClient } from "@/providers/clients/sonarr.client";
import type { MappingService } from "@/mapping/mapping.service";
import type { AutoMappingOptions } from "@/mapping/auto-mapping/types";
import { createError, ErrorCode } from "@/shared/errors";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import type { SonarrFormState } from "@/providers/settings/provider-settings.schema";
import type { ProviderCredentials, SonarrSeries } from "@/providers";

type AddSonarrSeriesInput = {
	anilistId: AniListId;
	title: string;
	primaryTitleHint?: string;
	metadata?: AniListMediaHint | null;
	form: SonarrFormState;
	defaults: SonarrFormState;
	credentials: ProviderCredentials;
};

type AddSonarrSeriesDeps = {
	client: Pick<SonarrClient, "addSeries" | "getTags" | "createTag">;
	mappingService: Pick<MappingService, "resolveProviderId">;
	library: Pick<SonarrLibrary, "addSeriesToCache">;
};

export async function addSonarrSeries(
	input: AddSonarrSeriesInput,
	deps: AddSonarrSeriesDeps,
): Promise<SonarrSeries> {
	const { client, mappingService, library } = deps;

	const resolveOptions: AutoMappingOptions = { ignoreFailureCache: true };
	const hints: NonNullable<AutoMappingOptions["hints"]> = {};
	if (input.primaryTitleHint) hints.primaryTitle = input.primaryTitleHint;
	if (input.metadata) hints.domMedia = input.metadata;
	if (Object.keys(hints).length > 0) resolveOptions.hints = hints;

	const mapping = await mappingService.resolveProviderId(
		"sonarr",
		input.anilistId,
		resolveOptions,
	);
	if (!mapping) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Could not resolve AniList ID ${input.anilistId} to a TVDB ID.`,
			"Unable to add this series to Sonarr because no matching TVDB entry was found.",
		);
	}

	const payload = await resolveSonarrAddPayload({
		api: client,
		credentials: input.credentials,
		defaults: input.defaults,
		form: input.form,
		title: input.title,
		tvdbId: mapping.providerId,
	});

	const created = await client.addSeries(payload, input.credentials);
	await library.addSeriesToCache(created);
	return created;
}
