import type { RadarrClient } from '@/integrations/providers/radarr.client';
import type { RadarrLookupMovie } from '@/shared/types';
import { BaseLookupClient, type LookupCaches } from './base-lookup.client';
import type { LookupClientCredentials } from './provider-lookup.client';

export type RadarrLookupCredentials = LookupClientCredentials;

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
    credentials: LookupClientCredentials,
  ): Promise<RadarrLookupMovie[]> {
    return this.radarrApi.lookupMovieByTerm(term, credentials);
  }
}
