/** AniList DOM scraping helpers that project page data into AniList-owned hint types. */
// src/shared/anilist/anilist-dom.ts

import type { AniListMediaFormat, AniListMediaHint } from '@/anilist/schemas/media.schema';

export const extractMediaMetadataFromDom = (anilistId: number): AniListMediaHint | null => {
  if (globalThis.window === undefined || !Number.isFinite(anilistId)) {
    return null;
  }
  try {
    const { location, document } = globalThis;
    const hrefIdMatch = location.pathname.match(/\/anime\/(\d+)/);
    const onAnimeDetailPage = hrefIdMatch && Number.parseInt(hrefIdMatch[1]!, 10) === anilistId;
    const FORMAT_TEXT_MAP = new Map<string, AniListMediaFormat>([
      ['tv show', 'TV'],
      ['tv', 'TV'],
      ['tv short', 'TV_SHORT'],
      ['ona', 'ONA'],
      ['ova', 'OVA'],
      ['movie', 'MOVIE'],
      ['special', 'SPECIAL'],
      ['music', 'MUSIC'],
    ]);
    const normalizeFormatText = (value: string): string => value.toLowerCase().trim().replace(/\s+series$/, '');
    
    // Extract cover image helper
    const getCoverImage = (imgEl: HTMLImageElement | null | undefined): string | null => {
      if (!imgEl) return null;
      return imgEl.src || imgEl.dataset.src || null;
    };

    if (onAnimeDetailPage) {
      const title = document.querySelector('h1')?.textContent?.trim() ?? '';
      const coverImg = document.querySelector<HTMLImageElement>('.cover-wrap .cover');
      let format: AniListMediaFormat | null = null;
      const rows = [...document.querySelectorAll<HTMLDivElement>('.sidebar .data .data-set')];
      const formatRow = rows.find(row => row.querySelector('.type')?.textContent?.trim() === 'Format');
      const rawFormat = formatRow?.querySelector('.value')?.textContent ?? '';
      const normalizedFormat = rawFormat.replaceAll(/\s+/g, ' ').trim().toLowerCase();
      if (normalizedFormat) {
        switch (true) {
          case normalizedFormat.includes('movie'): { format = 'MOVIE'; break; }
          case normalizedFormat.includes('music'): { format = 'MUSIC'; break; }
          case normalizedFormat === 'tv short': { format = 'TV_SHORT'; break; }
          case normalizedFormat === 'tv': { format = 'TV'; break; }
          case normalizedFormat === 'special': { format = 'SPECIAL'; break; }
          case normalizedFormat === 'ova': { format = 'OVA'; break; }
          case normalizedFormat === 'ona': { format = 'ONA'; break; }
        }
      }
      
      if (title || format) {
        const hint: AniListMediaHint = {
          titles: title ? { romaji: title } : null,
          synonyms: title ? [title] : null,
          startYear: null,
          format,
          relationPrequelIds: null,
          coverImage: getCoverImage(coverImg),
        };
        return hint;
      }
    }
    
    const cover = document.querySelector<HTMLAnchorElement>(`.media-card a.cover[href*="/anime/${anilistId}"]`);
    if (cover) {
      const card = cover.closest('.media-card') as Element | null;
      const title = (
        card?.querySelector<HTMLDivElement>('.title a')?.textContent ?? ''
      ).trim() || (
        card?.querySelector<HTMLDivElement>('.title')?.textContent ?? ''
      ).trim() || (cover.getAttribute('title') ?? '').trim() || cover.querySelector('img')?.getAttribute('alt')?.trim() || '';
      
      let format: AniListMediaFormat | null = null;
      const infoSpan = card?.querySelector<HTMLSpanElement>('.hover-data .info span');
      const infoText = infoSpan?.textContent;
      if (infoText) {
        const mapped = FORMAT_TEXT_MAP.get(normalizeFormatText(infoText));
        if (mapped) format = mapped;
      }

      const cardImg = cover.querySelector('img');

      if (title || format) {
        const hint: AniListMediaHint = {
          titles: title ? { romaji: title } : null,
          synonyms: title ? [title] : null,
          startYear: null,
          format: format ?? null,
          relationPrequelIds: null,
          coverImage: getCoverImage(cardImg),
        };
        return hint;
      }
    }
  } catch {
    /* noop */
  }

  return null;
};
