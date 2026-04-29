/** Radarr provider lookup client for mapping search requests. */
// src/mapping/lookup/radarr-lookup.client.ts

import type { RadarrClient } from '@/providers/clients/radarr.client';
import { parseTmdbIdOrNull, type RadarrLookupMovie, type ProviderCredentials, type TmdbId } from '@/providers';
import { BaseLookupClient, type LookupCaches } from './base-lookup.client';

export class RadarrLookupClient extends BaseLookupClient<RadarrLookupMovie> {
  constructor(
    private readonly radarrApi: RadarrClient,
    caches: LookupCaches<RadarrLookupMovie>,
  ) {
    super('radarr', 'RadarrLookupClient', caches);
  }

  public getProviderId(result: unknown): TmdbId | null {
    const candidate = result as { tmdbId?: unknown } | null;
    return parseTmdbIdOrNull(candidate?.tmdbId);
  }

  protected fetchFromApi(
    term: string,
    credentials: ProviderCredentials,
  ): Promise<RadarrLookupMovie[]> {
    return this.radarrApi.lookupMovieByTerm(term, credentials);
  }
}
