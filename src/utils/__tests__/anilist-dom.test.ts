import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { metadataFromMediaObject, extractMediaMetadataFromDom } from '@/utils/anilist-dom';

describe('metadataFromMediaObject', () => {
  it('returns null when provided value is not an object or lacks usable fields', () => {
    expect(metadataFromMediaObject(null)).toBeNull();
    expect(metadataFromMediaObject(undefined)).toBeNull();
    expect(metadataFromMediaObject(42)).toBeNull();
    expect(metadataFromMediaObject({})).toBeNull();
  });

  it('coerces titles, synonyms, start year, format, and relations from mixed input', () => {
    const result = metadataFromMediaObject({
      title: {
        english: '  English Name ',
        romaji: 'Romaji Title',
        native: '   ',
      },
      synonyms: [' Alt Name ', 'alt name', 123, '', null],
      startDate: { year: '2021' },
      format: 'tv_short',
      relations: {
        edges: [
          { relationType: 'PREQUEL', node: { id: '101' } },
          { relationType: 'SEQUEL', node: { id: '102' } },
          { relationType: 'PREQUEL', node: { id: 101 } },
          { relationType: 'PREQUEL', node: { id: 'bad' } },
        ],
      },
    });

    expect(result).toEqual({
      titles: { english: 'English Name', romaji: 'Romaji Title' },
      synonyms: ['Alt Name', 'alt name'],
      startYear: 2021,
      format: 'TV_SHORT',
      relationPrequelIds: [101],
    });
  });

  it('falls back to start_date and ignores unsupported format values', () => {
    const result = metadataFromMediaObject({
      title: { english: 'Edge Case' },
      synonyms: ['   ', '\t'],
      start_date: { year: '1999' },
      format: 'visual_novel',
    });

    expect(result).toEqual({
      titles: { english: 'Edge Case' },
      synonyms: null,
      startYear: 1999,
      format: null,
      relationPrequelIds: null,
    });
  });
});

describe('extractMediaMetadataFromDom', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns detail page metadata when the URL matches the AniList ID', () => {
    window.history.replaceState(null, '', '/anime/321/sample');
    document.body.innerHTML = `
      <main>
        <h1>
          Detail Title
        </h1>
      </main>
    `;

    expect(extractMediaMetadataFromDom(321)).toEqual({
      titles: { romaji: 'Detail Title' },
      synonyms: ['Detail Title'],
      startYear: null,
      format: null,
      relationPrequelIds: null,
    });
  });

  it('extracts metadata from AniList media cards when detail page metadata is unavailable', () => {
    window.history.replaceState(null, '', '/anime/999/different');
    document.body.innerHTML = `
      <div class="media-card">
        <a class="cover" href="/anime/321" title=" Sample Cover Title ">
          <img alt="Alt Title">
        </a>
        <div class="title"><a> Card Title </a></div>
        <div class="hover-data">
          <div class="info"><span>TV Show</span></div>
        </div>
      </div>
    `;

    expect(extractMediaMetadataFromDom(321)).toEqual({
      titles: { romaji: 'Card Title' },
      synonyms: ['Card Title'],
      startYear: null,
      format: 'TV',
      relationPrequelIds: null,
    });
  });

  it('returns null when no matching elements are present', () => {
    window.history.replaceState(null, '', '/anime/777');
    document.body.innerHTML = `
      <div class="media-card">
        <a class="cover" href="/anime/123">
          <img alt="Irrelevant">
        </a>
      </div>
    `;

    expect(extractMediaMetadataFromDom(321)).toBeNull();
  });
});
