/** Bootstrapping provider defaults */
// src/options-page/hooks/provider-default-bootstrapping.shared.ts

import {
	createDefaultRadarrFormState,
	createDefaultSonarrFormState,
} from "@/options/schema";
import type { Provider, ProviderMetadata } from "@/providers";
import {
	normalizeRadarrFormState,
	normalizeSonarrFormState,
	type RadarrFormState,
	type SonarrFormState,
} from "@/providers/settings/provider-settings.schema";

export function bootstrapSonarrDefaults(
	defaults: Partial<SonarrFormState> | null | undefined,
	metadata: ProviderMetadata,
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
	const firstQualityProfileId = metadata.qualityProfiles[0]?.id;
	const firstRootFolderPath = metadata.rootFolders[0]?.path;

	return normalizeSonarrFormState({
		...normalizedDefaults,
		qualityProfileId:
			normalizedDefaults.qualityProfileId ?? firstQualityProfileId,
		rootFolderPath: normalizedDefaults.rootFolderPath ?? firstRootFolderPath,
	});
}

export function bootstrapRadarrDefaults(
	defaults: Partial<RadarrFormState> | null | undefined,
	metadata: ProviderMetadata,
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
	const firstQualityProfileId = metadata.qualityProfiles[0]?.id;
	const firstRootFolderPath = metadata.rootFolders[0]?.path;

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
	metadata: ProviderMetadata,
): SonarrFormState;
export function bootstrapProviderDefaults(
	provider: "radarr",
	defaults: Partial<RadarrFormState> | null | undefined,
	metadata: ProviderMetadata,
): RadarrFormState;
export function bootstrapProviderDefaults(
	provider: Provider,
	defaults:
		| Partial<SonarrFormState>
		| Partial<RadarrFormState>
		| null
		| undefined,
	metadata: ProviderMetadata,
): SonarrFormState | RadarrFormState {
	return provider === "sonarr"
		? bootstrapSonarrDefaults(defaults as Partial<SonarrFormState>, metadata)
		: bootstrapRadarrDefaults(defaults as Partial<RadarrFormState>, metadata);
}
