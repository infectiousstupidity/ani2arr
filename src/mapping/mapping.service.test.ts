/** Tests for mapping-service precedence between exact truth, cached auto results, and candidate suppression. */
// src/mapping/mapping.service.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const createService = () => {
  const overrides: StubOverrides = {
    isIgnored: vi.fn(() => false),
    get: vi.fn(() => null),
    clear: vi.fn(async () => {}),
    getCandidateSuppression: vi.fn(() => null),
  };
  const upstreamMappingStore = {
    get: vi.fn<(anilistId: number) => { tvdbId: number; source: 'primary' | 'fallback' } | null>(() => null),
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

  const service = new MappingService(
    {} as never,
    upstreamMappingStore as never,
    lookupClients as never,
    resolverStateStore as never,
    overrides as never,
  );

  return {
    service,
    overrides,
    upstreamMappingStore,
    resolverStateStore,
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

    expect(result).toMatchObject({ providerId: 222, reason: 'exact' });
    expect(overrides.clear).toHaveBeenCalledWith('sonarr', 1);
    expect(resolverStateStore.set).toHaveBeenCalledWith(
      'sonarr',
      1,
      expect.objectContaining({
        state: 'mapped',
        providerId: 222,
        acceptedSource: 'upstream',
        acceptedReason: 'exact',
      }),
      expect.any(Object),
    );
  });

  it('keeps a manual override effective when it disagrees with exact upstream truth', async () => {
    const { service, overrides, upstreamMappingStore, resolverStateStore } = createService();
    overrides.get.mockReturnValue(222);
    upstreamMappingStore.get.mockReturnValue({ tvdbId: 999, source: 'primary' });

    const result = await service.resolveProviderId('sonarr', 1);

    expect(result).toMatchObject({ providerId: 222, reason: 'exact' });
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

    expect(result).toMatchObject({ providerId: 444, reason: 'exact' });
    expect(resolverStateStore.set).toHaveBeenCalledWith(
      'sonarr',
      7,
      expect.objectContaining({
        state: 'mapped',
        providerId: 444,
        acceptedSource: 'upstream',
        acceptedReason: 'exact',
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
      acceptedSource: 'auto',
      acceptedReason: 'fuzzy',
      updatedAt: 10,
    });

    const result = await service.resolveProviderId('sonarr', 5);

    expect(result).toMatchObject({ providerId: 333, reason: 'exact' });
    expect(resolverStateStore.get).not.toHaveBeenCalled();
  });
});
