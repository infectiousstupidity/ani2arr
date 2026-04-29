/** Radarr-only add payload builder for provider library mutations. */
// src/providers/library/radarr-add-payload.ts

import type {
	AddRadarrMoviePayload,
	RadarrClient,
} from "@/providers/clients/radarr.client";
import type { RadarrFormState } from "@/providers/settings/provider-settings.schema";
import type { ProviderCredentials, TmdbId } from "@/providers";
import {
	resolveMutationTagIds,
	resolveRequiredQualityProfileId,
	resolveRequiredRootFolderPath,
} from "./mutation-helpers";

type ResolveRadarrAddPayloadInput = {
	api: Pick<RadarrClient, "getTags" | "createTag">;
	credentials: ProviderCredentials;
	defaults: RadarrFormState;
	form: RadarrFormState;
	title: string;
	tmdbId: TmdbId;
	year?: number;
};

export async function resolveRadarrAddPayload(
	input: ResolveRadarrAddPayloadInput,
): Promise<AddRadarrMoviePayload> {
	const { api, credentials, defaults, form, title, tmdbId, year } = input;
	const searchForMovie =
		form.addOptions?.searchForMovie ?? defaults.addOptions?.searchForMovie;

	const qualityProfileId = resolveRequiredQualityProfileId({
		value: form.qualityProfileId,
		fallback: defaults.qualityProfileId,
		provider: "radarr",
		entityLabel: "movie",
		actionLabel: "add",
	});

	const rootFolderPath = resolveRequiredRootFolderPath({
		value: form.rootFolderPath,
		fallback: defaults.rootFolderPath,
		provider: "radarr",
		entityLabel: "movie",
		actionLabel: "add",
	});

	const tags = await resolveMutationTagIds(
		api,
		credentials,
		form.tags,
		form.freeformTags,
		"radarr",
	);

	return {
		title,
		tmdbId,
		qualityProfileId,
		rootFolderPath,
		...(form.monitored === undefined ? {} : { monitored: form.monitored }),
		...(form.minimumAvailability === undefined
			? {}
			: { minimumAvailability: form.minimumAvailability }),
		tags,
		...(typeof year === "number" ? { year } : {}),
		...(searchForMovie === undefined ? {} : { addOptions: { searchForMovie } }),
	};
}
