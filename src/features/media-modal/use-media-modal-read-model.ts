/** Builds the shared AniList and provider read model for media modal launches. */
// src/features/media-modal/use-media-modal-read-model.ts

import type {
  AniListMediaFormat,
  AniListMediaHint,
  AniListMediaStatus,
  AniListTitles,
} from '@/anilist/schemas/media.schema';
import { mergeMetadataHints, metadataHintFromAniListMetadata } from '@/anilist/metadata-hints';
import { resolveTitlePreference } from '@/anilist/title-preference';
import type { PublicOptions } from '@/options';
import { usePublicOptions } from '@/options';
import type { Provider } from '@/providers';
import { resolveProviderForAniListFormat } from '@/providers/provider-routing';
import { useMovieStatus } from '@/providers/hooks/radarr.queries';
import { useSeriesStatus } from '@/providers/hooks/sonarr.queries';
import type { MappingTabProps } from './types';
import { deriveCurrentMapping } from '@/features/mapping/current-mapping';
import {
  useAniListMedia,
  useAniListMetadataBatch,
} from '@/shared/queries';

export interface UseMediaModalReadModelInput {
  anilistId: number | undefined;
  title: string | undefined;
  metadata: AniListMediaHint | null | undefined;
  isOpen: boolean;
  providerOverride?: Provider | null | undefined;
  initialProviderId?: number | null | undefined;
}

export interface UseMediaModalReadModelResult {
  title: string;
  alternateTitles: Array<{ label: string; value: string }>;
  titleLanguage: NonNullable<PublicOptions['providers']['sonarr']['preferredAniListTitleLanguage']>;
  provider: Provider;
  baseUrl: string;
  mappingTabProps: Omit<MappingTabProps, 'controller' | 'baseUrl'>;
  externalId: number | null;
  bannerImage: string | null;
  coverImage: string | null;
  format: AniListMediaFormat | null;
  year: number | null;
  status: AniListMediaStatus | null;
  statusExists: boolean;
  resolvedMetadata: AniListMediaHint | null;
  providerRequestTitle: string;
  matchingTitleHint: string | undefined;
  sonarrStatusQuery: ReturnType<typeof useSeriesStatus>;
  radarrStatusQuery: ReturnType<typeof useMovieStatus>;
  options: PublicOptions | undefined;
}

function pickTitle(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

export function useMediaModalReadModel(
  input: UseMediaModalReadModelInput,
): UseMediaModalReadModelResult | null {
  const { anilistId, title, metadata, isOpen, providerOverride, initialProviderId } = input;
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
  const format: AniListMediaFormat | null =
    canonicalMetadata?.format ?? apiMedia?.format ?? resolvedMetadata?.format ?? null;
  const provider = providerOverride ?? resolveProviderForAniListFormat(format);

  const preferredTitleLanguage: NonNullable<PublicOptions['providers']['sonarr']['preferredAniListTitleLanguage']> =
    provider === 'radarr'
      ? (options?.providers.radarr.preferredAniListTitleLanguage ?? 'english')
      : (options?.providers.sonarr.preferredAniListTitleLanguage ?? 'english');

  const resolvedTitles: AniListTitles = {};
  const english = pickTitle(apiMedia?.title?.english, resolvedMetadata?.titles?.english);
  if (english) resolvedTitles.english = english;
  const romaji = pickTitle(apiMedia?.title?.romaji, resolvedMetadata?.titles?.romaji);
  if (romaji) resolvedTitles.romaji = romaji;
  const native = pickTitle(apiMedia?.title?.native, resolvedMetadata?.titles?.native);
  if (native) resolvedTitles.native = native;

  const matchingFallbackTitle =
    title ??
    english ??
    romaji ??
    native ??
    (anilistId ? `AniList #${anilistId}` : undefined);

  const resolvedTitle = resolveTitlePreference({
    titles: resolvedTitles,
    preferred: preferredTitleLanguage,
    fallback: matchingFallbackTitle ?? null,
  });
  const providerRequestTitle = title ?? resolvedTitle.primary;
  const matchingTitleHint = title ?? undefined;

  const isSonarrConfigured = options?.providers.sonarr.isConfigured === true;
  const isRadarrConfigured = options?.providers.radarr.isConfigured === true;

  const sonarrStatusQuery = useSeriesStatus(
    {
      anilistId: anilistId ?? 0,
      title: matchingFallbackTitle ?? '',
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
      title: matchingFallbackTitle ?? '',
      metadata: resolvedMetadata,
    },
    {
      enabled: Boolean(anilistId && isOpen && provider === 'radarr' && isRadarrConfigured),
      force_verify: true,
      ignoreFailureCache: true,
      priority: 'high',
    },
  );

  if (!anilistId || !provider) {
    return null;
  }

  const baseUrl =
    provider === 'radarr'
      ? options?.providers.radarr.url ?? ''
      : options?.providers.sonarr.url ?? '';
  const mappingUnavailable =
    provider === 'radarr'
      ? radarrStatusQuery.data?.anilistTmdbLinkMissing === true
      : sonarrStatusQuery.data?.anilistTvdbLinkMissing === true;
  const externalId = mappingUnavailable
    ? null
    : (provider === 'radarr'
      ? radarrStatusQuery.data?.tmdbId ?? null
      : sonarrStatusQuery.data?.tvdbId ?? null);
  const linkedAniListIds =
    provider === 'radarr'
      ? radarrStatusQuery.data?.linkedAniListIds ?? []
      : sonarrStatusQuery.data?.linkedAniListIds ?? [];
  const currentMapping = deriveCurrentMapping(
    provider === 'radarr'
      ? {
          provider,
          status: radarrStatusQuery.data,
          baseUrl,
          fallbackProviderId: initialProviderId,
          fallbackTitle: resolvedTitle.primary,
        }
      : {
          provider,
          status: sonarrStatusQuery.data,
          baseUrl,
          fallbackProviderId: initialProviderId,
          fallbackTitle: resolvedTitle.primary,
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

  return {
    title: resolvedTitle.primary,
    alternateTitles: resolvedTitle.alternates,
    titleLanguage: preferredTitleLanguage,
    provider,
    baseUrl,
    mappingTabProps: {
      aniListEntry: {
        id: anilistId,
        title: resolvedTitle.primary,
        ...(coverImage ? { posterUrl: coverImage } : {}),
      },
      currentMapping,
      overrideActive:
        provider === 'radarr'
          ? radarrStatusQuery.data?.overrideActive === true
          : sonarrStatusQuery.data?.overrideActive === true,
      otherAniListIds: linkedAniListIds.filter((id: number) => id !== anilistId),
      provider,
    },
    externalId,
    bannerImage,
    coverImage,
    format,
    year,
    status,
    statusExists:
      provider === 'radarr'
        ? Boolean(radarrStatusQuery.data?.exists)
        : Boolean(sonarrStatusQuery.data?.exists),
    resolvedMetadata,
    providerRequestTitle,
    matchingTitleHint,
    sonarrStatusQuery,
    radarrStatusQuery,
    options,
  };
}
