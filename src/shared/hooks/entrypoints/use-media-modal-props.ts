import { useMemo } from 'react';
import type {
  AniFormat,
  AniTitles,
  CheckMovieStatusResponse,
  CheckSeriesStatusResponse,
  ExtensionOptions,
  MediaMetadataHint,
  MediaService,
  MediaStatus,
  RadarrFormState,
  RadarrLookupMovie,
  RadarrMovie,
  SonarrFormState,
  SonarrLookupSeries,
  SonarrSeries,
} from '@/shared/types';
import type { MappingTabProps, RadarrPanelProps, SonarrPanelProps } from '@/features/media-modal';
import {
  useAddMovie,
  useAddSeries,
  useAniListMedia,
  useAniListMetadataBatch,
  useMovieStatus,
  usePublicOptions,
  useRadarrMetadata,
  useSeriesStatus,
  useSonarrMetadata,
  useUpdateDefaultSettings,
  useUpdateMovie,
  useUpdateRadarrDefaultSettings,
  useUpdateSeries,
} from '@/shared/queries';
import { toMappingSearchResultFromRadarr } from '@/features/mapping/radarr.adapter';
import { toMappingSearchResultFromSonarr } from '@/features/mapping/sonarr.adapter';
import { resolveTitlePreference } from '@/shared/anilist/title-preference';
import { mergeMetadataHints, metadataHintFromAniListMetadata } from '@/shared/anilist/media-metadata';
import {
  buildFolderSlug,
  extractRootFolderPath,
  getLibrarySlug,
  type FolderSlugSource,
} from '@/services/helpers/path-utils';
import { resolveProviderForAniListFormat } from '@/services/providers/resolver';

export interface UseMediaModalPropsInput {
  anilistId: number | undefined;
  title: string | undefined;
  metadata: MediaMetadataHint | null | undefined;
  portalContainer: HTMLElement | ShadowRoot | null;
  isOpen: boolean;
}

export interface UseMediaModalPropsResult {
  title: string;
  alternateTitles: Array<{ label: string; value: string }>;
  titleLanguage: NonNullable<ExtensionOptions['titleLanguage']>;
  service: MediaService;
  mappingTabProps: Omit<MappingTabProps, 'controller' | 'baseUrl'>;
  sonarrPanelProps: Omit<SonarrPanelProps, 'controller'> | null;
  radarrPanelProps: Omit<RadarrPanelProps, 'controller'> | null;
  externalId: number | null;
  inLibrary: boolean;
  bannerImage: string | null;
  coverImage: string | null;
  format: AniFormat | null;
  year: number | null;
  status: MediaStatus | null;
}

const defaultSonarrFormState: SonarrFormState = {
  qualityProfileId: '',
  rootFolderPath: '',
  seriesType: 'anime',
  monitorOption: 'all',
  seasonFolder: true,
  searchForMissingEpisodes: true,
  searchForCutoffUnmet: false,
  tags: [],
  freeformTags: [],
};

const defaultRadarrFormState: RadarrFormState = {
  qualityProfileId: '',
  rootFolderPath: '',
  monitored: true,
  searchForMovie: true,
  minimumAvailability: 'announced',
  tags: [],
  freeformTags: [],
};

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

function deriveSonarrCurrentMappingFromStatus(
  status: CheckSeriesStatusResponse | null | undefined,
  baseUrl?: string,
) {
  if (!status || status.tvdbId == null) {
    return null;
  }

  if (status.series && 'images' in status.series) {
    const mapped = toMappingSearchResultFromSonarr(status.series as SonarrLookupSeries, {
      baseUrl: baseUrl ?? '',
      libraryTvdbIds: status.exists ? [status.tvdbId] : [],
    });
    return {
      ...mapped,
      ...(status.linkedAniListIds?.length ? { linkedAniListIds: status.linkedAniListIds } : {}),
    };
  }

  const tvdbId = status.tvdbId;
  const librarySlug = status.series?.titleSlug;
  const title = status.series?.title ?? `TVDB ${tvdbId}`;

  return {
    service: 'sonarr' as const,
    target: { id: tvdbId, kind: 'tvdb' as const },
    title,
    inLibrary: Boolean(status.exists),
    ...(librarySlug ? { librarySlug } : {}),
    ...(status.linkedAniListIds?.length ? { linkedAniListIds: status.linkedAniListIds } : {}),
  };
}

function deriveRadarrCurrentMappingFromStatus(
  status: CheckMovieStatusResponse | null | undefined,
  baseUrl?: string,
) {
  if (!status || status.tmdbId == null) {
    return null;
  }

  if (status.movie && 'images' in status.movie) {
    const mapped = toMappingSearchResultFromRadarr(status.movie as RadarrLookupMovie, {
      baseUrl: baseUrl ?? '',
      libraryTmdbIds: status.exists ? [status.tmdbId] : [],
    });
    return {
      ...mapped,
      ...(status.linkedAniListIds?.length ? { linkedAniListIds: status.linkedAniListIds } : {}),
    };
  }

  const tmdbId = status.tmdbId;
  const librarySlug = getLibrarySlug('radarr', status.movie as FolderSlugSource | undefined);
  const title = status.movie?.title ?? `TMDB ${tmdbId}`;

  return {
    service: 'radarr' as const,
    target: { id: tmdbId, kind: 'tmdb' as const },
    title,
    inLibrary: Boolean(status.exists),
    ...(librarySlug ? { librarySlug } : {}),
    ...(status.linkedAniListIds?.length ? { linkedAniListIds: status.linkedAniListIds } : {}),
  };
}

export function useMediaModalProps(
  input: UseMediaModalPropsInput,
): UseMediaModalPropsResult | null {
  const { anilistId, title, metadata, portalContainer, isOpen } = input;

  const { data: options } = usePublicOptions();
  const metadataBatch = useAniListMetadataBatch(anilistId ? [anilistId] : [], {
    enabled: Boolean(anilistId && isOpen),
  });
  const { data: apiMedia } = useAniListMedia(anilistId, {
    enabled: Boolean(anilistId && isOpen),
    forceRefresh: false,
  });

  const canonicalMetadata = metadataHintFromAniListMetadata(metadataBatch.data?.metadata?.[0] ?? null);
  const resolvedMetadata = mergeMetadataHints(canonicalMetadata, metadata ?? null);
  const format: AniFormat | null = canonicalMetadata?.format ?? apiMedia?.format ?? resolvedMetadata?.format ?? null;
  const service = resolveProviderForAniListFormat(format);

  const isSonarrConfigured = options?.providers.sonarr.isConfigured === true;
  const isRadarrConfigured = options?.providers.radarr.isConfigured === true;
  const isConfigured = service === 'radarr' ? isRadarrConfigured : isSonarrConfigured;

  const sonarrStatusQuery = useSeriesStatus(
    {
      anilistId: anilistId ?? 0,
      title: title ?? '',
      metadata: resolvedMetadata,
    },
    {
      enabled: Boolean(anilistId && isOpen && service === 'sonarr' && isSonarrConfigured),
      force_verify: true,
      ignoreFailureCache: true,
      priority: 'high',
    },
  );

  const radarrStatusQuery = useMovieStatus(
    {
      anilistId: anilistId ?? 0,
      title: title ?? '',
      metadata: resolvedMetadata,
    },
    {
      enabled: Boolean(anilistId && isOpen && service === 'radarr' && isRadarrConfigured),
      force_verify: true,
      ignoreFailureCache: true,
      priority: 'high',
    },
  );

  const coverImage =
    apiMedia?.coverImage?.extraLarge ??
    apiMedia?.coverImage?.large ??
    apiMedia?.coverImage?.medium ??
    resolvedMetadata?.coverImage ??
    null;
  const bannerImage = apiMedia?.bannerImage ?? null;
  const year: number | null =
    apiMedia?.seasonYear ?? apiMedia?.startDate?.year ?? resolvedMetadata?.startYear ?? null;
  const status: MediaStatus | null = apiMedia?.status ?? null;
  const preferredTitleLanguage: NonNullable<ExtensionOptions['titleLanguage']> =
    options?.titleLanguage ?? 'english';

  const pickTitle = (...values: Array<string | null | undefined>): string | undefined => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
    return undefined;
  };

  const resolvedTitles: AniTitles = {};
  const english = pickTitle(apiMedia?.title?.english, resolvedMetadata?.titles?.english);
  if (english) resolvedTitles.english = english;
  const romaji = pickTitle(apiMedia?.title?.romaji, resolvedMetadata?.titles?.romaji, title);
  if (romaji) resolvedTitles.romaji = romaji;
  const native = pickTitle(apiMedia?.title?.native, resolvedMetadata?.titles?.native);
  if (native) resolvedTitles.native = native;

  const resolvedTitle = resolveTitlePreference({
    titles: resolvedTitles,
    preferred: preferredTitleLanguage,
    fallback: title ?? null,
  });

  const addSeriesMutation = useAddSeries();
  const updateSeriesMutation = useUpdateSeries();
  const addMovieMutation = useAddMovie();
  const updateMovieMutation = useUpdateMovie();
  const sonarrMetadataQuery = useSonarrMetadata({
    enabled: service === 'sonarr' && isConfigured && isOpen,
  });
  const radarrMetadataQuery = useRadarrMetadata({
    enabled: service === 'radarr' && isConfigured && isOpen,
  });
  const updateDefaultsMutation = useUpdateDefaultSettings();
  const updateRadarrDefaultsMutation = useUpdateRadarrDefaultSettings();

  const statusQuery = service === 'radarr' ? radarrStatusQuery : sonarrStatusQuery;
  const mappingUnavailable =
    service === 'radarr'
      ? radarrStatusQuery.data?.anilistTmdbLinkMissing === true
      : sonarrStatusQuery.data?.anilistTvdbLinkMissing === true;
  const externalId = mappingUnavailable
    ? null
    : service === 'radarr'
      ? radarrStatusQuery.data?.tmdbId ?? null
      : sonarrStatusQuery.data?.tvdbId ?? null;

  const inLibrary = Boolean(
    statusQuery.data?.exists ||
      (service === 'radarr'
        ? addMovieMutation.isSuccess || updateMovieMutation.isSuccess
        : addSeriesMutation.isSuccess || updateSeriesMutation.isSuccess),
  );

  const linkedAniListIds =
    service === 'radarr'
      ? radarrStatusQuery.data?.linkedAniListIds ?? []
      : sonarrStatusQuery.data?.linkedAniListIds ?? [];

  const sonarrDefaultForm: SonarrFormState = options?.providers.sonarr.defaults ?? defaultSonarrFormState;
  const radarrDefaultForm: RadarrFormState = options?.providers.radarr.defaults ?? defaultRadarrFormState;

  const sonarrSeriesFromStatus = sonarrStatusQuery.data?.series;
  const fullSonarrSeries = isFullSonarrSeries(sonarrSeriesFromStatus) ? sonarrSeriesFromStatus : null;
  const sonarrFolderSlug = fullSonarrSeries ? buildFolderSlug(fullSonarrSeries, resolvedTitle.primary) : null;
  const resolvedSonarrRootFolder =
    extractRootFolderPath(fullSonarrSeries, sonarrFolderSlug) ?? sonarrDefaultForm.rootFolderPath;
  const sonarrPanelMode: 'add' | 'edit' =
    isConfigured && service === 'sonarr' && sonarrStatusQuery.data?.exists ? 'edit' : 'add';

  const sonarrInitialForm: SonarrFormState = useMemo(() => {
    if (sonarrPanelMode === 'edit' && fullSonarrSeries) {
      return {
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
        searchForMissingEpisodes: true,
        searchForCutoffUnmet: false,
        tags: Array.isArray(fullSonarrSeries.tags)
          ? fullSonarrSeries.tags.filter((tag): tag is number => typeof tag === 'number')
          : [],
        freeformTags: [],
      };
    }

    return sonarrDefaultForm;
  }, [fullSonarrSeries, resolvedSonarrRootFolder, sonarrDefaultForm, sonarrPanelMode]);

  const radarrMovieFromStatus = radarrStatusQuery.data?.movie;
  const fullRadarrMovie = isFullRadarrMovie(radarrMovieFromStatus) ? radarrMovieFromStatus : null;
  const radarrFolderSlug = fullRadarrMovie ? buildFolderSlug(fullRadarrMovie, resolvedTitle.primary) : null;
  const resolvedRadarrRootFolder =
    extractRootFolderPath(fullRadarrMovie, radarrFolderSlug) ?? radarrDefaultForm.rootFolderPath;
  const radarrPanelMode: 'add' | 'edit' =
    isConfigured && service === 'radarr' && radarrStatusQuery.data?.exists ? 'edit' : 'add';

  const radarrInitialForm: RadarrFormState = useMemo(() => {
    if (radarrPanelMode === 'edit' && fullRadarrMovie) {
      return {
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
      };
    }

    return radarrDefaultForm;
  }, [fullRadarrMovie, radarrDefaultForm, radarrPanelMode, resolvedRadarrRootFolder]);

  if (!anilistId || !title || !service) {
    return null;
  }

  const mappingTabProps: Omit<MappingTabProps, 'controller' | 'baseUrl'> = {
    aniListEntry: {
      id: anilistId,
      title: resolvedTitle.primary,
      ...(coverImage ? { posterUrl: coverImage } : {}),
    },
    currentMapping:
      service === 'radarr'
        ? deriveRadarrCurrentMappingFromStatus(radarrStatusQuery.data, options?.providers.radarr.url)
        : deriveSonarrCurrentMappingFromStatus(sonarrStatusQuery.data, options?.providers.sonarr.url),
    overrideActive:
      service === 'radarr'
        ? radarrStatusQuery.data?.overrideActive === true
        : sonarrStatusQuery.data?.overrideActive === true,
    otherAniListIds: linkedAniListIds.filter((id: number) => id !== anilistId),
    service,
  };

  const sonarrPanelProps: Omit<SonarrPanelProps, 'controller'> | null =
    service === 'sonarr'
      ? {
          mode: sonarrPanelMode,
          anilistId,
          title: resolvedTitle.primary,
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
                title: resolvedTitle.primary,
                form,
              });
              return;
            }

            await addSeriesMutation.mutateAsync({
              anilistId,
              title: resolvedTitle.primary,
              primaryTitleHint: resolvedTitle.primary,
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
    service === 'radarr'
      ? {
          mode: radarrPanelMode,
          anilistId,
          title: resolvedTitle.primary,
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
                title: resolvedTitle.primary,
                form,
              });
              return;
            }

            await addMovieMutation.mutateAsync({
              anilistId,
              title: resolvedTitle.primary,
              primaryTitleHint: resolvedTitle.primary,
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
    title: resolvedTitle.primary,
    alternateTitles: resolvedTitle.alternates,
    titleLanguage: preferredTitleLanguage,
    service,
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
