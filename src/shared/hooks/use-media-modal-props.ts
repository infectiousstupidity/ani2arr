// src/shared/hooks/use-media-modal-props.ts
import type {
  CheckSeriesStatusResponse,
  MappingSearchResult,
  MediaMetadataHint,
  MediaStatus,
  MediaService,
  SonarrFormState,
  SonarrLookupSeries,
  AniFormat,
  AniTitles,
  ExtensionOptions,
} from '@/shared/types';
import type { MappingTabProps, SonarrPanelProps } from '@/features/media-modal';
import {
  useAddSeries,
  useAniListMedia,
  usePublicOptions,
  useSeriesStatus,
  useSonarrMetadata,
  useUpdateDefaultSettings,
} from './use-api-queries';
import { toMappingSearchResultFromSonarr } from '@/shared/mapping/sonarr.adapter';
import { resolveTitlePreference } from '@/shared/utils/title-preference';

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
  mappingTabProps: Omit<MappingTabProps, 'controller' | 'baseUrl'>;
  sonarrPanelProps: Omit<SonarrPanelProps, 'controller'>;
  tvdbId: number | null;
  inLibrary: boolean;
  bannerImage: string | null;
  coverImage: string | null;
  format: AniFormat | null;
  year: number | null;
  status: MediaStatus | null;
}

const defaultFormState: SonarrFormState = {
  qualityProfileId: '',
  rootFolderPath: '',
  seriesType: 'anime',
  monitorOption: 'all',
  seasonFolder: true,
  searchForMissingEpisodes: true,
  tags: [],
};

function deriveCurrentMappingFromStatus(
  status: CheckSeriesStatusResponse | null | undefined,
  service: MediaService = 'sonarr',
  baseUrl?: string,
): MappingSearchResult | null {
  if (!status || status.tvdbId == null) {
    return null;
  }

  // If we have a full series object (from force_verify), map it using the adapter
  // to get rich metadata like posters, overview, etc.
  if (status.series && 'images' in status.series) {
    return toMappingSearchResultFromSonarr(status.series as SonarrLookupSeries, {
      baseUrl: baseUrl ?? '',
      libraryTvdbIds: [status.tvdbId], // Mark as in library
    });
  }

  // Fallback for lean series (cached status)
  const tvdbId = status.tvdbId;
  const inLibrary = Boolean(status.exists);
  const librarySlug = status.series?.titleSlug;
  const title = status.series?.title ?? `TVDB ${tvdbId}`;

  const mapping: MappingSearchResult = {
    service,
    target: { id: tvdbId, idType: 'tvdb' },
    title,
    inLibrary,
    ...(librarySlug ? { librarySlug } : {}),
  };

  return mapping;
}

/**
 * Shared hook to build MediaModal tab props from AniList entry data.
 * Encapsulates all query/mutation logic and prop derivation.
 * Used by all entrypoints (anime detail, browse, AniChart) to avoid duplication.
 */
export function useMediaModalProps(
  input: UseMediaModalPropsInput,
): UseMediaModalPropsResult | null {
  const { anilistId, title, metadata, portalContainer, isOpen } = input;

  const { data: options } = usePublicOptions();
  const isConfigured = options?.isConfigured === true;

  const statusQuery = useSeriesStatus(
    {
      anilistId: anilistId ?? 0,
      title: title ?? '',
      metadata: metadata ?? null,
    },
    {
      enabled: Boolean(anilistId && isConfigured && isOpen),
      force_verify: true,
      ignoreFailureCache: true,
      priority: 'high',
    },
  );

  const aniListMediaQuery = useAniListMedia(anilistId, {
    enabled: Boolean(anilistId && isOpen),
    // Rely on cached/prefetched media; background refresh is handled by the service when stale.
    forceRefresh: false,
  });

  const apiMedia = aniListMediaQuery.data;
  const coverImage =
    apiMedia?.coverImage?.extraLarge ??
    apiMedia?.coverImage?.large ??
    apiMedia?.coverImage?.medium ??
    metadata?.coverImage ??
    null;
  const bannerImage = apiMedia?.bannerImage ?? null;

  const addSeriesMutation = useAddSeries();
  const sonarrReady = isConfigured;

  const mappingUnavailable = statusQuery.data?.anilistTvdbLinkMissing === true;
  const tvdbId = mappingUnavailable ? null : statusQuery.data?.tvdbId ?? null;
  const inLibrary = Boolean(statusQuery.data?.exists || addSeriesMutation.isSuccess);

  const format: AniFormat | null = apiMedia?.format ?? metadata?.format ?? null;
  const year: number | null =
    apiMedia?.seasonYear ?? apiMedia?.startDate?.year ?? metadata?.startYear ?? null;
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
  const _english = pickTitle(apiMedia?.title?.english, metadata?.titles?.english);
  if (typeof _english === 'string') resolvedTitles.english = _english;
  const _romaji = pickTitle(apiMedia?.title?.romaji, metadata?.titles?.romaji, title);
  if (typeof _romaji === 'string') resolvedTitles.romaji = _romaji;
  const _native = pickTitle(apiMedia?.title?.native, metadata?.titles?.native);
  if (typeof _native === 'string') resolvedTitles.native = _native;

  const resolvedTitle = resolveTitlePreference({
    titles: resolvedTitles,
    preferred: preferredTitleLanguage,
    fallback: title ?? null,
  });

  const sonarrMetadataQuery = useSonarrMetadata({
    enabled: sonarrReady && isOpen,
  });

  const updateDefaultsMutation = useUpdateDefaultSettings();

  const defaultForm: SonarrFormState = options?.defaults ?? defaultFormState;

  // Return null if required data is missing (but allow modal to render even when closed)
  if (!anilistId || !title) {
    return null;
  }

  const mappingTabProps: Omit<MappingTabProps, 'controller' | 'baseUrl'> = {
    aniListEntry: {
      id: anilistId,
      title: resolvedTitle.primary,
      ...(coverImage ? { posterUrl: coverImage } : {}),
    },
    currentMapping: deriveCurrentMappingFromStatus(statusQuery.data, 'sonarr', options?.sonarrUrl),
    overrideActive: statusQuery.data?.overrideActive === true,
    otherAniListIds: [],
    service: 'sonarr',
  };

  const sonarrPanelProps: Omit<SonarrPanelProps, 'controller'> = {
    mode: 'add',
    anilistId,
    title: resolvedTitle.primary,
    tvdbId,
    initialForm: defaultForm,
    defaultForm,
    metadata: sonarrMetadataQuery.data ?? null,
    sonarrReady,
    disabled: !sonarrReady || sonarrMetadataQuery.isPending || sonarrMetadataQuery.isError,
    portalContainer,
    onSubmit: async (form: SonarrFormState) => {
      if (!sonarrReady) return;
      await addSeriesMutation.mutateAsync({
        anilistId,
        title: resolvedTitle.primary,
        primaryTitleHint: resolvedTitle.primary,
        metadata: metadata ?? null,
        form,
      });
    },
    onSaveDefaults: async (form: SonarrFormState) => {
      await updateDefaultsMutation.mutateAsync(form);
    },
  };

  return {
    mappingTabProps,
    sonarrPanelProps,
    tvdbId,
    inLibrary,
    bannerImage,
    coverImage,
    format,
    year,
    status,
    title: resolvedTitle.primary,
    alternateTitles: resolvedTitle.alternates,
    titleLanguage: preferredTitleLanguage,
  };
}
