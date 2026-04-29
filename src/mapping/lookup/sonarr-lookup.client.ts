/** Sonarr provider lookup client for mapping search requests. */
// src/mapping/lookup/sonarr-lookup.client.ts

import type { SonarrClient } from '@/providers/clients/sonarr.client';
import { parseTvdbIdOrNull, type SonarrLookupSeries, type ProviderCredentials, type TvdbId } from '@/providers';
import { BaseLookupClient, type LookupCaches } from './base-lookup.client';

export class SonarrLookupClient extends BaseLookupClient<SonarrLookupSeries> {
  constructor(
    private readonly sonarrApi: SonarrClient,
    caches: LookupCaches<SonarrLookupSeries>,
  ) {
    super('sonarr', 'SonarrLookupClient', caches);
  }

  public getProviderId(result: unknown): TvdbId | null {
    const candidate = result as { tvdbId?: unknown } | null;
    return parseTvdbIdOrNull(candidate?.tvdbId);
  }

  public lookupExactByProviderId(
    providerId: TvdbId,
    credentials: ProviderCredentials,
  ): Promise<SonarrLookupSeries | null> {
    return this.sonarrApi.lookupSeriesByTvdbId(providerId, credentials);
  }

  protected fetchFromApi(
    term: string,
    credentials: ProviderCredentials,
  ): Promise<SonarrLookupSeries[]> {
    return this.sonarrApi.lookupSeriesByTerm(term, credentials);
  }
}
