/** Sonarr provider lookup client for mapping search requests. */
// src/mapping/lookup/sonarr-lookup.client.ts

import type { SonarrClient } from '@/providers/clients/sonarr.client';
import type { SonarrLookupSeries } from '@/providers';
import type { ProviderCredentials } from '@/providers';
import { BaseLookupClient, type LookupCaches } from './base-lookup.client';

export class SonarrLookupClient extends BaseLookupClient<SonarrLookupSeries> {
  constructor(
    private readonly sonarrApi: SonarrClient,
    caches: LookupCaches<SonarrLookupSeries>,
  ) {
    super('sonarr', 'tvdb', 'SonarrLookupClient', caches);
  }

  public getExternalId(result: unknown): number | null {
    const candidate = result as { tvdbId?: unknown } | null;
    return typeof candidate?.tvdbId === 'number' && Number.isFinite(candidate.tvdbId)
      ? candidate.tvdbId
      : null;
  }

  protected fetchFromApi(
    term: string,
    credentials: ProviderCredentials,
  ): Promise<SonarrLookupSeries[]> {
    return this.sonarrApi.lookupSeriesByTerm(term, credentials);
  }
}
