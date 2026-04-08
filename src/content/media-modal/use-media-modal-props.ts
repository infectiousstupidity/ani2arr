/** Builds media modal props from AniList state, provider status, and provider metadata. */
// src/content/media-modal/use-media-modal-props.ts

import type {
  AniListMediaFormat,
  AniListMediaHint,
  AniListMediaStatus,
} from '@/anilist/schemas/media.schema';
import type { ExtensionOptions } from '@/options';
import type { RadarrFormState } from '@/providers/settings/radarr-settings.schema';
import type { SonarrFormState } from '@/providers/settings/sonarr-settings.schema';
import type {
  Provider,
  RadarrMovie,
  SonarrSeries,
} from '@/providers';
import type { MappingTabProps, RadarrPanelProps, SonarrPanelProps } from '@/features/media-modal';
import { createDefaultRadarrFormState } from '@/providers/settings/radarr-settings.schema';
import { createDefaultSonarrFormState } from '@/providers/settings/sonarr-settings.schema';
import {
  buildProviderFolderSlug,
  extractProviderRootFolderPath,
} from '@/providers/library/paths';
import {
  useAddMovie,
  useRadarrMetadata,
  useUpdateRadarrDefaultSettings,
  useUpdateMovie,
} from '@/providers/hooks/radarr.queries';
import {
  useAddSeries,
  useSonarrMetadata,
  useUpdateDefaultSettings,
  useUpdateSeries,
} from '@/providers/hooks/sonarr.queries';
import { useMediaModalReadModel } from '@/features/media-modal/use-media-modal-read-model';

export interface UseMediaModalPropsInput {
  anilistId: number | undefined;
  title: string | undefined;
  metadata: AniListMediaHint | null | undefined;
  portalContainer: HTMLElement | ShadowRoot | null;
  isOpen: boolean;
  providerOverride?: Provider | null | undefined;
  initialProviderId?: number | null | undefined;
}

export interface UseMediaModalPropsResult {
  title: string;
  alternateTitles: Array<{ label: string; value: string }>;
  titleLanguage: NonNullable<ExtensionOptions['providers']['sonarr']['preferredAniListTitleLanguage']>;
  provider: Provider;
  mappingTabProps: Omit<MappingTabProps, 'controller' | 'baseUrl'>;
  sonarrPanelProps: Omit<SonarrPanelProps, 'controller'> | null;
  radarrPanelProps: Omit<RadarrPanelProps, 'controller'> | null;
  externalId: number | null;
  inLibrary: boolean;
  bannerImage: string | null;
  coverImage: string | null;
  format: AniListMediaFormat | null;
  year: number | null;
  status: AniListMediaStatus | null;
}

const defaultSonarrFormState = createDefaultSonarrFormState();

const defaultRadarrFormState = createDefaultRadarrFormState();

const isFullSonarrSeries = (series: unknown): series is SonarrSeries =>
  Boolean(
    series &&
      typeof series === 'object' &&
      ('path' in (series as Record<string, unknown>) || 'rootFolderPath' in (series as Record<string, unknown>)),
  );

const isFullRadarrMovie = (movie: unknown): movie is RadarrMovie =>
  Boolean(
    movie &&
      typeof movie === 'object' &&
      ('path' in (movie as Record<string, unknown>) ||
        'rootFolderPath' in (movie as Record<string, unknown>) ||
        'folderName' in (movie as Record<string, unknown>)),
  );

export function useMediaModalProps(
  input: UseMediaModalPropsInput,
): UseMediaModalPropsResult | null {
  const { anilistId, title, metadata, portalContainer, isOpen, providerOverride, initialProviderId } = input;
  const readModel = useMediaModalReadModel({
    anilistId,
    title,
    metadata,
    isOpen,
    providerOverride,
    initialProviderId,
  });

  const addSeriesMutation = useAddSeries();
  const updateSeriesMutation = useUpdateSeries();
  const addMovieMutation = useAddMovie();
  const updateMovieMutation = useUpdateMovie();
  const sonarrMetadataQuery = useSonarrMetadata({
    enabled: readModel?.provider === 'sonarr' && readModel.options?.providers.sonarr.isConfigured === true && isOpen,
  });
  const radarrMetadataQuery = useRadarrMetadata({
    enabled: readModel?.provider === 'radarr' && readModel.options?.providers.radarr.isConfigured === true && isOpen,
  });
  const updateDefaultsMutation = useUpdateDefaultSettings();
  const updateRadarrDefaultsMutation = useUpdateRadarrDefaultSettings();

  if (!readModel || !anilistId) {
    return null;
  }

  const {
    title: resolvedTitle,
    alternateTitles,
    titleLanguage,
    provider,
    mappingTabProps,
    externalId,
    bannerImage,
    coverImage,
    format,
    year,
    status,
    statusExists,
    resolvedMetadata,
    providerRequestTitle,
    matchingTitleHint,
    sonarrStatusQuery,
    radarrStatusQuery,
    options,
  } = readModel;
  const isConfigured =
    provider === 'radarr'
      ? options?.providers.radarr.isConfigured === true
      : options?.providers.sonarr.isConfigured === true;

  const inLibrary = Boolean(
    statusExists ||
      (provider === 'radarr'
        ? addMovieMutation.isSuccess || updateMovieMutation.isSuccess
        : addSeriesMutation.isSuccess || updateSeriesMutation.isSuccess),
  );

  const sonarrDefaultForm: SonarrFormState = options?.providers.sonarr.defaults ?? defaultSonarrFormState;
  const radarrDefaultForm: RadarrFormState = options?.providers.radarr.defaults ?? defaultRadarrFormState;

  const sonarrSeriesFromStatus = sonarrStatusQuery.data?.series;
  const fullSonarrSeries = isFullSonarrSeries(sonarrSeriesFromStatus) ? sonarrSeriesFromStatus : null;
  const sonarrFolderSlug = fullSonarrSeries ? buildProviderFolderSlug(fullSonarrSeries, providerRequestTitle) : null;
  const resolvedSonarrRootFolder =
    extractProviderRootFolderPath(fullSonarrSeries, sonarrFolderSlug) ?? sonarrDefaultForm.rootFolderPath;
  const sonarrPanelMode: 'add' | 'edit' =
    isConfigured && provider === 'sonarr' && sonarrStatusQuery.data?.exists ? 'edit' : 'add';

  const sonarrInitialForm: SonarrFormState =
    sonarrPanelMode === 'edit' && fullSonarrSeries
      ? {
          qualityProfileId:
            typeof fullSonarrSeries.qualityProfileId === 'number' && Number.isFinite(fullSonarrSeries.qualityProfileId)
              ? fullSonarrSeries.qualityProfileId
              : '',
          rootFolderPath: resolvedSonarrRootFolder,
          seriesType: fullSonarrSeries.seriesType ?? 'anime',
          monitorOption:
            fullSonarrSeries.monitored === false
              ? 'none'
              : (fullSonarrSeries.addOptions?.monitor as SonarrFormState['monitorOption']) ?? 'all',
          seasonFolder:
            typeof fullSonarrSeries.seasonFolder === 'boolean' ? fullSonarrSeries.seasonFolder : true,
          searchForMissingEpisodes:
            fullSonarrSeries.addOptions?.searchForMissingEpisodes ?? sonarrDefaultForm.searchForMissingEpisodes,
          searchForCutoffUnmetEpisodes:
            fullSonarrSeries.addOptions?.searchForCutoffUnmetEpisodes ??
            sonarrDefaultForm.searchForCutoffUnmetEpisodes,
          tags: Array.isArray(fullSonarrSeries.tags)
            ? fullSonarrSeries.tags.filter((tag): tag is number => typeof tag === 'number')
            : [],
          freeformTags: [],
        }
      : sonarrDefaultForm;

  const radarrMovieFromStatus = radarrStatusQuery.data?.movie;
  const fullRadarrMovie = isFullRadarrMovie(radarrMovieFromStatus) ? radarrMovieFromStatus : null;
  const radarrFolderSlug = fullRadarrMovie ? buildProviderFolderSlug(fullRadarrMovie, providerRequestTitle) : null;
  const resolvedRadarrRootFolder =
    extractProviderRootFolderPath(fullRadarrMovie, radarrFolderSlug) ?? radarrDefaultForm.rootFolderPath;
  const radarrPanelMode: 'add' | 'edit' =
    isConfigured && provider === 'radarr' && radarrStatusQuery.data?.exists ? 'edit' : 'add';

  const radarrInitialForm: RadarrFormState =
    radarrPanelMode === 'edit' && fullRadarrMovie
      ? {
          qualityProfileId:
            typeof fullRadarrMovie.qualityProfileId === 'number' && Number.isFinite(fullRadarrMovie.qualityProfileId)
              ? fullRadarrMovie.qualityProfileId
              : '',
          rootFolderPath: resolvedRadarrRootFolder,
          monitored: fullRadarrMovie.monitored ?? true,
          searchForMovie: fullRadarrMovie.addOptions?.searchForMovie ?? radarrDefaultForm.searchForMovie,
          minimumAvailability: fullRadarrMovie.minimumAvailability ?? radarrDefaultForm.minimumAvailability,
          tags: Array.isArray(fullRadarrMovie.tags)
            ? fullRadarrMovie.tags.filter((tag): tag is number => typeof tag === 'number')
            : [],
          freeformTags: [],
        }
      : radarrDefaultForm;

  const sonarrPanelProps: Omit<SonarrPanelProps, 'controller'> | null =
    provider === 'sonarr'
      ? {
          mode: sonarrPanelMode,
          anilistId,
          title: resolvedTitle,
          tvdbId: externalId,
          initialForm: sonarrInitialForm,
          defaultForm: sonarrDefaultForm,
          metadata: sonarrMetadataQuery.data ?? null,
          sonarrReady: isConfigured,
          disabled: !isConfigured || sonarrMetadataQuery.isPending || sonarrMetadataQuery.isError,
          portalContainer,
          folderSlug: sonarrFolderSlug ?? null,
          onSubmit: async (form: SonarrFormState) => {
            if (!isConfigured) return;
            if (sonarrPanelMode === 'edit') {
              if (!externalId) return;
              await updateSeriesMutation.mutateAsync({
                anilistId,
                tvdbId: externalId,
                title: providerRequestTitle,
                form,
              });
              return;
            }

            await addSeriesMutation.mutateAsync({
              anilistId,
              title: providerRequestTitle,
              ...(matchingTitleHint ? { primaryTitleHint: matchingTitleHint } : {}),
              metadata: resolvedMetadata,
              form,
            });
          },
          onSaveDefaults: async (form: SonarrFormState) => {
            await updateDefaultsMutation.mutateAsync(form);
          },
        }
      : null;

  const radarrPanelProps: Omit<RadarrPanelProps, 'controller'> | null =
    provider === 'radarr'
      ? {
          mode: radarrPanelMode,
          anilistId,
          title: resolvedTitle,
          tmdbId: externalId,
          initialForm: radarrInitialForm,
          defaultForm: radarrDefaultForm,
          metadata: radarrMetadataQuery.data ?? null,
          radarrReady: isConfigured,
          disabled: !isConfigured || radarrMetadataQuery.isPending || radarrMetadataQuery.isError,
          portalContainer,
          folderSlug: radarrFolderSlug ?? null,
          onSubmit: async (form: RadarrFormState) => {
            if (!isConfigured) return;
            if (radarrPanelMode === 'edit') {
              if (!externalId) return;
              await updateMovieMutation.mutateAsync({
                anilistId,
                tmdbId: externalId,
                title: providerRequestTitle,
                form,
              });
              return;
            }

            await addMovieMutation.mutateAsync({
              anilistId,
              title: providerRequestTitle,
              ...(matchingTitleHint ? { primaryTitleHint: matchingTitleHint } : {}),
              metadata: resolvedMetadata,
              form,
            });
          },
          onSaveDefaults: async (form: RadarrFormState) => {
            await updateRadarrDefaultsMutation.mutateAsync(form);
          },
        }
      : null;

  return {
    title: resolvedTitle,
    alternateTitles,
    titleLanguage,
    provider,
    mappingTabProps,
    sonarrPanelProps,
    radarrPanelProps,
    externalId,
    inLibrary,
    bannerImage,
    coverImage,
    format,
    year,
    status,
  };
}
