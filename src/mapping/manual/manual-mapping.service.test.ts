/** Tests for rejected-only persisted candidate suppression behavior in the manual mapping service. */
// src/mapping/manual/manual-mapping.service.test.ts

import { beforeEach, describe, expect, it } from 'vitest';
import { parseAniListId } from '@/anilist';
import { parseTvdbId } from '@/providers';
import { parseCandidateRecordKey, parseRecordKey } from './keys';
import { ManualMappingService } from './manual-mapping.service';

const aid = parseAniListId;
const tvdb = parseTvdbId;

describe('ManualMappingService', () => {
  let service: ManualMappingService;

  beforeEach(async () => {
    service = new ManualMappingService();
    await service.init();
    await service.clearAll();
  });

  it('stores and clears rejected candidate suppression without any extra bucket', async () => {
    await service.setRejectedCandidate('sonarr', aid(10), tvdb(200));

    expect(service.getCandidateSuppression('sonarr', aid(10), tvdb(200))).toBe('rejected');
    expect(service.listRejectedCandidates()).toEqual([
      expect.objectContaining({
        anilistId: 10,
        provider: 'sonarr',
        providerId: 200,
        updatedAt: expect.any(Number),
      }),
    ]);

    const exported = service.exportState();
    expect(Object.keys(exported).toSorted()).toEqual(['ignoredMappings', 'manualMappings', 'rejectedCandidates']);
    expect(exported.rejectedCandidates['sonarr:10:200']).toMatchObject({
      provider: 'sonarr',
      providerId: 200,
      updatedAt: expect.any(Number),
    });

    await service.clearRejectedCandidate('sonarr', aid(10), tvdb(200));

    expect(service.getCandidateSuppression('sonarr', aid(10), tvdb(200))).toBeNull();
    expect(service.listRejectedCandidates()).toEqual([]);
  });

  it('brands valid AniList IDs and rejects malformed persisted keys', () => {
    expect(parseRecordKey('sonarr:10')).toEqual({ provider: 'sonarr', anilistId: 10 });
    expect(parseCandidateRecordKey('radarr:11:200')).toEqual({
      provider: 'radarr',
      anilistId: 11,
      providerId: 200,
    });

    expect(parseRecordKey('sonarr:0')).toBeNull();
    expect(parseRecordKey('sonarr:-1')).toBeNull();
    expect(parseRecordKey('sonarr:1.5')).toBeNull();
    expect(parseRecordKey('sonarr:1e2')).toBeNull();
    expect(parseRecordKey('sonarr:0x10')).toBeNull();
    expect(parseRecordKey('sonarr:abc')).toBeNull();
    expect(parseCandidateRecordKey('radarr:0:200')).toBeNull();
  });
});
