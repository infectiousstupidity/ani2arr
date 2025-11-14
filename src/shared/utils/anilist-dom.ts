// src/shared/utils/anilist-dom.ts
import type { AniFormat, AniTitles, MediaMetadataHint } from '@/shared/types';
import { normalizeRelationIds, normalizeSynonyms } from '@/shared/utils/media-metadata';

const FORMAT_VALUES: ReadonlySet<AniFormat> = new Set([
  'TV',
  'TV_SHORT',
  'MOVIE',
  'SPECIAL',
  'OVA',
  'ONA',
  'MUSIC',
  'MANGA',
  'NOVEL',
  'ONE_SHOT',
]);

const coerceTitles = (value: unknown): AniTitles | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const titles: AniTitles = {};
  if (typeof source.english === 'string' && source.english.trim()) {
    titles.english = source.english.trim();
  }
  if (typeof source.romaji === 'string' && source.romaji.trim()) {
    titles.romaji = source.romaji.trim();
  }
  if (typeof source.native === 'string' && source.native.trim()) {
    titles.native = source.native.trim();
  }
  return Object.keys(titles).length > 0 ? titles : null;
};

const coerceSynonyms = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const normalized = normalizeSynonyms(
    value
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim()),
  );
  return normalized.length > 0 ? normalized : null;
};

const coerceFormat = (value: unknown): AniFormat | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return FORMAT_VALUES.has(normalized as AniFormat) ? (normalized as AniFormat) : null;
};

const coerceStartYear = (value: unknown): number | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const year = source.year;
  if (typeof year === 'number' && Number.isFinite(year)) return year;
  if (typeof year === 'string') {
    const parsed = Number.parseInt(year, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const coerceRelationPrequelIds = (value: unknown): number[] | null => {
  if (!value || typeof value !== 'object') return null;
  const edges = (value as { edges?: unknown }).edges;
  if (!Array.isArray(edges)) return null;
  const ids: number[] = [];
  for (const edge of edges) {
    if (!edge || typeof edge !== 'object') continue;
    const edgeObj = edge as Record<string, unknown>;
    if (edgeObj.relationType !== 'PREQUEL') continue;
    const node = edgeObj.node;
    if (!node || typeof node !== 'object') continue;
    const nodeId = (node as Record<string, unknown>).id;
    let parsed: number | null = null;
    if (typeof nodeId === 'number') {
      parsed = nodeId;
    } else if (typeof nodeId === 'string') {
      const num = Number.parseInt(nodeId, 10);
      if (Number.isFinite(num)) {
        parsed = num;
      }
    }
    if (parsed !== null && Number.isFinite(parsed)) {
      ids.push(parsed);
    }
  }
  const normalized = normalizeRelationIds(ids);
  return normalized.length > 0 ? normalized : null;
};

const metadataFromAny = (value: unknown): MediaMetadataHint | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const titles = coerceTitles(source.title);
  const synonyms = coerceSynonyms(source.synonyms);
  const startYear = coerceStartYear(source.startDate ?? source.start_date);
  const format = coerceFormat(source.format);
  const prequelIds = coerceRelationPrequelIds(source.relations);

  if (!titles && !synonyms && startYear == null && !format && !prequelIds) {
    return null;
  }

  return {
    titles: titles ?? null,
    synonyms: synonyms ?? null,
    startYear: startYear ?? null,
    format: format ?? null,
    relationPrequelIds: prequelIds ?? null,
  } satisfies MediaMetadataHint;
};
export const metadataFromMediaObject = (value: unknown): MediaMetadataHint | null => metadataFromAny(value);

export const extractMediaMetadataFromDom = (anilistId: number): MediaMetadataHint | null => {
  if (typeof window === 'undefined' || !Number.isFinite(anilistId)) {
    return null;
  }
  try {
    const { location, document } = window;
    const hrefIdMatch = location.pathname.match(/\/anime\/(\d+)/);
    const onAnimeDetailPage = hrefIdMatch && Number.parseInt(hrefIdMatch[1]!, 10) === anilistId;
    const FORMAT_TEXT_MAP = new Map<string, AniFormat>([
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
    if (onAnimeDetailPage) {
      const title = document.querySelector('h1')?.textContent?.trim() ?? '';
      if (title) {
        const hint: MediaMetadataHint = {
          titles: { romaji: title },
          synonyms: [title],
          startYear: null,
          format: null,
          relationPrequelIds: null,
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
      let format: AniFormat | null = null;
      const infoSpan = card?.querySelector<HTMLSpanElement>('.hover-data .info span');
      const infoText = infoSpan?.textContent;
      if (infoText) {
        const mapped = FORMAT_TEXT_MAP.get(normalizeFormatText(infoText));
        if (mapped) format = mapped;
      }

      if (title || format) {
        const hint: MediaMetadataHint = {
          titles: title ? { romaji: title } : null,
          synonyms: title ? [title] : null,
          startYear: null,
          format: format ?? null,
          relationPrequelIds: null,
        };
        return hint;
      }
    }
  } catch {
    /* noop */
  }

  return null;
};
