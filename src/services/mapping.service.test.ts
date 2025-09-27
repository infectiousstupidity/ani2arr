import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'webextension-polyfill';
import type { AnilistApiService } from '@/api/anilist.api';
import type { SonarrApiService } from '@/api/sonarr.api';
import { MappingService } from '@/services/mapping.service';
import { extensionOptions } from '@/utils/storage';

vi.mock('idb-keyval', () => {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

describe('MappingService.resolveTvdbId', () => {
  const defaultOptions = {
    sonarrUrl: 'http://sonarr.local',
    sonarrApiKey: 'api-key',
    defaults: {
      qualityProfileId: '',
      rootFolderPath: '',
      seriesType: 'anime' as const,
      monitorOption: 'all' as const,
      seasonFolder: true,
      searchForMissingEpisodes: true,
      tags: [] as string[],
    },
  };

  beforeEach(() => {
    (globalThis as { browser?: Browser }).browser = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as Browser;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { browser?: Browser }).browser;
  });

  it('uses the hinted Sonarr lookup path when a primary title hint is provided', async () => {
    const sonarrApi = {
      lookupSeriesByTerm: vi.fn().mockResolvedValue([
        { title: 'Hint Title', tvdbId: 98765, year: 2024 },
      ]),
    };
    const anilistApi = {
      fetchMediaWithRelations: vi.fn(),
    };
    const service = new MappingService(
      sonarrApi as unknown as SonarrApiService,
      anilistApi as unknown as AnilistApiService,
    );

    const optionsSpy = vi
      .spyOn(extensionOptions, 'getValue')
      .mockResolvedValue(defaultOptions);

    const result = await service.resolveTvdbId(1234, {
      hints: { primaryTitle: 'Hint Title' },
    });

    expect(result).toEqual({ tvdbId: 98765, successfulSynonym: 'Hint Title' });
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledWith('Hint Title', {
      url: 'http://sonarr.local',
      apiKey: 'api-key',
    });
    expect(anilistApi.fetchMediaWithRelations).not.toHaveBeenCalled();
    expect(optionsSpy).toHaveBeenCalled();
  });
});
