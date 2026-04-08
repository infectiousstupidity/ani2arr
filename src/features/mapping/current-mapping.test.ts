/** Tests for deriving the current provider mapping view model from status responses. */
// src/features/mapping/current-mapping.test.ts

import { describe, expect, it } from 'vitest';
import { deriveCurrentMapping } from './current-mapping';

describe('deriveCurrentMapping', () => {
  it('uses the provider status id when available', () => {
    const mapping = deriveCurrentMapping({
      provider: 'radarr',
      baseUrl: 'https://radarr.example',
      fallbackProviderId: 123,
      fallbackTitle: 'Fallback Title',
      status: {
        exists: true,
        tmdbId: 456,
        movie: {
          id: 1,
          tmdbId: 456,
          title: 'Provider Movie',
        } as never,
        linkedAniListIds: [100],
      },
    });

    expect(mapping).toMatchObject({
      provider: 'radarr',
      providerId: 456,
      title: 'Provider Movie (TMDB 456)',
      inLibrary: true,
      linkedAniListIds: [100],
    });
  });

  it('falls back to the launcher provider id when status has no mapping id', () => {
    const mapping = deriveCurrentMapping({
      provider: 'sonarr',
      baseUrl: 'https://sonarr.example',
      fallbackProviderId: 789,
      fallbackTitle: 'AniList Title',
      status: {
        exists: false,
        tvdbId: null,
        linkedAniListIds: [],
      },
    });

    expect(mapping).toMatchObject({
      provider: 'sonarr',
      providerId: 789,
      title: 'AniList Title (TVDB 789)',
      inLibrary: false,
    });
  });
});
