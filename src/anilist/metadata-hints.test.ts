/** Focused tests for pure AniList metadata-hint helpers. */
// src/anilist/metadata-hints.test.ts

import { describe, expect, it } from 'vitest';
import { parseAniListId } from './anilist-id';
import { metadataHintFromAniListMetadata } from './metadata-hints';

describe('AniList metadata hint helpers', () => {
  it('projects stored metadata into production metadata hints', () => {
    expect(
      metadataHintFromAniListMetadata({
        id: parseAniListId(1),
        titles: { english: 'Primary' },
        seasonYear: 2020,
        format: 'TV',
        coverImage: { large: 'large.jpg', medium: 'medium.jpg' },
        updatedAt: 1000,
      }),
    ).toEqual({
      titles: { english: 'Primary' },
      synonyms: null,
      startYear: 2020,
      format: 'TV',
      relationPrequelIds: null,
      coverImage: 'large.jpg',
    });
  });
});
