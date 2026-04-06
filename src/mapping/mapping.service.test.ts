/** Tests for mapping-service precedence between exact truth, cached auto results, and candidate suppression. */
// src/mapping/mapping.service.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearExtensionMappingFailures,
  removeExtensionMappingFailure,
  writeExtensionMappingFailure,
} from '@/mapping/cache/extension-mapping.cache';
import { createError, ErrorCode } from '@/shared/errors';
import {
  FAILURE_HARD_TTL,
  FAILURE_SOFT_TTL,
  NETWORK_FAILURE_HARD_TTL,
  NETWORK_FAILURE_SOFT_TTL,
} from './constants';
import { MappingService } from './mapping.service';

vi.mock('@/mapping/cache/extension-mapping.cache', () => ({
  clearExtensionMappingFailures: vi.fn(async () => {}),
  readExtensionMappingFailure: vi.fn(async () => null),
  removeExtensionMappingFailure: vi.fn(async () => {}),
  writeExtensionMappingFailure: vi.fn(async () => {}),
}));

vi.mock('@/debug/metrics', () => ({
  incrementCounter: vi.fn(),
}));

vi.mock('@/options', () => ({
  getExtensionOptionsSnapshot: vi.fn(async () => ({ sonarr: { url: 'http://localhost:8989', apiKey: 'test-key' } })),
  getProviderCredentials: vi.fn((options: { sonarr?: { url: string; apiKey: string } }, provider: string) =>
    provider === 'sonarr' ? options.sonarr ?? null : null),
}));

type StubOverrides = {
  isIgnored: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  getCandidateSuppression: ReturnType<typeof vi.fn>;
};

type StubResolverStateStore = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
};

type StubAniListApi = {
  fetchMediaWithRelations: ReturnType<typeof vi.fn>;
  prioritize: ReturnType<typeof vi.fn>;
  removeMediaFromCache: ReturnType<typeof vi.fn>;
};

const createService = () => {
  const anilistApi: StubAniListApi = {
    fetchMediaWithRelations: vi.fn(async () => {
      throw new Error('Unexpected AniList fetch');
    }),
    prioritize: vi.fn(),
    removeMediaFromCache: vi.fn(async () => {}),
  };
  const overrides: StubOverrides = {
    isIgnored: vi.fn(() => false),
    get: vi.fn(() => null),
    clear: vi.fn(async () => {}),
    getCandidateSuppression: vi.fn(() => null),
  };
  const upstreamMappingStore = {
    get: vi.fn<(anilistId: number) => { tvdbId: number; source: 'primary' | 'fallback' } | null>(() => null),
    init: vi.fn(async () => {}),
  };
  const resolverStateStore: StubResolverStateStore = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => true),
    delete: vi.fn(async () => false),
    clear: vi.fn(async () => false),
  };
  const lookupClients = {
    sonarr: { reset: vi.fn(async () => {}) },
    radarr: { reset: vi.fn(async () => {}) },
  };
  const notifyMappingsChanged = vi.fn();

  const service = new MappingService(
    anilistApi as never,
    upstreamMappingStore as never,
    lookupClients as never,
    resolverStateStore as never,
    overrides as never,
    notifyMappingsChanged,
  );

  return {
    anilistApi,
    service,
    overrides,
    upstreamMappingStore,
    resolverStateStore,
    lookupClients,
    notifyMappingsChanged,
  };
};

describe('MappingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('collapses a matching manual override into exact upstream truth', async () => {
    const { service, overrides, upstreamMappingStore, resolverStateStore } = createService();
    overrides.get.mockReturnValue(222);
    upstreamMappingStore.get.mockReturnValue({ tvdbId: 222, source: 'primary' });

    const result = await service.resolveProviderId('sonarr', 1);

    expect(result).toMatchObject({ providerId: 222, reason: 'exact-upstream' });
    expect(overrides.clear).toHaveBeenCalledWith('sonarr', 1);
    expect(resolverStateStore.set).toHaveBeenCalledWith(
      'sonarr',
      1,
      expect.objectContaining({
        state: 'mapped',
        providerId: 222,
        acceptedEvidence: expect.objectContaining({
          source: 'upstream',
          reason: 'exact-upstream',
        }),
      }),
      expect.any(Object),
    );
  });

  it('keeps a manual override effective when it disagrees with exact upstream truth', async () => {
    const { service, overrides, upstreamMappingStore, resolverStateStore } = createService();
    overrides.get.mockReturnValue(222);
    upstreamMappingStore.get.mockReturnValue({ tvdbId: 999, source: 'primary' });

    const result = await service.resolveProviderId('sonarr', 1);

    expect(result).toMatchObject({ providerId: 222, reason: 'manual-override' });
    expect(overrides.clear).not.toHaveBeenCalled();
    expect(resolverStateStore.set).not.toHaveBeenCalled();
  });

  it('does not let rejected candidates suppress exact upstream truth', async () => {
    const { service, overrides, upstreamMappingStore, resolverStateStore } = createService();
    overrides.getCandidateSuppression.mockImplementation(
      (_provider: string, _anilistId: number, providerId: number) => (providerId === 444 ? 'rejected' : null),
    );
    upstreamMappingStore.get.mockReturnValue({ tvdbId: 444, source: 'primary' });

    const result = await service.resolveProviderId('sonarr', 7);

    expect(result).toMatchObject({ providerId: 444, reason: 'exact-upstream' });
    expect(resolverStateStore.set).toHaveBeenCalledWith(
      'sonarr',
      7,
      expect.objectContaining({
        state: 'mapped',
        providerId: 444,
        acceptedEvidence: expect.objectContaining({
          source: 'upstream',
          reason: 'exact-upstream',
        }),
      }),
      expect.any(Object),
    );
  });

  it('prefers exact upstream over a cached auto mapping', async () => {
    const { service, upstreamMappingStore, resolverStateStore } = createService();
    upstreamMappingStore.get.mockReturnValue({ tvdbId: 333, source: 'primary' });
    resolverStateStore.get.mockResolvedValue({
      state: 'mapped',
      providerId: 999,
      acceptedEvidence: {
        source: 'auto',
        reason: 'fuzzy-match',
      },
      updatedAt: 10,
    });

    const result = await service.resolveProviderId('sonarr', 5);

    expect(result).toMatchObject({ providerId: 333, reason: 'exact-upstream' });
    expect(resolverStateStore.get).not.toHaveBeenCalled();
  });

  it('records recent evaluation trace candidates across rejected hint and accepted pipeline results', async () => {
    const overrides: StubOverrides = {
      isIgnored: vi.fn(() => false),
      get: vi.fn(() => null),
      clear: vi.fn(async () => {}),
      getCandidateSuppression: vi.fn(
        (_provider: string, _anilistId: number, providerId: number) => (providerId === 101 ? 'rejected' : null),
      ),
    };
    const upstreamMappingStore = {
      get: vi.fn(() => null),
    };
    const resolverStateStore: StubResolverStateStore = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => true),
      delete: vi.fn(async () => false),
      clear: vi.fn(async () => false),
    };
    let rejectedHintHits = 0;
    const lookupClient = {
      provider: 'sonarr' as const,
      reset: vi.fn(async () => {}),
      readFromCache: vi.fn(async () => ({ results: [], hit: 'none' as const })),
      lookup: vi.fn(async (_canonical: string, rawTerm: string) => {
        if (rawTerm === 'Rejected Hint') {
          rejectedHintHits += 1;
          return rejectedHintHits === 1
            ? [{ title: 'Rejected Hint', tvdbId: 101, year: 2013 }]
            : [];
        }
        return [
          { title: 'Attack on Titan', tvdbId: 202, year: 2013 },
          { title: 'Attack Titan', tvdbId: 303, year: 2013 },
        ];
      }),
      getProviderId: vi.fn((result: { tvdbId?: number }) => result.tvdbId ?? null),
    };

    const service = new MappingService(
      {
        fetchMediaWithRelations: vi.fn(async () => ({
          id: 77,
          format: 'TV',
          title: { english: 'Attack on Titan' },
          synonyms: [],
          startDate: { year: 2013 },
        })),
        iteratePrequelChain: async function* () {
          yield* [];
        },
      } as never,
      upstreamMappingStore as never,
      { sonarr: lookupClient, radarr: { reset: vi.fn(async () => {}) } } as never,
      resolverStateStore as never,
      overrides as never,
    );

    const result = await service.resolveProviderId('sonarr', 77, {
      hints: {
        primaryTitle: 'Rejected Hint',
      },
    });

    expect(result).toMatchObject({ providerId: 202, reason: 'exact-title-match' });
    expect(resolverStateStore.set).toHaveBeenCalledWith(
      'sonarr',
      77,
      expect.objectContaining({
        state: 'mapped',
        providerId: 202,
        acceptedEvidence: expect.objectContaining({
          source: 'auto',
          reason: 'exact-title-match',
        }),
        recentEvaluation: expect.objectContaining({
          searchTerms: ['Rejected Hint', 'Attack on Titan'],
          candidates: expect.arrayContaining([
            expect.objectContaining({ providerId: 101, status: 'rejected' }),
            expect.objectContaining({ providerId: 202, status: 'accepted' }),
            expect.objectContaining({ providerId: 303, status: 'not-accepted' }),
          ]),
        }),
      }),
      expect.any(Object),
    );
  });

  it('resolves from metadata hints before fetching AniList media', async () => {
    const overrides: StubOverrides = {
      isIgnored: vi.fn(() => false),
      get: vi.fn(() => null),
      clear: vi.fn(async () => {}),
      getCandidateSuppression: vi.fn(() => null),
    };
    const upstreamMappingStore = {
      get: vi.fn(() => null),
    };
    const resolverStateStore: StubResolverStateStore = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => true),
      delete: vi.fn(async () => false),
      clear: vi.fn(async () => false),
    };
    const fetchMediaWithRelations = vi.fn(async () => {
      throw new Error('Unexpected AniList fetch');
    });
    const lookupClient = {
      provider: 'sonarr' as const,
      reset: vi.fn(async () => {}),
      readFromCache: vi.fn(async () => ({ results: [], hit: 'none' as const })),
      lookup: vi.fn(async () => [
        { title: 'Attack on Titan', tvdbId: 202, year: 2013 },
      ]),
      getProviderId: vi.fn((result: { tvdbId?: number }) => result.tvdbId ?? null),
    };

    const service = new MappingService(
      {
        fetchMediaWithRelations,
        iteratePrequelChain: async function* () {
          yield* [];
        },
      } as never,
      upstreamMappingStore as never,
      { sonarr: lookupClient, radarr: { reset: vi.fn(async () => {}) } } as never,
      resolverStateStore as never,
      overrides as never,
    );

    const result = await service.resolveProviderId('sonarr', 77, {
      hints: {
        domMedia: {
          titles: { english: 'Attack on Titan' },
          startYear: 2013,
          format: 'TV',
        },
      },
    });

    expect(result).toMatchObject({ providerId: 202, reason: 'exact-title-match' });
    expect(fetchMediaWithRelations).not.toHaveBeenCalled();
  });

  it('falls back to a borrowed base-title lookup after inherited verification rejects the relation candidate', async () => {
    const overrides: StubOverrides = {
      isIgnored: vi.fn(() => false),
      get: vi.fn((provider: string, anilistId: number) => (
        provider === 'sonarr' && anilistId === 88 ? 111 : null
      )),
      clear: vi.fn(async () => {}),
      getCandidateSuppression: vi.fn(() => null),
    };
    const upstreamMappingStore = {
      get: vi.fn(() => null),
    };
    const resolverStateStore: StubResolverStateStore = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => true),
      delete: vi.fn(async () => false),
      clear: vi.fn(async () => false),
    };
    const fetchMediaWithRelations = vi.fn(async (anilistId: number) => {
      if (anilistId === 77) {
        return {
          id: 77,
          format: 'TV',
          title: { english: 'Bleach: Thousand-Year Blood War' },
          synonyms: [],
          relations: {
            edges: [{ relationType: 'PREQUEL', node: { id: 88 } }],
          },
        };
      }
      if (anilistId === 88) {
        return {
          id: 88,
          format: 'TV',
          title: { english: 'Bleach Season 2' },
          synonyms: [],
          relations: { edges: [] },
        };
      }
      throw new Error(`Unexpected AniList fetch ${anilistId}`);
    });
    const lookupClient = {
      provider: 'sonarr' as const,
      reset: vi.fn(async () => {}),
      readFromCache: vi.fn(async () => ({ results: [], hit: 'none' as const })),
      lookup: vi.fn(async (_canonical: string, rawTerm: string) => {
        if (rawTerm === 'Bleach') {
          return [{ title: 'Bleach', tvdbId: 222, year: 2004 }];
        }
        return [];
      }),
      lookupExactByProviderId: vi.fn(async () => ({
        title: 'Naruto',
        tvdbId: 111,
      })),
      getProviderId: vi.fn((result: { tvdbId?: number }) => result.tvdbId ?? null),
    };

    const service = new MappingService(
      {
        fetchMediaWithRelations,
      } as never,
      upstreamMappingStore as never,
      { sonarr: lookupClient, radarr: { reset: vi.fn(async () => {}) } } as never,
      resolverStateStore as never,
      overrides as never,
    );

    const result = await service.resolveProviderId('sonarr', 77);

    expect(result).toMatchObject({ providerId: 222, reason: 'borrowed-base-title-fallback' });
    expect(resolverStateStore.set).toHaveBeenCalledWith(
      'sonarr',
      77,
      expect.objectContaining({
        state: 'mapped',
        providerId: 222,
        acceptedEvidence: expect.objectContaining({
          source: 'auto',
          reason: 'borrowed-base-title-fallback',
        }),
        recentEvaluation: expect.objectContaining({
          candidates: expect.arrayContaining([
            expect.objectContaining({ providerId: 111, status: 'not-accepted', reason: 'verified-inherited' }),
            expect.objectContaining({ providerId: 222, status: 'accepted', reason: 'borrowed-base-title-fallback' }),
          ]),
        }),
      }),
      expect.any(Object),
    );
  });

  it('records verification-failed instead of auto-accepting an inherited relation candidate when exact verification cannot complete', async () => {
    const overrides: StubOverrides = {
      isIgnored: vi.fn(() => false),
      get: vi.fn(() => null),
      clear: vi.fn(async () => {}),
      getCandidateSuppression: vi.fn(() => null),
    };
    const upstreamMappingStore = {
      get: vi.fn((anilistId: number) => (anilistId === 91 ? { tvdbId: 333, source: 'primary' as const } : null)),
    };
    const resolverStateStore: StubResolverStateStore = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => true),
      delete: vi.fn(async () => false),
      clear: vi.fn(async () => false),
    };
    const fetchMediaWithRelations = vi.fn(async (anilistId: number) => {
      if (anilistId === 90) {
        return {
          id: 90,
          format: 'TV',
          title: { english: 'Attack on Titan Final Season' },
          synonyms: [],
          relations: {
            edges: [{ relationType: 'PREQUEL', node: { id: 91 } }],
          },
        };
      }
      if (anilistId === 91) {
        return {
          id: 91,
          format: 'TV',
          title: { english: 'Attack on Titan Season 3' },
          synonyms: [],
          relations: { edges: [] },
        };
      }
      throw new Error(`Unexpected AniList fetch ${anilistId}`);
    });
    const lookupClient = {
      provider: 'sonarr' as const,
      reset: vi.fn(async () => {}),
      readFromCache: vi.fn(async () => ({ results: [], hit: 'none' as const })),
      lookup: vi.fn(async () => [{ title: 'Attack on Titan', tvdbId: 444, year: 2013 }]),
      lookupExactByProviderId: vi.fn(async () => {
        throw createError(
          ErrorCode.NETWORK_ERROR,
          'Timed out reaching Sonarr.',
          'Unable to verify the inherited series right now.',
        );
      }),
      getProviderId: vi.fn((result: { tvdbId?: number }) => result.tvdbId ?? null),
    };

    const service = new MappingService(
      {
        fetchMediaWithRelations,
      } as never,
      upstreamMappingStore as never,
      { sonarr: lookupClient, radarr: { reset: vi.fn(async () => {}) } } as never,
      resolverStateStore as never,
      overrides as never,
    );

    const result = await service.resolveProviderId('sonarr', 90);

    expect(result).toBeNull();
    expect(resolverStateStore.set).toHaveBeenCalledWith(
      'sonarr',
      90,
      expect.objectContaining({
        state: 'verification-failed',
        recentEvaluation: expect.objectContaining({
          candidates: expect.arrayContaining([
            expect.objectContaining({ providerId: 333, reason: 'verified-inherited', status: 'not-accepted' }),
          ]),
        }),
      }),
      expect.any(Object),
    );
  });

  it('resets lookup clients, failure cache, resolver state, and notifications', async () => {
    const { service, lookupClients, resolverStateStore, notifyMappingsChanged } = createService();

    await service.resetLookupState();

    expect(lookupClients.sonarr.reset).toHaveBeenCalledTimes(1);
    expect(lookupClients.radarr.reset).toHaveBeenCalledTimes(1);
    expect(clearExtensionMappingFailures).toHaveBeenCalledTimes(1);
    expect(resolverStateStore.clear).toHaveBeenCalledTimes(1);
    expect(notifyMappingsChanged).toHaveBeenCalledTimes(1);
  });

  it('delegates static pair initialization to the upstream mapping store', async () => {
    const { service, upstreamMappingStore } = createService();

    await service.initStaticPairs();

    expect(upstreamMappingStore.init).toHaveBeenCalledTimes(1);
  });

  it('prioritizes AniList media through the optional API with the requested scheduling mode', () => {
    const { service, anilistApi } = createService();

    service.prioritizeAniListMedia(99, { schedule: true });

    expect(anilistApi.prioritize).toHaveBeenCalledWith(99, { schedule: true });
  });

  it('evicts resolved state, clears the failure cache, evicts AniList media, and notifies listeners', async () => {
    const { service, anilistApi, resolverStateStore, notifyMappingsChanged } = createService();

    await service.evictResolved(44, 'radarr');

    expect(resolverStateStore.delete).toHaveBeenCalledWith('radarr', 44);
    expect(removeExtensionMappingFailure).toHaveBeenCalledWith('radarr', 44);
    expect(anilistApi.removeMediaFromCache).toHaveBeenCalledWith(44);
    expect(notifyMappingsChanged).toHaveBeenCalledTimes(1);
  });

  it('caches network failures with the shorter network TTLs', async () => {
    const { service, anilistApi } = createService();
    const error = createError(
      ErrorCode.NETWORK_ERROR,
      'Timed out reaching AniList.',
      'Unable to connect right now.',
    );
    anilistApi.fetchMediaWithRelations.mockRejectedValue(error);

    await expect(service.resolveProviderId('sonarr', 12)).rejects.toMatchObject({
      code: ErrorCode.NETWORK_ERROR,
    });

    expect(writeExtensionMappingFailure).toHaveBeenCalledWith('sonarr', 12, error, {
      staleMs: NETWORK_FAILURE_SOFT_TTL,
      hardMs: NETWORK_FAILURE_HARD_TTL,
    });
  });

  it('caches configuration failures with the default failure TTLs', async () => {
    const { service } = createService();

    await expect(service.resolveProviderId('radarr', 18)).rejects.toMatchObject({
      code: ErrorCode.CONFIGURATION_ERROR,
    });

    expect(writeExtensionMappingFailure).toHaveBeenCalledWith(
      'radarr',
      18,
      expect.objectContaining({ code: ErrorCode.CONFIGURATION_ERROR }),
      {
        staleMs: FAILURE_SOFT_TTL,
        hardMs: FAILURE_HARD_TTL,
      },
    );
  });
});
