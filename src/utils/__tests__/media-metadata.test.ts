import { describe, expect, it } from 'vitest';
import type { MediaMetadataHint } from '@/types';
import { mergeMetadataHints, metadataEqual, normalizeRelationIds, normalizeSynonyms } from '@/utils/media-metadata';

const makeMetadata = (overrides: Partial<MediaMetadataHint> = {}): MediaMetadataHint => ({
  titles: null,
  synonyms: null,
  startYear: null,
  format: null,
  relationPrequelIds: null,
  ...overrides,
});

describe('media-metadata utils', () => {
  it('normalizes synonyms by trimming, deduping, and sorting', () => {
    expect(normalizeSynonyms([' Foo ', 'foo', 'Bar', '', 'baz'])).toEqual(['Bar', 'Foo', 'baz', 'foo']);
    expect(normalizeSynonyms(null)).toEqual([]);
    expect(normalizeSynonyms(['  '])).toEqual([]);
  });

  it('normalizes relation ids by removing invalid entries and sorting', () => {
    expect(normalizeRelationIds([3, 1, 2, 2, Number.NaN, 4])).toEqual([1, 2, 3, 4]);
    expect(normalizeRelationIds(null)).toEqual([]);
  });

  it('checks metadata equality across fields', () => {
    const base = makeMetadata({
      titles: { english: 'Foo', romaji: 'Foo', native: 'ふー' },
      synonyms: ['Foo', 'Bar'],
      startYear: 2023,
      format: 'TV',
      relationPrequelIds: [1, 2],
    });

    const same = makeMetadata({
      titles: { english: 'Foo', romaji: 'Foo', native: 'ふー' },
      synonyms: ['Bar', 'Foo'],
      startYear: 2023,
      format: 'TV',
      relationPrequelIds: [2, 1],
    });

    expect(metadataEqual(base, same)).toBe(true);

    const different = makeMetadata({
      titles: { english: 'Foo', romaji: 'Foo', native: 'ふー' },
      synonyms: ['Bar', 'Foo'],
      startYear: 2024,
      format: 'TV',
      relationPrequelIds: [2, 1],
    });

    expect(metadataEqual(base, different)).toBe(false);
  });

  it('merges metadata hints preferring primary values', () => {
    const primary = makeMetadata({
      titles: { romaji: 'Primary' },
      synonyms: ['Primary'],
      startYear: 2020,
    });

    const secondary = makeMetadata({
      titles: { english: 'Secondary' },
      synonyms: ['Secondary', 'Primary'],
      format: 'TV',
      relationPrequelIds: [5, 4],
    });

    expect(mergeMetadataHints(primary, secondary)).toEqual({
      titles: { romaji: 'Primary' },
      synonyms: ['Primary', 'Secondary'],
      startYear: 2020,
      format: 'TV',
      relationPrequelIds: [5, 4],
    });

    expect(mergeMetadataHints(null, null)).toBeNull();
  });
});
