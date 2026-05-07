/** LEGACY: Temporary Radarr form-state re-export until settings move into this package. */
// src/providers/radarr/form-state.ts

export {
	MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS,
	RADARR_MINIMUM_AVAILABILITY_OPTIONS,
	RadarrDefaultsSchema,
	RadarrFormStateSchema,
	normalizeRadarrFormState,
	stripRadarrFormStateForDefaults,
} from "@/providers/settings/provider-settings.schema";
export type {
	RadarrFormState,
	RadarrMinimumAvailability,
} from "@/providers/settings/provider-settings.schema";
