// src/shared/hooks/use-media-modal-props.ts
import { useMemo } from 'react';
import type {
  CheckSeriesStatusResponse,
  MappingSearchResult,
  MediaMetadataHint,
  MediaStatus,
  MediaService,
  SonarrFormState,
  SonarrLookupSeries,
  SonarrSeries,
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
  useUpdateSeries,
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
  searchForCutoffUnmet: false,
  tags: [],
  freeformTags: [],
};

const trimTrailingSeparators = (input: string): string => input.replace(/[\\/]+$/, '').trim();

const extractSlugFromPath = (path?: string | null, rootFolderPath?: string | null): string | null => {
  if (!path) return null;
  const normalizedPath = trimTrailingSeparators(path).replace(/\\/g, '/');
  const normalizedRoot = rootFolderPath ? trimTrailingSeparators(rootFolderPath).replace(/\\/g, '/') : null;

  if (normalizedRoot && normalizedPath.toLowerCase().startsWith(normalizedRoot.toLowerCase())) {
    const remainder = normalizedPath.slice(normalizedRoot.length).replace(/^\/+/, '');
    if (remainder.length > 0) return remainder;
  }

  const segments = normalizedPath.split('/');
  const last = segments[segments.length - 1];
  return last?.length ? last : null;
};

const sanitizePathSegment = (segment: string): string => segment.replace(/[\\/]+/g, ' ').trim().replace(/\s+/g, ' ');

const deriveFolderSlug = (series: SonarrSeries | null | undefined): string | null => {
  if (!series) return null;

  const slugFromPath = extractSlugFromPath(series.path, series.rootFolderPath);
  if (slugFromPath) return slugFromPath;
  if (series.folder && series.folder.trim()) return series.folder.trim();
  if (series.titleSlug && series.titleSlug.trim()) return series.titleSlug.trim();

  const title = sanitizePathSegment(series.title ?? '');
  if (!title) return null;
  const suffix =
    typeof series.tvdbId === 'number' && Number.isFinite(series.tvdbId)
      ? ` [tvdb-${series.tvdbId}]`
      : '';
  return `${title}${suffix}`;
};

const deriveRootFromSeries = (series: SonarrSeries | null | undefined, slug?: string | null): string | null => {
  if (!series) return null;
  if (series.rootFolderPath && series.rootFolderPath.trim()) return series.rootFolderPath;
  if (!series.path || !series.path.trim()) return null;

  const normalizedPath = trimTrailingSeparators(series.path);
  if (slug && normalizedPath.toLowerCase().endsWith(slug.toLowerCase())) {
    const candidate = normalizedPath.slice(0, normalizedPath.length - slug.length);
    return trimTrailingSeparators(candidate);
  }

  const lastSlash = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));
  if (lastSlash === -1) return null;
  return normalizedPath.slice(0, lastSlash);
};

const isFullSonarrSeries = (series: unknown): series is SonarrSeries =>
  Boolean(series && typeof series === 'object' && ('path' in (series as Record<string, unknown>) || 'rootFolderPath' in (series as Record<string, unknown>)));

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
    const mapped = toMappingSearchResultFromSonarr(status.series as SonarrLookupSeries, {
      baseUrl: baseUrl ?? '',
      libraryTvdbIds: [status.tvdbId], // Mark as in Sonarr
    });
    return {
      ...mapped,
      ...(status.linkedAniListIds && status.linkedAniListIds.length > 0
        ? { linkedAniListIds: status.linkedAniListIds }
        : {}),
    };
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

  return {
    ...mapping,
    ...(status.linkedAniListIds && status.linkedAniListIds.length > 0
      ? { linkedAniListIds: status.linkedAniListIds }
      : {}),
  };
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
  const updateSeriesMutation = useUpdateSeries();
  const sonarrReady = isConfigured;

  const mappingUnavailable = statusQuery.data?.anilistTvdbLinkMissing === true;
  const tvdbId = mappingUnavailable ? null : statusQuery.data?.tvdbId ?? null;
  const inLibrary = Boolean(statusQuery.data?.exists || addSeriesMutation.isSuccess || updateSeriesMutation.isSuccess);
  const linkedAniListIds = statusQuery.data?.linkedAniListIds ?? [];

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
  const panelMode: 'add' | 'edit' = sonarrReady && statusQuery.data?.exists ? 'edit' : 'add';

  const seriesFromStatus = statusQuery.data?.series;
  const fullSeries = isFullSonarrSeries(seriesFromStatus) ? seriesFromStatus : null;
  const folderSlug = deriveFolderSlug(fullSeries);
  const resolvedRootFolder = deriveRootFromSeries(fullSeries, folderSlug) ?? defaultForm.rootFolderPath;

  const initialForm: SonarrFormState = useMemo(() => {
    if (panelMode === 'edit' && fullSeries) {
      return {
        ...defaultForm,
        qualityProfileId:
          typeof fullSeries.qualityProfileId === 'number' && Number.isFinite(fullSeries.qualityProfileId)
            ? fullSeries.qualityProfileId
            : defaultForm.qualityProfileId,
        rootFolderPath: resolvedRootFolder,
        seriesType: fullSeries.seriesType ?? defaultForm.seriesType,
        monitorOption:
          fullSeries.monitored === false
            ? 'none'
            : (fullSeries.addOptions?.monitor as SonarrFormState['monitorOption']) ?? defaultForm.monitorOption,
        seasonFolder:
          typeof fullSeries.seasonFolder === 'boolean' ? fullSeries.seasonFolder : defaultForm.seasonFolder,
        searchForMissingEpisodes: defaultForm.searchForMissingEpisodes,
        searchForCutoffUnmet: defaultForm.searchForCutoffUnmet,
        tags: Array.isArray(fullSeries.tags)
          ? fullSeries.tags.filter((tag): tag is number => typeof tag === 'number')
          : defaultForm.tags,
      };
    }

    return defaultForm;
  }, [defaultForm, fullSeries, panelMode, resolvedRootFolder]);

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
    otherAniListIds: linkedAniListIds.filter(id => id !== anilistId),
    service: 'sonarr',
  };

  const sonarrPanelProps: Omit<SonarrPanelProps, 'controller'> = {
    mode: panelMode,
    anilistId,
    title: resolvedTitle.primary,
    tvdbId,
    initialForm,
    defaultForm,
    metadata: sonarrMetadataQuery.data ?? null,
    sonarrReady,
    disabled:
      !sonarrReady || sonarrMetadataQuery.isPending || sonarrMetadataQuery.isError,
    portalContainer,
    folderSlug: folderSlug ?? null,
    onSubmit: async (form: SonarrFormState) => {
      if (!sonarrReady) return;
      if (panelMode === 'edit') {
        if (!tvdbId) return;
        await updateSeriesMutation.mutateAsync({
          anilistId,
          tvdbId,
          title: resolvedTitle.primary,
          form,
        });
      } else {
        await addSeriesMutation.mutateAsync({
          anilistId,
          title: resolvedTitle.primary,
          primaryTitleHint: resolvedTitle.primary,
          metadata: metadata ?? null,
          form,
        });
      }
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
