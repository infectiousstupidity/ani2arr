import { describe, expect, it } from 'vitest';
import { parseAniListId } from '@/anilist';
import { parseTvdbId } from '@/providers';
import { buildEffectiveMapping } from './effective-mapping';

describe('buildEffectiveMapping', () => {
  it('keeps manual mappings behind explicit ignores', () => {
    const identity = buildEffectiveMapping({
      provider: 'sonarr',
      anilistId: parseAniListId(1),
      manualProviderId: parseTvdbId(123),
      ignored: true,
      upstreamProviderIds: [],
      resolverState: null,
    });

    expect(identity).toMatchObject({
      provider: 'sonarr',
      anilistId: parseAniListId(1),
      providerId: null,
      providerMappingState: 'unmapped',
      mappingEntryKind: 'ignored',
    });
    expect(identity.mappingSource).toBeUndefined();
    expect(identity.mappingReason).toBeUndefined();
  });
});
