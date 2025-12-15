import type { AniMedia, AniTitles, MediaMetadataHint } from '@/shared/types';

const normalizeTitles = (titles?: AniTitles | null): AniTitles => {
  if (!titles) return {};
  const normalized: AniTitles = {};
  if (titles.english) normalized.english = titles.english;
  if (titles.romaji) normalized.romaji = titles.romaji;
  if (titles.native) normalized.native = titles.native;
  return normalized;
};

export function buildMediaFromMetadataHint(anilistId: number, metadata?: MediaMetadataHint | null): AniMedia | null {
  if (!metadata) return null;

  const titles = normalizeTitles(metadata.titles ?? {});

  const synonyms = Array.isArray(metadata.synonyms)
    ? Array.from(
        new Set(
          metadata.synonyms
            .filter((value): value is string => typeof value === 'string')
            .map(value => value.trim())
            .filter(value => value.length > 0),
        ),
      )
    : [];

  const startYear =
    typeof metadata.startYear === 'number' && Number.isFinite(metadata.startYear)
      ? metadata.startYear
      : null;

  const format = metadata.format ?? null;

  const relationIds = Array.isArray(metadata.relationPrequelIds)
    ? metadata.relationPrequelIds.filter(
        (value): value is number => typeof value === 'number' && Number.isFinite(value),
      )
    : [];

  if (
    Object.keys(titles).length === 0 &&
    synonyms.length === 0 &&
    startYear == null &&
    !format &&
    relationIds.length === 0
  ) {
    return null;
  }

  const relations =
    relationIds.length > 0
      ? {
          edges: relationIds.map(id => ({
            relationType: 'PREQUEL',
            node: {
              id,
              format: null,
              title: {},
              synonyms: [],
            } as AniMedia,
          })),
        }
      : undefined;

  const startDate = startYear != null ? { year: startYear } : undefined;

  return {
    id: anilistId,
    format,
    title: titles,
    ...(startDate ? { startDate } : {}),
    synonyms,
    ...(relations ? { relations } : {}),
  };
}
