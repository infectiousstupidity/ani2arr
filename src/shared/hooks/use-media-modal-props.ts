// src/shared/hooks/use-media-modal-props.ts
import type {
  CheckSeriesStatusResponse,
  MappingSearchResult,
  MediaMetadataHint,
  MediaService,
  SonarrFormState,
} from '@/shared/types';
import type { MappingTabProps, SonarrTabProps } from '@/features/media-modal';
import {
  useAddSeries,
  usePublicOptions,
  useSeriesStatus,
  useSonarrMetadata,
  useUpdateDefaultSettings,
} from './use-api-queries';

export interface UseMediaModalPropsInput {
  anilistId: number | undefined;
  title: string | undefined;
  metadata: MediaMetadataHint | null | undefined;
  portalContainer: HTMLElement | null;
  isOpen: boolean;
}

export interface UseMediaModalPropsResult {
  mappingTabProps: MappingTabProps;
  sonarrTabProps: SonarrTabProps;
  tvdbId: number | null;
  inLibrary: boolean;
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
): MappingSearchResult | null {
  if (!status || status.tvdbId == null) {
    return null;
  }

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

  const addSeriesMutation = useAddSeries();
  const sonarrReady = isConfigured;

  const mappingUnavailable = statusQuery.data?.anilistTvdbLinkMissing === true;
  const tvdbId = mappingUnavailable ? null : statusQuery.data?.tvdbId ?? null;
  const inLibrary = Boolean(statusQuery.data?.exists || addSeriesMutation.isSuccess);

  const sonarrMetadataQuery = useSonarrMetadata({
    enabled: sonarrReady && isOpen,
  });

  const updateDefaultsMutation = useUpdateDefaultSettings();

  const defaultForm: SonarrFormState = options?.defaults ?? defaultFormState;

  // Return null if modal is closed or required data is missing
  if (!isOpen || !anilistId || !title) {
    return null;
  }

  const mappingTabProps: MappingTabProps = {
    aniListEntry: {
      id: anilistId,
      title: title,
    },
    currentMapping: deriveCurrentMappingFromStatus(statusQuery.data, 'sonarr'),
    otherAniListIds: [],
    service: 'sonarr',
  };

  const sonarrTabProps: SonarrTabProps = {
    mode: 'add',
    anilistId,
    title,
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
        title,
        primaryTitleHint: title,
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
    sonarrTabProps,
    tvdbId,
    inLibrary,
  };
}
