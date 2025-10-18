import type { AniMedia, AniTitles } from '@/types';

const defaultTitles: AniTitles = {
  romaji: 'Kitsunarr Test',
  english: 'Kitsunarr Test',
  native: 'キツナール テスト',
};

export const createAniMediaFixture = (overrides: Partial<AniMedia> = {}): AniMedia => ({
  id: 12345,
  format: 'TV',
  title: { ...defaultTitles, ...overrides.title },
  startDate: { year: 2024 },
  synonyms: ['Kitsunarr Synonym'],
  relations: { edges: [] },
  ...overrides,
});

export const createAniGraphqlSuccessPayload = (
  media: AniMedia = createAniMediaFixture(),
): { data: { Media: AniMedia } } => ({
  data: { Media: media },
});

export const createAniGraphqlErrorPayload = (
  message = 'AniList error',
  status = 500,
): { errors: { message: string; status: number }[] } => ({
  errors: [{ message, status }],
});
