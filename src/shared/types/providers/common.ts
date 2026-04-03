/** Canonical provider-common shared types reused across provider integrations, RPC, and UI flows. */
// src/shared/types/providers/common.ts

export type Provider = 'sonarr' | 'radarr';

export interface ProviderCredentials {
  url: string;
  apiKey: string;
}

export interface ProviderTag {
  id: number;
  label: string;
}

export interface ProviderRootFolder {
  freeSpace?: number | null;
  id: number;
  path: string;
}

export interface ProviderQualityProfile {
  id: number;
  name: string;
}

export interface ProviderMetadata {
  qualityProfiles: ProviderQualityProfile[];
  rootFolders: ProviderRootFolder[];
  tags: ProviderTag[];
}
