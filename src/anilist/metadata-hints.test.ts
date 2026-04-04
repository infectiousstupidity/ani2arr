/** Focused tests for pure AniList metadata-hint helpers. */
// src/anilist/metadata-hints.test.ts

import { describe, expect, it } from 'vitest';
import {
  mergeMetadataHints,
  metadataEqual,
  metadataFromMediaObject,
  normalizeRelationIds,
  normalizeSynonyms,
} from './metadata-hints';

describe('AniList metadata hint helpers', () => {
  it('normalizes synonyms by trimming, deduplicating, and sorting', () => {
    expect(normalizeSynonyms(['  Beta ', 'Alpha', 'Beta', 'Gamma', ''])).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
  });

  it('normalizes relation ids by filtering invalid values, deduplicating, and sorting', () => {
    expect(normalizeRelationIds([3, 1, 3, 2, Number.NaN, Number.POSITIVE_INFINITY])).toEqual([1, 2, 3]);
  });

  it('merges metadata hints with primary precedence and stable unions', () => {
    expect(
      mergeMetadataHints(
        {
          titles: { english: 'Primary' },
          synonyms: [' beta ', 'alpha'],
          startYear: 2020,
          format: 'TV',
          relationPrequelIds: [4, 2],
          coverImage: 'primary',
        },
        {
          titles: { romaji: 'Secondary' },
          synonyms: ['alpha', 'gamma'],
          startYear: 2021,
          format: 'MOVIE',
          relationPrequelIds: [2, 5],
          coverImage: 'secondary',
        },
      ),
    ).toEqual({
      titles: { english: 'Primary' },
      synonyms: ['beta', 'alpha', 'gamma'],
      startYear: 2020,
      format: 'TV',
      relationPrequelIds: [4, 2, 5],
      coverImage: 'primary',
    });
  });

  it('treats equivalent metadata hints as equal after normalization', () => {
    expect(
      metadataEqual(
        {
          titles: { english: 'Alpha', romaji: 'Alpha' },
          synonyms: [' Beta ', 'Alpha'],
          startYear: 1999,
          format: 'TV',
          relationPrequelIds: [3, 1],
        },
        {
          titles: { english: 'Alpha', romaji: 'Alpha' },
          synonyms: ['Alpha', 'Beta'],
          startYear: 1999,
          format: 'TV',
          relationPrequelIds: [1, 3],
        },
      ),
    ).toBe(true);
  });

  it('derives a metadata hint from AniList media objects', () => {
    expect(
      metadataFromMediaObject({
        title: {
          romaji: 'Romaji title',
          english: ' English title ',
        },
        synonyms: ['  Alt title  ', 'Alt title', 123],
        start_date: { year: '2001' },
        format: 'movie',
        relations: {
          edges: [
            { relationType: 'PREQUEL', node: { id: '12' } },
            { relationType: 'SEQUEL', node: { id: 99 } },
            { relationType: 'PREQUEL', node: { id: 7 } },
          ],
        },
      }),
    ).toEqual({
      titles: {
        romaji: 'Romaji title',
        english: 'English title',
      },
      synonyms: ['Alt title'],
      startYear: 2001,
      format: 'MOVIE',
      relationPrequelIds: [7, 12],
    });
  });
});
