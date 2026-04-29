/** Common provider-domain types owned by the provider domain. */
// src/providers/types.ts

import type { ProviderQualityProfileId, ProviderTagId } from "./provider-id";

export const PROVIDERS = ["sonarr", "radarr"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface ProviderCredentials {
	url: string;
	apiKey: string;
}

export interface ProviderTag {
	id: ProviderTagId;
	label: string;
}

export interface ProviderRootFolder {
	freeSpace?: number | null;
	id: number;
	path: string;
}

export interface ProviderQualityProfile {
	id: ProviderQualityProfileId;
	name: string;
}

export interface ProviderMetadata {
	qualityProfiles: ProviderQualityProfile[];
	rootFolders: ProviderRootFolder[];
	tags: ProviderTag[];
}
