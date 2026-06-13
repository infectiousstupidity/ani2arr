/** Sonarr form state schemas, defaults, and storage/RPC normalization helpers. */
// src/providers/sonarr/form-state.ts

import * as v from "valibot";

import {
	ProviderQualityProfileIdSchema,
	ProviderTagIdSchema,
} from "@/providers/schemas";

import {
	SonarrMonitorNewItemsOptionSchema,
	SonarrMonitorOptionSchema,
	SonarrSeriesTypeSchema,
} from "./schemas";

const FreeformTagsSchema = v.fallback(v.array(v.string()), []);

const SonarrProviderFieldEntries = {
	qualityProfileId: v.optional(ProviderQualityProfileIdSchema),
	rootFolderPath: v.optional(v.string()),
	monitored: v.optional(v.boolean()),
	tags: v.optional(v.array(ProviderTagIdSchema)),
	seriesType: v.optional(SonarrSeriesTypeSchema),
	seasonFolder: v.optional(v.boolean()),
	freeformTags: FreeformTagsSchema,
	addOptions: v.optional(
		v.object({
			monitor: v.optional(SonarrMonitorOptionSchema),
			searchForMissingEpisodes: v.optional(v.boolean()),
			searchForCutoffUnmetEpisodes: v.optional(v.boolean()),
		}),
	),
} as const;

export const SonarrDefaultsSchema = v.object(SonarrProviderFieldEntries);

export const SonarrFormStateSchema = v.object({
	...SonarrProviderFieldEntries,
	monitorNewItems: v.optional(SonarrMonitorNewItemsOptionSchema),
});

export type SonarrFormState = v.InferOutput<typeof SonarrFormStateSchema>;

export function normalizeSonarrFormState(
	input: Partial<SonarrFormState> | null | undefined,
): SonarrFormState {
	return v.parse(SonarrFormStateSchema, input ?? {});
}

export function normalizeSonarrDefaults(
	input: Partial<SonarrFormState> | null | undefined,
): SonarrFormState {
	const defaults = normalizeSonarrFormState(input);

	return {
		...defaults,
		seriesType: defaults.seriesType ?? "anime",
		seasonFolder: defaults.seasonFolder ?? true,
		addOptions: {
			...defaults.addOptions,
			monitor: defaults.addOptions?.monitor ?? "all",
			searchForMissingEpisodes:
				defaults.addOptions?.searchForMissingEpisodes ?? true,
			searchForCutoffUnmetEpisodes:
				defaults.addOptions?.searchForCutoffUnmetEpisodes ?? false,
		},
	};
}

export function stripSonarrFormStateForDefaults(
	input: SonarrFormState,
): v.InferOutput<typeof SonarrDefaultsSchema> {
	return v.parse(SonarrDefaultsSchema, input);
}

export const createDefaultSonarrFormState = (): SonarrFormState =>
	normalizeSonarrDefaults({});
