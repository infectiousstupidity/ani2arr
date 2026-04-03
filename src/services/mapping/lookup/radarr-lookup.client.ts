/** Radarr provider lookup client for mapping search requests. */
// src/services/mapping/lookup/radarr-lookup.client.ts

import type { RadarrClient } from '@/integrations/providers/radarr.client';
import type { RadarrLookupMovie } from '@/integrations/providers';
import type { ProviderCredentials } from '@/integrations/providers';
import { BaseLookupClient, type LookupCaches } from './base-lookup.client';

export class RadarrLookupClient extends BaseLookupClient<RadarrLookupMovie> {
  constructor(
    private readonly radarrApi: RadarrClient,
    caches: LookupCaches<RadarrLookupMovie>,
  ) {
    super('radarr', 'tmdb', 'RadarrLookupClient', caches);
  }

  public getExternalId(result: unknown): number | null {
    const candidate = result as { tmdbId?: unknown } | null;
    return typeof candidate?.tmdbId === 'number' && Number.isFinite(candidate.tmdbId)
      ? candidate.tmdbId
      : null;
  }

  protected fetchFromApi(
    term: string,
    credentials: ProviderCredentials,
  ): Promise<RadarrLookupMovie[]> {
    return this.radarrApi.lookupMovieByTerm(term, credentials);
  }
}
