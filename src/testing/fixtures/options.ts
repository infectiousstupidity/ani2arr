import type { ExtensionOptions, SonarrFormState } from '@/types';

const defaultSonarrFormState: SonarrFormState = {
  qualityProfileId: '',
  rootFolderPath: '',
  seriesType: 'anime',
  monitorOption: 'all',
  seasonFolder: true,
  searchForMissingEpisodes: true,
  tags: [],
};

export const createSonarrDefaultsFixture = (
  overrides: Partial<SonarrFormState> = {},
): SonarrFormState => ({
  ...defaultSonarrFormState,
  ...overrides,
});

export const createExtensionOptionsFixture = (
  overrides: Partial<ExtensionOptions> = {},
): ExtensionOptions => {
  const { defaults: defaultsOverride, ...rest } = overrides;

  return {
    sonarrUrl: '',
    sonarrApiKey: '',
    ...rest,
    defaults: createSonarrDefaultsFixture(defaultsOverride),
  };
};
