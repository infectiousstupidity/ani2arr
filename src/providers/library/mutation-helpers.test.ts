/** Tests for provider mutation helper behavior. */
// src/providers/library/mutation-helpers.test.ts

import { describe, expect, it, vi } from 'vitest';
import {
  resolveMutationTagIds,
  resolveRequiredQualityProfileId,
  resolveRequiredRootFolderPath,
  shouldMoveProviderFiles,
} from './mutation-helpers';

describe('provider mutation helpers', () => {
  it('resolves required provider fields and file move checks', () => {
    expect(
      resolveRequiredQualityProfileId({
        value: '',
        fallback: 17,
        providerLabel: 'Sonarr',
        entityLabel: 'series',
        actionLabel: 'add',
      }),
    ).toBe(17);

    expect(
      resolveRequiredRootFolderPath({
        value: '  ',
        fallback: '/media/series',
        providerLabel: 'Sonarr',
        entityLabel: 'series',
        actionLabel: 'update',
      }),
    ).toBe('/media/series');

    expect(shouldMoveProviderFiles('/media/series/Show', '/media/series/Show')).toBe(false);
    expect(shouldMoveProviderFiles('/media/series/Old', '/media/series/New')).toBe(true);
  });

  it('dedupes tag ids and creates missing freeform tags once', async () => {
    const api = {
      getTags: vi.fn(async () => [{ id: 1, label: 'Existing' }]),
      createTag: vi.fn(async (_credentials: { url: string; apiKey: string }, label: string) => ({ id: 2, label })),
    };

    const credentials = { url: 'https://example.test', apiKey: 'secret' };

    const ids = await resolveMutationTagIds(
      api,
      credentials,
      [1, 3],
      [' existing ', 'New', 'new'],
      'Sonarr',
    );

    expect(ids).toEqual([1, 3, 2]);
    expect(api.getTags).toHaveBeenCalledTimes(1);
    expect(api.createTag).toHaveBeenCalledTimes(1);
    expect(api.createTag).toHaveBeenCalledWith(credentials, 'New');
  });
});
