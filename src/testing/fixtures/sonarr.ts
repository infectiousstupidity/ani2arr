import type {
  AddRequestPayload,
  SonarrCredentialsPayload,
  SonarrLookupSeries,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrSeries,
  SonarrTag,
} from '@/types';

export const defaultSonarrUrl = 'https://sonarr.test';
export const defaultSonarrCredentials: SonarrCredentialsPayload = {
  url: defaultSonarrUrl,
  apiKey: 'sonarr-api-key',
};

export const createSonarrSeriesFixture = (overrides: Partial<SonarrSeries> = {}): SonarrSeries => ({
  id: 7,
  title: 'Kitsunarr Test Series',
  tvdbId: 987654,
  titleSlug: 'kitsunarr-test-series',
  monitored: true,
  year: 2024,
  genres: ['Action', 'Adventure'],
  seasonCount: 2,
  episodeCount: 24,
  episodeFileCount: 24,
  sizeOnDisk: 123456789,
  path: '/sonarr/anime/kitsunarr-test-series',
  qualityProfileId: 1,
  seasons: [],
  seriesType: 'anime',
  tags: [],
  added: new Date('2024-01-01').toISOString(),
  overview: 'A fixture anime series for testing.',
  previousAiring: null,
  network: 'Test Network',
  ...overrides,
});

export const createSonarrLookupFixture = (overrides: Partial<SonarrLookupSeries> = {}): SonarrLookupSeries => ({
  title: 'Kitsunarr Lookup',
  tvdbId: 987654,
  titleSlug: 'kitsunarr-lookup',
  year: 2024,
  genres: ['Action'],
  id: 321,
  ...overrides,
});

export const createSonarrRootFolderFixture = (
  overrides: Partial<SonarrRootFolder> = {},
): SonarrRootFolder => ({
  id: 1,
  path: '/sonarr/anime',
  ...overrides,
});

export const createSonarrQualityProfileFixture = (
  overrides: Partial<SonarrQualityProfile> = {},
): SonarrQualityProfile => ({
  id: 1,
  name: 'HD-1080p',
  ...overrides,
});

export const createSonarrTagFixture = (overrides: Partial<SonarrTag> = {}): SonarrTag => ({
  id: 42,
  label: 'kitsunarr',
  ...overrides,
});

export const createAddSeriesPayload = (overrides: Partial<AddRequestPayload> = {}): AddRequestPayload => ({
  title: 'Kitsunarr Test Series',
  anilistId: 12345,
  tvdbId: 987654,
  monitorOption: 'all',
  searchForMissingEpisodes: true,
  seasonFolder: true,
  seriesType: 'anime',
  tags: [],
  qualityProfileId: 1,
  rootFolderPath: '/sonarr/anime',
  ...overrides,
});
