/** Tests for trusted relation inheritance traversal and exact inherited verification. */
// src/mapping/hints/verified-inheritance.test.ts

import { describe, expect, it, vi } from 'vitest';
import type { AniListMedia } from '@/anilist/schemas/media.schema';
import type { ProviderCredentials, SonarrLookupSeries } from '@/providers';
import { verifyInheritedSonarrCandidate } from './inherited-verifier';
import { attemptVerifiedInheritedSonarrResolution } from './verified-inheritance';

const TEST_CREDENTIALS: ProviderCredentials = {
  url: 'http://localhost:8989',
  apiKey: 'test-key',
};

function createMedia(
  id: number,
  title: string,
  relations: Array<{ relationType: 'PREQUEL' | 'SEQUEL'; id: number }> = [],
): AniListMedia {
  return {
    id,
    format: 'TV',
    title: { english: title },
    synonyms: [],
    relations: {
      edges: relations.map(relation => ({
        relationType: relation.relationType,
        node: { id: relation.id },
      })),
    },
  } as AniListMedia;
}

describe('verifyInheritedSonarrCandidate', () => {
  it('accepts when exact Sonarr metadata confirms title-family continuity', async () => {
    const result = await verifyInheritedSonarrCandidate(
      createMedia(1, 'Attack on Titan Final Season'),
      {
        providerId: 100,
        borrowedBaseTitle: 'Attack on Titan',
        immediateSourceAniListId: 2,
        chainAnchorAniListId: 2,
      },
      {
        lookupExactByProviderId: vi.fn(async () => ({
          title: 'Attack on Titan',
          tvdbId: 100,
        } satisfies SonarrLookupSeries)),
      },
      TEST_CREDENTIALS,
    );

    expect(result.verdict).toBe('accept');
    expect(result.details.positiveSignals.length).toBeGreaterThan(0);
    expect(result.details.contradictions).toEqual([]);
  });

  it('rejects when exact Sonarr metadata contradicts the AniList title family', async () => {
    const result = await verifyInheritedSonarrCandidate(
      createMedia(1, 'Bleach'),
      {
        providerId: 100,
        borrowedBaseTitle: 'Bleach',
        immediateSourceAniListId: 2,
        chainAnchorAniListId: 2,
      },
      {
        lookupExactByProviderId: vi.fn(async () => ({
          title: 'Naruto',
          tvdbId: 100,
        } satisfies SonarrLookupSeries)),
      },
      TEST_CREDENTIALS,
    );

    expect(result.verdict).toBe('reject');
    expect(result.details.contradictions).toEqual([
      'Exact Sonarr titles conflict with the current and trusted related AniList title families.',
    ]);
  });

  it('returns ambiguous when exact Sonarr metadata is too generic to accept', async () => {
    const result = await verifyInheritedSonarrCandidate(
      createMedia(1, 'Special'),
      {
        providerId: 100,
        immediateSourceAniListId: 2,
        chainAnchorAniListId: 2,
      },
      {
        lookupExactByProviderId: vi.fn(async () => ({
          title: 'Special',
          tvdbId: 100,
        } satisfies SonarrLookupSeries)),
      },
      TEST_CREDENTIALS,
    );

    expect(result.verdict).toBe('ambiguous');
    expect(result.details.positiveSignals).toEqual([]);
    expect(result.details.contradictions).toEqual([]);
  });
});

describe('attemptVerifiedInheritedSonarrResolution', () => {
  it('uses trusted anchors only and prefers the nearest relation depth', async () => {
    const mediaById = new Map<number, AniListMedia>([
      [1, createMedia(1, 'Attack on Titan Final Season', [{ relationType: 'PREQUEL', id: 2 }])],
      [2, createMedia(2, 'Attack on Titan Season 3', [{ relationType: 'PREQUEL', id: 4 }])],
      [4, createMedia(4, 'Attack on Titan Season 2')],
    ]);

    const exactLookup = vi.fn(async (providerId: number) => ({
      title: providerId === 200 ? 'Attack on Titan' : 'Wrong Show',
      tvdbId: providerId,
    } satisfies SonarrLookupSeries));

    const result = await attemptVerifiedInheritedSonarrResolution({
      media: mediaById.get(1)!,
      anilistApi: {
        fetchMediaWithRelations: vi.fn(async (id: number) => mediaById.get(id)!),
      } as never,
      upstreamMappingStore: {
        get: vi.fn((anilistId: number) => {
          if (anilistId === 4) {
            return { tvdbId: 400, source: 'primary' as const };
          }
          return null;
        }),
      } as never,
      overrides: {
        isIgnored: vi.fn(() => false),
        get: vi.fn((_: 'sonarr', anilistId: number) => (anilistId === 2 ? 200 : null)),
      },
      lookupClient: {
        provider: 'sonarr',
        reset: vi.fn(async () => {}),
        readFromCache: vi.fn(async () => ({ results: [], hit: 'none' as const })),
        lookup: vi.fn(async () => []),
        getProviderId: vi.fn(() => null),
        lookupExactByProviderId: exactLookup,
      },
      credentials: TEST_CREDENTIALS,
    });

    expect(result).toMatchObject({
      status: 'accepted',
      resolved: {
        providerId: 200,
        immediateSourceAniListId: 2,
        chainAnchorAniListId: 2,
      },
    });
    expect(exactLookup).toHaveBeenCalledWith(200, TEST_CREDENTIALS);
  });

  it('returns ambiguous when nearest trusted anchors disagree', async () => {
    const mediaById = new Map<number, AniListMedia>([
      [1, createMedia(1, 'Attack on Titan Final Season', [
        { relationType: 'PREQUEL', id: 2 },
        { relationType: 'SEQUEL', id: 3 },
      ])],
      [2, createMedia(2, 'Attack on Titan Season 3')],
      [3, createMedia(3, 'Attack on Titan Season 5')],
    ]);

    const exactLookup = vi.fn();
    const result = await attemptVerifiedInheritedSonarrResolution({
      media: mediaById.get(1)!,
      anilistApi: {
        fetchMediaWithRelations: vi.fn(async (id: number) => mediaById.get(id)!),
      } as never,
      upstreamMappingStore: {
        get: vi.fn((anilistId: number) => {
          if (anilistId === 2) {
            return { tvdbId: 200, source: 'primary' as const };
          }
          if (anilistId === 3) {
            return { tvdbId: 300, source: 'primary' as const };
          }
          return null;
        }),
      } as never,
      lookupClient: {
        provider: 'sonarr',
        reset: vi.fn(async () => {}),
        readFromCache: vi.fn(async () => ({ results: [], hit: 'none' as const })),
        lookup: vi.fn(async () => []),
        getProviderId: vi.fn(() => null),
        lookupExactByProviderId: exactLookup,
      },
      credentials: TEST_CREDENTIALS,
    });

    expect(result.status).toBe('ambiguous');
    expect(exactLookup).not.toHaveBeenCalled();
  });

  it('respects the traversal depth bound', async () => {
    const mediaById = new Map<number, AniListMedia>([
      [1, createMedia(1, 'Attack on Titan Final Season', [{ relationType: 'PREQUEL', id: 2 }])],
      [2, createMedia(2, 'Attack on Titan Season 3', [{ relationType: 'PREQUEL', id: 4 }])],
      [4, createMedia(4, 'Attack on Titan Season 2')],
    ]);

    const result = await attemptVerifiedInheritedSonarrResolution({
      media: mediaById.get(1)!,
      anilistApi: {
        fetchMediaWithRelations: vi.fn(async (id: number) => mediaById.get(id)!),
      } as never,
      upstreamMappingStore: {
        get: vi.fn((anilistId: number) => (anilistId === 4 ? { tvdbId: 400, source: 'primary' as const } : null)),
      } as never,
      overrides: {
        isIgnored: vi.fn(() => false),
        get: vi.fn(() => null),
      },
      lookupClient: {
        provider: 'sonarr',
        reset: vi.fn(async () => {}),
        readFromCache: vi.fn(async () => ({ results: [], hit: 'none' as const })),
        lookup: vi.fn(async () => []),
        getProviderId: vi.fn(() => null),
        lookupExactByProviderId: vi.fn(async () => null),
      },
      credentials: TEST_CREDENTIALS,
      maxDepth: 1,
    });

    expect(result.status).toBe('none');
  });

  it('skips ignored relation entries when selecting trusted anchors', async () => {
    const mediaById = new Map<number, AniListMedia>([
      [1, createMedia(1, 'Attack on Titan Final Season', [
        { relationType: 'PREQUEL', id: 2 },
        { relationType: 'SEQUEL', id: 3 },
      ])],
      [2, createMedia(2, 'Ignored Anchor')],
      [3, createMedia(3, 'Trusted Upstream Anchor')],
    ]);

    const result = await attemptVerifiedInheritedSonarrResolution({
      media: mediaById.get(1)!,
      anilistApi: {
        fetchMediaWithRelations: vi.fn(async (id: number) => mediaById.get(id)!),
      } as never,
      upstreamMappingStore: {
        get: vi.fn((anilistId: number) => (anilistId === 3 ? { tvdbId: 300, source: 'primary' as const } : null)),
      } as never,
      overrides: {
        isIgnored: vi.fn((_: 'sonarr', anilistId: number) => anilistId === 2),
        get: vi.fn((_: 'sonarr', anilistId: number) => (anilistId === 2 ? 200 : null)),
      },
      lookupClient: {
        provider: 'sonarr',
        reset: vi.fn(async () => {}),
        readFromCache: vi.fn(async () => ({ results: [], hit: 'none' as const })),
        lookup: vi.fn(async () => []),
        getProviderId: vi.fn(() => null),
        lookupExactByProviderId: vi.fn(async () => ({ title: 'Trusted Upstream Anchor', tvdbId: 300 } satisfies SonarrLookupSeries)),
      },
      credentials: TEST_CREDENTIALS,
    });

    expect(result).toMatchObject({
      status: 'accepted',
      resolved: { providerId: 300 },
    });
  });
});
