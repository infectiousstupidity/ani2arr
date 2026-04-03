/** Export surface for mapping provider lookup clients and their canonical types. */
// src/services/mapping/lookup/index.ts

export { BaseLookupClient, type LookupCaches } from './base-lookup.client';
export {
  type ProviderLookupClient,
  type ProviderLookupCacheHit,
  type ProviderLookupOptions,
  type ProviderLookupResult,
} from './provider-lookup.client';
export { SonarrLookupClient } from './sonarr-lookup.client';
export { RadarrLookupClient } from './radarr-lookup.client';
