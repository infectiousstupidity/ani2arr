/** Tests for rejected-only persisted candidate suppression behavior in the overrides service. */
// src/mapping/overrides/overrides.service.test.ts

import { beforeEach, describe, expect, it } from 'vitest';
import { MappingOverridesService } from './overrides.service';

describe('MappingOverridesService', () => {
  let service: MappingOverridesService;

  beforeEach(async () => {
    service = new MappingOverridesService();
    await service.init();
    await service.clearAll();
  });

  it('stores and clears rejected candidate suppression without any extra bucket', async () => {
    await service.setRejectedCandidate('sonarr', 10, 200);

    expect(service.getCandidateSuppression('sonarr', 10, 200)).toBe('rejected');
    expect(service.listRejectedCandidates()).toEqual([
      expect.objectContaining({
        anilistId: 10,
        provider: 'sonarr',
        providerId: 200,
        updatedAt: expect.any(Number),
      }),
    ]);

    const exported = service.exportState();
    expect(Object.keys(exported).toSorted()).toEqual(['ignores', 'overrides', 'rejectedCandidates']);
    expect(exported.rejectedCandidates['sonarr:10:200']).toMatchObject({
      provider: 'sonarr',
      providerId: 200,
      updatedAt: expect.any(Number),
    });

    await service.clearRejectedCandidate('sonarr', 10, 200);

    expect(service.getCandidateSuppression('sonarr', 10, 200)).toBeNull();
    expect(service.listRejectedCandidates()).toEqual([]);
  });
});
