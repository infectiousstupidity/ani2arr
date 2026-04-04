/** Builds media modal props from AniList state, provider status, and provider metadata. */
// src/features/media-overlay/hooks/use-media-modal-props.ts

import { useMemo } from 'react';
import type { CheckMovieStatusResponse, CheckSeriesStatusResponse } from '@/rpc/types';
import type {
  AniListMediaFormat,
  AniListMediaHint,
  AniListMediaStatus,
  AniListTitles,
} from '@/anilist/schemas/media.schema';
import type { ExtensionOptions } from '@/options';
import type { RadarrFormState } from '@/providers/settings/radarr-settings.schema';
import type { SonarrFormState } from '@/providers/settings/sonarr-settings.schema';
import type {
  Provider,
  RadarrLookupMovie,
  RadarrMovie,
  SonarrLookupSeries,
  SonarrSeries,
} from '@/providers';
import type { MappingTabProps, RadarrPanelProps, SonarrPanelProps } from '@/features/media-modal';
import { createDefaultRadarrFormState } from '@/providers/settings/radarr-settings.schema';
import { createDefaultSonarrFormState } from '@/providers/settings/sonarr-settings.schema';
import {
  useAniListMedia,
  useAniListMetadataBatch,
} from '@/shared/queries';
import { toMappingSearchResultFromRadarr } from '@/features/mapping/radarr.adapter';
import { toMappingSearchResultFromSonarr } from '@/features/mapping/sonarr.adapter';
import { resolveTitlePreference } from '@/anilist/title-preference';
import { mergeMetadataHints, metadataHintFromAniListMetadata } from '@/anilist/metadata-hints';
import { usePublicOptions } from '@/options';
import {
  buildProviderFolderSlug,
  extractProviderRootFolderPath,
  getProviderLibrarySlug,
  type ProviderMediaPathSource,
} from '@/providers/library/paths';
import { resolveProviderForAniListFormat } from '@/providers/provider-routing';
import {
  useAddMovie,
  useMovieStatus,
  useRadarrMetadata,
  useUpdateRadarrDefaultSettings,
  useUpdateMovie,
} from '@/providers/hooks/radarr.queries';
import {
  useAddSeries,
  useSeriesStatus,
  useSonarrMetadata,
  useUpdateDefaultSettings,
  useUpdateSeries,
} from '@/providers/hooks/sonarr.queries';

export interface UseMediaModalPropsInput {
  anilistId: number | undefined;
  title: string | undefined;
  metadata: AniListMediaHint | null | undefined;
  portalContainer: HTMLElement | ShadowRoot | null;
  isOpen: boolean;
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
  const librarySlug = getProviderLibrarySlug('sonarr', status.series as ProviderMediaPathSource | undefined);
  const title = status.series?.title ?? `TVDB ${tvdbId}`;

  return {
    provider: 'sonarr' as const,
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
      inLibrary: Boolean(status.exists),
    });
    return {
      ...mapped,
      ...(status.linkedAniListIds?.length ? { linkedAniListIds: status.linkedAniListIds } : {}),
    };
  }

  const tmdbId = status.tmdbId;
  const librarySlug = getProviderLibrarySlug('radarr', status.movie as ProviderMediaPathSource | undefined);
  const title = status.movie?.title ?? `TMDB ${tmdbId}`;

  return {
    provider: 'radarr' as const,
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
  const format: AniListMediaFormat | null = canonicalMetadata?.format ?? apiMedia?.format ?? resolvedMetadata?.format ?? null;
  const provider = resolveProviderForAniListFormat(format);

  const isSonarrConfigured = options?.providers.sonarr.isConfigured === true;
  const isRadarrConfigured = options?.providers.radarr.isConfigured === true;
  const isConfigured = provider === 'radarr' ? isRadarrConfigured : isSonarrConfigured;

  const sonarrStatusQuery = useSeriesStatus(
    {
      anilistId: anilistId ?? 0,
      title: title ?? '',
      metadata: resolvedMetadata,
    },
    {
      enabled: Boolean(anilistId && isOpen && provider === 'sonarr' && isSonarrConfigured),
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
      enabled: Boolean(anilistId && isOpen && provider === 'radarr' && isRadarrConfigured),
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
  const status: AniListMediaStatus | null = apiMedia?.status ?? null;
  const preferredTitleLanguage: NonNullable<ExtensionOptions['providers']['sonarr']['preferredAniListTitleLanguage']> =
    provider === 'radarr'
      ? (options?.providers.radarr.preferredAniListTitleLanguage ?? 'english')
      : (options?.providers.sonarr.preferredAniListTitleLanguage ?? 'english');

  const pickTitle = (...values: Array<string | null | undefined>): string | undefined => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
    return undefined;
  };

  const resolvedTitles: AniListTitles = {};
  const english = pickTitle(apiMedia?.title?.english, resolvedMetadata?.titles?.english);
  if (english) resolvedTitles.english = english;
  const romaji = pickTitle(apiMedia?.title?.romaji, resolvedMetadata?.titles?.romaji);
  if (romaji) resolvedTitles.romaji = romaji;
  const native = pickTitle(apiMedia?.title?.native, resolvedMetadata?.titles?.native);
  if (native) resolvedTitles.native = native;

  const resolvedTitle = resolveTitlePreference({
    titles: resolvedTitles,
    preferred: preferredTitleLanguage,
    fallback: title ?? null,
  });
  const providerRequestTitle = title ?? resolvedTitle.primary;
  const matchingTitleHint = title ?? undefined;

  const addSeriesMutation = useAddSeries();
  const updateSeriesMutation = useUpdateSeries();
  const addMovieMutation = useAddMovie();
  const updateMovieMutation = useUpdateMovie();
  const sonarrMetadataQuery = useSonarrMetadata({
    enabled: provider === 'sonarr' && isConfigured && isOpen,
  });
  const radarrMetadataQuery = useRadarrMetadata({
    enabled: provider === 'radarr' && isConfigured && isOpen,
  });
  const updateDefaultsMutation = useUpdateDefaultSettings();
  const updateRadarrDefaultsMutation = useUpdateRadarrDefaultSettings();

  const statusQuery = provider === 'radarr' ? radarrStatusQuery : sonarrStatusQuery;
  const mappingUnavailable =
    provider === 'radarr'
      ? radarrStatusQuery.data?.anilistTmdbLinkMissing === true
      : sonarrStatusQuery.data?.anilistTvdbLinkMissing === true;
  const externalId = mappingUnavailable
    ? null
    : (provider === 'radarr'
      ? radarrStatusQuery.data?.tmdbId ?? null
      : sonarrStatusQuery.data?.tvdbId ?? null);

  const inLibrary = Boolean(
    statusQuery.data?.exists ||
      (provider === 'radarr'
        ? addMovieMutation.isSuccess || updateMovieMutation.isSuccess
        : addSeriesMutation.isSuccess || updateSeriesMutation.isSuccess),
  );

  const linkedAniListIds =
    provider === 'radarr'
      ? radarrStatusQuery.data?.linkedAniListIds ?? []
      : sonarrStatusQuery.data?.linkedAniListIds ?? [];

  const sonarrDefaultForm: SonarrFormState = options?.providers.sonarr.defaults ?? defaultSonarrFormState;
  const radarrDefaultForm: RadarrFormState = options?.providers.radarr.defaults ?? defaultRadarrFormState;

  const sonarrSeriesFromStatus = sonarrStatusQuery.data?.series;
  const fullSonarrSeries = isFullSonarrSeries(sonarrSeriesFromStatus) ? sonarrSeriesFromStatus : null;
  const sonarrFolderSlug = fullSonarrSeries ? buildProviderFolderSlug(fullSonarrSeries, providerRequestTitle) : null;
  const resolvedSonarrRootFolder =
    extractProviderRootFolderPath(fullSonarrSeries, sonarrFolderSlug) ?? sonarrDefaultForm.rootFolderPath;
  const sonarrPanelMode: 'add' | 'edit' =
    isConfigured && provider === 'sonarr' && sonarrStatusQuery.data?.exists ? 'edit' : 'add';

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
        searchForMissingEpisodes:
          fullSonarrSeries.addOptions?.searchForMissingEpisodes ?? sonarrDefaultForm.searchForMissingEpisodes,
        searchForCutoffUnmetEpisodes:
          fullSonarrSeries.addOptions?.searchForCutoffUnmetEpisodes ??
          sonarrDefaultForm.searchForCutoffUnmetEpisodes,
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
  const radarrFolderSlug = fullRadarrMovie ? buildProviderFolderSlug(fullRadarrMovie, providerRequestTitle) : null;
  const resolvedRadarrRootFolder =
    extractProviderRootFolderPath(fullRadarrMovie, radarrFolderSlug) ?? radarrDefaultForm.rootFolderPath;
  const radarrPanelMode: 'add' | 'edit' =
    isConfigured && provider === 'radarr' && radarrStatusQuery.data?.exists ? 'edit' : 'add';

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

  if (!anilistId || !title || !provider) {
    return null;
  }

  const mappingTabProps: Omit<MappingTabProps, 'controller' | 'baseUrl'> = {
    aniListEntry: {
      id: anilistId,
      title: resolvedTitle.primary,
      ...(coverImage ? { posterUrl: coverImage } : {}),
    },
    currentMapping:
      provider === 'radarr'
        ? deriveRadarrCurrentMappingFromStatus(radarrStatusQuery.data, options?.providers.radarr.url)
        : deriveSonarrCurrentMappingFromStatus(sonarrStatusQuery.data, options?.providers.sonarr.url),
    overrideActive:
      provider === 'radarr'
        ? radarrStatusQuery.data?.overrideActive === true
        : sonarrStatusQuery.data?.overrideActive === true,
    otherAniListIds: linkedAniListIds.filter((id: number) => id !== anilistId),
    provider,
  };

  const sonarrPanelProps: Omit<SonarrPanelProps, 'controller'> | null =
    provider === 'sonarr'
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
    title: resolvedTitle.primary,
    alternateTitles: resolvedTitle.alternates,
    titleLanguage: preferredTitleLanguage,
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
