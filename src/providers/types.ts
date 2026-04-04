/** Common provider-domain types owned by the provider domain. */
// src/providers/types.ts

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
