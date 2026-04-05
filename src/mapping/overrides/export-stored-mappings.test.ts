/** Tests for the raw stored mapping export shape and counts. */
// src/mapping/overrides/export-stored-mappings.test.ts

import { describe, expect, it } from 'vitest';
import { exportStoredMappings } from './export-stored-mappings';

describe('exportStoredMappings', () => {
  it('preserves the versioned raw export shape and counts', async () => {
    const output = await exportStoredMappings({
      list: () => [
        {
          anilistId: 1,
          provider: 'sonarr',
          providerId: 100,
          updatedAt: 10,
        },
      ],
      listIgnores: () => [
        {
          anilistId: 2,
          provider: 'radarr',
          updatedAt: 11,
        },
      ],
      listRejectedCandidates: () => [
        {
          anilistId: 3,
          provider: 'sonarr',
          providerId: 101,
          updatedAt: 12,
        },
      ],
      listBlockedCandidates: () => [
        {
          anilistId: 4,
          provider: 'radarr',
          providerId: 102,
          updatedAt: 13,
        },
      ],
    });

    expect(output.version).toBe(3);
    expect(output.summary).toEqual({
      overrideCount: 1,
      ignoreCount: 1,
      rejectedCandidateCount: 1,
      blockedCandidateCount: 1,
    });
    expect(output.mappings.overrides['sonarr:1']).toEqual({
      anilistId: 1,
      provider: 'sonarr',
      providerId: 100,
      updatedAt: 10,
    });
    expect(output.mappings.ignores['radarr:2']).toEqual({
      anilistId: 2,
      provider: 'radarr',
      updatedAt: 11,
    });
    expect(output.mappings.rejectedCandidates['sonarr:3:101']).toEqual({
      anilistId: 3,
      provider: 'sonarr',
      providerId: 101,
      updatedAt: 12,
    });
    expect(output.mappings.blockedCandidates['radarr:4:102']).toEqual({
      anilistId: 4,
      provider: 'radarr',
      providerId: 102,
      updatedAt: 13,
    });
    expect(new Date(output.exportedAt).toString()).not.toBe('Invalid Date');
  });
});
