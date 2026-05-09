/** Bootstrapping provider defaults */
// src/options-page/hooks/provider-default-bootstrapping.shared.ts

import {
	createDefaultRadarrFormState,
	createDefaultSonarrFormState,
} from "@/settings/schema";
import type { Provider, ProviderFormOptions } from "@/providers";
import {
	normalizeSonarrFormState,
	type SonarrFormState,
} from "@/providers/sonarr/form-state";
import {
	normalizeRadarrFormState,
	type RadarrFormState,
} from "@/providers/radarr/form-state";

export function bootstrapSonarrDefaults(
	defaults: Partial<SonarrFormState> | null | undefined,
	formOptions: ProviderFormOptions,
): SonarrFormState {
	const baseDefaults = createDefaultSonarrFormState();
	const normalizedDefaults = normalizeSonarrFormState({
		...baseDefaults,
		...defaults,
		addOptions: {
			...baseDefaults.addOptions,
			...defaults?.addOptions,
		},
	});
	const firstQualityProfileId = formOptions.qualityProfiles[0]?.id;
	const firstRootFolderPath = formOptions.rootFolders[0]?.path;

	return normalizeSonarrFormState({
		...normalizedDefaults,
		qualityProfileId:
			normalizedDefaults.qualityProfileId ?? firstQualityProfileId,
		rootFolderPath: normalizedDefaults.rootFolderPath ?? firstRootFolderPath,
	});
}

export function bootstrapRadarrDefaults(
	defaults: Partial<RadarrFormState> | null | undefined,
	formOptions: ProviderFormOptions,
): RadarrFormState {
	const baseDefaults = createDefaultRadarrFormState();
	const normalizedDefaults = normalizeRadarrFormState({
		...baseDefaults,
		...defaults,
		addOptions: {
			...baseDefaults.addOptions,
			...defaults?.addOptions,
		},
	});
	const firstQualityProfileId = formOptions.qualityProfiles[0]?.id;
	const firstRootFolderPath = formOptions.rootFolders[0]?.path;

	return normalizeRadarrFormState({
		...normalizedDefaults,
		qualityProfileId:
			normalizedDefaults.qualityProfileId ?? firstQualityProfileId,
		rootFolderPath: normalizedDefaults.rootFolderPath ?? firstRootFolderPath,
	});
}

export function bootstrapProviderDefaults(
	provider: "sonarr",
	defaults: Partial<SonarrFormState> | null | undefined,
	formOptions: ProviderFormOptions,
): SonarrFormState;
export function bootstrapProviderDefaults(
	provider: "radarr",
	defaults: Partial<RadarrFormState> | null | undefined,
	formOptions: ProviderFormOptions,
): RadarrFormState;
export function bootstrapProviderDefaults(
	provider: Provider,
	defaults:
		| Partial<SonarrFormState>
		| Partial<RadarrFormState>
		| null
		| undefined,
	formOptions: ProviderFormOptions,
): SonarrFormState | RadarrFormState {
	return provider === "sonarr"
		? bootstrapSonarrDefaults(defaults as Partial<SonarrFormState>, formOptions)
		: bootstrapRadarrDefaults(
				defaults as Partial<RadarrFormState>,
				formOptions,
			);
}
