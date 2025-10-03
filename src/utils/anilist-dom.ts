import type { AniFormat, AniTitles, MediaMetadataHint } from '@/types';

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
  const synonyms = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0);
  return synonyms.length > 0 ? Array.from(new Set(synonyms)) : null;
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
  return ids.length > 0 ? Array.from(new Set(ids)) : null;
};

const hasMediaShape = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.title && typeof candidate.title === 'object') return true;
  if (Array.isArray(candidate.synonyms)) return true;
  if (candidate.format && typeof candidate.format === 'string') return true;
  if (candidate.startDate && typeof candidate.startDate === 'object') return true;
  return false;
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

const breadthFirstFind = (root: unknown, predicate: (value: unknown) => boolean): unknown | null => {
  if (!root || typeof root !== 'object') return null;
  const seen = new WeakSet<object>();
  const queue: unknown[] = [root];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (seen.has(current as object)) continue;
    seen.add(current as object);

    if (predicate(current)) {
      return current;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        if (item && typeof item === 'object') queue.push(item);
      }
      continue;
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return null;
};

const findMediaCandidate = (root: unknown, anilistId: number): unknown | null => {
  return breadthFirstFind(root, value => {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    const idCandidate = record.id ?? record.mediaId ?? record.mediaID;
    const id = typeof idCandidate === 'number'
      ? idCandidate
      : typeof idCandidate === 'string'
        ? Number.parseInt(idCandidate, 10)
        : NaN;
    if (!Number.isFinite(id) || id !== anilistId) return false;
    return hasMediaShape(record);
  });
};

const mergeSynonyms = (a: string[] | null | undefined, b: string[] | null | undefined): string[] | null => {
  const merged = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]
    .map(item => item.trim())
    .filter(item => item.length > 0);
  return merged.length > 0 ? Array.from(new Set(merged)) : null;
};

const mergeRelationIds = (a: number[] | null | undefined, b: number[] | null | undefined): number[] | null => {
  const merged = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return merged.length > 0 ? Array.from(new Set(merged)) : null;
};

export const metadataFromMediaObject = (value: unknown): MediaMetadataHint | null => metadataFromAny(value);

export const extractMediaMetadataFromDom = (anilistId: number): MediaMetadataHint | null => {
  if (typeof window === 'undefined' || !Number.isFinite(anilistId)) {
    return null;
  }

  const globalAny = window as unknown as Record<string, unknown>;
  const sources: unknown[] = [];

  const nuxt = globalAny.__NUXT__;
  if (nuxt && typeof nuxt === 'object') {
    const nuxtRecord = nuxt as Record<string, unknown>;
    if (Array.isArray(nuxtRecord.data)) {
      sources.push(...nuxtRecord.data);
    }
    if (nuxtRecord.state) {
      sources.push(nuxtRecord.state);
    }
  }

  const apollo = globalAny.__APOLLO_STATE__;
  if (apollo && typeof apollo === 'object') {
    sources.push(apollo);
  }

  for (const source of sources) {
    const candidate = findMediaCandidate(source, anilistId);
    if (!candidate) continue;
    const metadata = metadataFromAny(candidate);
    if (metadata) return metadata;
  }

  return null;
};

export const mergeMetadataHints = (
  primary?: MediaMetadataHint | null,
  secondary?: MediaMetadataHint | null,
): MediaMetadataHint | null => {
  const hints = [primary ?? null, secondary ?? null].filter((hint): hint is MediaMetadataHint => !!hint);
  if (hints.length === 0) return null;

  return hints.reduce<MediaMetadataHint>((acc, hint) => {
    if (!acc.titles && hint.titles) {
      acc.titles = hint.titles;
    }
    if (!acc.startYear && hint.startYear) {
      acc.startYear = hint.startYear;
    }
    if (!acc.format && hint.format) {
      acc.format = hint.format;
    }
    acc.synonyms = mergeSynonyms(acc.synonyms, hint.synonyms);
    acc.relationPrequelIds = mergeRelationIds(acc.relationPrequelIds, hint.relationPrequelIds);
    return acc;
  }, {
    titles: null,
    synonyms: null,
    startYear: null,
    format: null,
    relationPrequelIds: null,
  });
};
