/** Sonarr provider lookup client for mapping search requests. */
// src/services/mapping/lookup/sonarr-lookup.client.ts

import type { SonarrClient } from '@/integrations/providers/sonarr.client';
import type { SonarrLookupSeries } from '@/shared/types';
import type { ProviderCredentials } from '@/shared/types/providers';
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
