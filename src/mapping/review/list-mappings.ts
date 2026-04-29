/** Mapping-owned projection for review-table summaries and paging over recorded mapping state. */
// src/mapping/review/list-mappings.ts

import { parseAniListIdOrNull, type AniListId } from '@/anilist';
import { parseProviderIdentity, PROVIDERS, type ProviderIdFor, type ProviderTargetId, type RadarrMovieSnapshot, type SonarrSeriesSnapshot, type TmdbId, type TvdbId } from '@/providers';
import type { MappingEntryKind } from '@/mapping/types';
import type { MappingSummary } from '@/mapping/ui/mapping-list-types';
import type { AutoMappingRecord } from '@/mapping/auto-mapping/types';
import { buildEffectiveMappingCandidate } from '@/mapping/effective-mapping';
import { deriveLibraryUnknownReason } from '@/providers/library/types';
import { deriveMappingRowStatus } from '@/features/provider-action';
import { projectMappingReview } from './project-review';

export interface ListMappingsCursor {
  updatedAt: number;
  anilistId: AniListId;
  provider: MappingSummary['provider'];
}

export interface ListMappingsInput {
  entryKinds?: MappingEntryKind[] | undefined;
  providers?: MappingSummary['provider'][] | undefined;
  limit?: number | undefined;
  cursor?: ListMappingsCursor | undefined;
  query?: string | undefined;
}

export interface ListMappingsDeps {
  manualMappingService: {
    listIgnores(): Array<{ anilistId: AniListId; provider: MappingSummary['provider']; updatedAt: number }>;
    listRejectedCandidates(): Array<{
      anilistId: AniListId;
      provider: MappingSummary['provider'];
      providerId: NonNullable<MappingSummary['providerId']>;
      updatedAt: number;
    }>;
    list(): Array<{
      anilistId: AniListId;
      provider: MappingSummary['provider'];
      providerId: NonNullable<MappingSummary['providerId']>;
      updatedAt: number;
    }>;
    isIgnored(provider: MappingSummary['provider'], anilistId: AniListId): boolean;
    getLinkedAniListIds<P extends MappingSummary['provider']>(
      provider: P,
      providerId: ProviderIdFor<P>,
    ): AniListId[];
  };
  anibridgeMappingStore: {
    listAllProviderPairs(): Array<
      | { provider: 'sonarr'; anilistId: AniListId; providerId: TvdbId }
      | { provider: 'radarr'; anilistId: AniListId; providerId: TmdbId }
    >;
    getSonarrCandidates(anilistId: AniListId): TvdbId[];
    getRadarrCandidates(anilistId: AniListId): TmdbId[];
    getAniListIdsForTvdb(tvdbId: TvdbId): AniListId[];
    getAniListIdsForTmdb(tmdbId: TmdbId): AniListId[];
  };
  sonarrLibrary: {
    getLeanSeriesList(): Promise<SonarrSeriesSnapshot[]>;
  };
  radarrLibrary: {
    getLeanMovieList(): Promise<RadarrMovieSnapshot[]>;
  };
  autoMappingStore: {
    list(provider?: MappingSummary['provider']): Promise<Array<AutoMappingRecord & {
      anilistId: AniListId;
      provider: MappingSummary['provider'];
    }>>;
  };
}

type ProjectedCandidate = ReturnType<typeof buildEffectiveMappingCandidate> & {
  updatedAt: number;
};

const resolveRecentEvaluationTitle = (
  recentEvaluation: AutoMappingRecord['recentEvaluation'],
): string | undefined => {
  if (!recentEvaluation) {
    return undefined;
  }

  const candidateTitle = recentEvaluation.candidates.find((candidate) => candidate.title)?.title?.trim();
  if (candidateTitle) {
    return candidateTitle;
  }

  return recentEvaluation.searchTerms?.find((term) => term.trim().length > 0)?.trim();
};

const createKey = (provider: MappingSummary['provider'], anilistId: AniListId): string => `${provider}:${anilistId}`;

const maxUpdatedAt = (...values: Array<number | undefined>): number => {
  let max = 0;
  for (const value of values) {
    if (typeof value === 'number') {
      max = Math.max(max, value);
    }
  }
  return max;
};

const setLatest = <T extends { updatedAt: number }>(map: Map<string, T>, key: string, entry: T): void => {
  const existing = map.get(key);
  if (!existing || entry.updatedAt >= existing.updatedAt) {
    map.set(key, entry);
  }
};

const resolveCandidateUpdatedAt = (input: {
  manual?: { providerId: ProviderTargetId; updatedAt: number };
  ignored?: { updatedAt: number };
  upstream?: { providerId: ProviderTargetId } | undefined;
  rejected?: { updatedAt: number } | undefined;
  resolverState?: (AutoMappingRecord & { updatedAt: number }) | undefined;
}): number => {
  if (input.manual) {
    if (input.upstream && input.upstream.providerId === input.manual.providerId) {
      return maxUpdatedAt(
        input.manual.updatedAt,
        input.resolverState?.state === 'mapped' ? input.resolverState.updatedAt : undefined,
        input.rejected?.updatedAt,
      );
    }
    return maxUpdatedAt(input.manual.updatedAt, input.rejected?.updatedAt);
  }

  if (input.ignored) {
    return maxUpdatedAt(input.ignored.updatedAt, input.rejected?.updatedAt);
  }

  if (input.upstream) {
    return maxUpdatedAt(
      input.resolverState?.state === 'mapped' ? input.resolverState.updatedAt : 0,
      input.rejected?.updatedAt,
    );
  }

  if (input.resolverState?.state === 'mapped') {
    return maxUpdatedAt(input.resolverState.updatedAt, input.rejected?.updatedAt);
  }

  if (input.rejected) {
    return input.rejected.updatedAt;
  }

  if (input.resolverState) {
    return input.resolverState.updatedAt;
  }

  return 0;
};

const resolveIsInLibrary = (input: {
  providerMappingState: MappingSummary['providerMappingState'];
  hasLibraryMatch: boolean;
  libraryLookupFailed: boolean;
}): boolean | null => {
  if (input.providerMappingState !== 'mapped') {
    return null;
  }

  if (input.hasLibraryMatch) {
    return true;
  }

  return input.libraryLookupFailed ? null : false;
};

export async function listMappings(
  input: ListMappingsInput | undefined,
  deps: ListMappingsDeps,
): Promise<{
  mappings: MappingSummary[];
  total: number;
  nextCursor: ListMappingsCursor | null;
}> {
  const { manualMappingService, anibridgeMappingStore, sonarrLibrary, radarrLibrary, autoMappingStore } = deps;
  const normalizedQuery = input?.query?.trim().toLowerCase() || '';
  const entryKinds =
    input?.entryKinds && input.entryKinds.length > 0
      ? new Set<MappingEntryKind>(input.entryKinds)
      : new Set<MappingEntryKind>(['manual', 'rejected', 'ignored', 'auto', 'upstream', 'unmapped', 'unknown']);
  const providers =
    input?.providers && input.providers.length > 0
      ? new Set<MappingSummary['provider']>(input.providers)
      : new Set<MappingSummary['provider']>(PROVIDERS);

  const defaultLimit = normalizedQuery ? 200 : 500;
  const limit = Math.min(Math.max(input?.limit ?? defaultLimit, 1), 2000);
  const cursor = input?.cursor;

  const [sonarrLibraryResult, radarrLibraryResult, resolverStates] = await Promise.all([
    sonarrLibrary.getLeanSeriesList().then(
      (items) => ({ ok: true as const, items }),
      () => ({ ok: false as const, items: [] as SonarrSeriesSnapshot[] }),
    ),
    radarrLibrary.getLeanMovieList().then(
      (items) => ({ ok: true as const, items }),
      () => ({ ok: false as const, items: [] as RadarrMovieSnapshot[] }),
    ),
    autoMappingStore.list(),
  ]);

  const libraryByTvdbId = new Map<number, SonarrSeriesSnapshot>();
  for (const series of sonarrLibraryResult.items) {
    libraryByTvdbId.set(series.tvdbId, series);
  }
  const libraryByTmdbId = new Map<number, RadarrMovieSnapshot>();
  for (const movie of radarrLibraryResult.items) {
    libraryByTmdbId.set(movie.tmdbId, movie);
  }

  const ignoreByKey = new Map<string, ReturnType<ListMappingsDeps['manualMappingService']['listIgnores']>[number]>();
  const rejectedByKey = new Map<string, ReturnType<ListMappingsDeps['manualMappingService']['listRejectedCandidates']>[number]>();
  const manualByKey = new Map<string, ReturnType<ListMappingsDeps['manualMappingService']['list']>[number]>();
  const resolverStateByKey = new Map<string, Awaited<ReturnType<ListMappingsDeps['autoMappingStore']['list']>>[number]>();
  const anibridgeByKey = new Map<string, { anilistId: AniListId; provider: MappingSummary['provider']; providerId: ProviderTargetId }>();
  const keys = new Set<string>();

  for (const ignore of manualMappingService.listIgnores()) {
    if (!providers.has(ignore.provider)) continue;
    const key = createKey(ignore.provider, ignore.anilistId);
    setLatest(ignoreByKey, key, ignore);
    keys.add(key);
  }

  for (const rejected of manualMappingService.listRejectedCandidates()) {
    if (!providers.has(rejected.provider)) continue;
    const key = createKey(rejected.provider, rejected.anilistId);
    setLatest(rejectedByKey, key, rejected);
    keys.add(key);
  }

  for (const manual of manualMappingService.list()) {
    if (!providers.has(manual.provider)) continue;
    const key = createKey(manual.provider, manual.anilistId);
    setLatest(manualByKey, key, manual);
    keys.add(key);
  }

  for (const pair of anibridgeMappingStore.listAllProviderPairs()) {
    if (providers.has(pair.provider)) {
      const key = createKey(pair.provider, pair.anilistId);
      anibridgeByKey.set(key, {
        anilistId: pair.anilistId,
        provider: pair.provider,
        providerId: pair.providerId,
      });
      keys.add(key);
    }
  }

  for (const resolverState of resolverStates) {
    if (!providers.has(resolverState.provider)) continue;
    const key = createKey(resolverState.provider, resolverState.anilistId);
    resolverStateByKey.set(key, resolverState);
    keys.add(key);
  }

  const candidates: ProjectedCandidate[] = [];
  for (const key of keys) {
    const [provider, rawAniListId] = key.split(':') as [MappingSummary['provider'], string];
    const anilistId = parseAniListIdOrNull(Number(rawAniListId));
    if (anilistId === null || !providers.has(provider)) {
      continue;
    }

    const ignored = ignoreByKey.get(key);
    const rejected = rejectedByKey.get(key);
    const manual = manualByKey.get(key);
    const anibridgeProviderIds = provider === 'sonarr'
      ? anibridgeMappingStore.getSonarrCandidates(anilistId)
      : anibridgeMappingStore.getRadarrCandidates(anilistId);
    const anibridgeProviderId = anibridgeProviderIds.length === 1 ? anibridgeProviderIds[0]! : null;
    const anibridgeMapping = anibridgeProviderId === null
      ? undefined
      : {
          anilistId,
          provider,
          providerId: anibridgeProviderId,
        };
    const resolverState = resolverStateByKey.get(key);
    const candidate = buildEffectiveMappingCandidate({
      provider,
      anilistId,
      manualProviderId: manual?.providerId ?? null,
      ignored: ignored !== undefined,
      upstreamProviderIds: anibridgeProviderIds,
      ...(rejected ? { rejectedProviderId: rejected.providerId } : {}),
      resolverState: resolverState ?? null,
    });

    candidates.push({
      ...candidate,
      updatedAt: resolveCandidateUpdatedAt({
        ...(manual ? { manual } : {}),
        ...(ignored ? { ignored } : {}),
        ...(anibridgeMapping ? { upstream: anibridgeMapping } : {}),
        ...(rejected ? { rejected } : {}),
        ...(resolverState ? { resolverState } : {}),
      }),
    });
  }

  const matchesQuery = (
    summary: MappingSummary,
    recentEvaluation: AutoMappingRecord['recentEvaluation'],
  ): boolean => {
    if (normalizedQuery === '') return true;
    const reviewHaystackParts = (summary.reviewItems ?? []).flatMap((item) => [
      item.reason,
      item.summary,
      item.current.providerId === null ? '' : String(item.current.providerId),
      item.proposed?.providerId === undefined || item.proposed.providerId === null
        ? ''
        : String(item.proposed.providerId),
      ...((item.conflicts ?? []).flatMap(conflict => [
        conflict.providerId === null ? '' : String(conflict.providerId),
      ])),
    ]);
    const haystackParts: string[] = [
      String(summary.anilistId),
      summary.providerId === null ? '' : String(summary.providerId),
      summary.suppressedProviderId == null ? '' : String(summary.suppressedProviderId),
      summary.mappingRowStatus,
      summary.mappingEntryKind,
      summary.providerMappingState,
      summary.isInLibrary === null ? 'unknown-library' : String(summary.isInLibrary),
      summary.mappingSource ?? '',
      summary.mappingReason ?? '',
      summary.mappingUnknownReason ?? '',
      summary.libraryUnknownReason ?? '',
      summary.providerMeta?.title ?? '',
      ...(summary.reviewSummary?.reasons ?? []),
      ...reviewHaystackParts,
      ...(recentEvaluation?.searchTerms ?? []),
      ...((recentEvaluation?.candidates ?? []).map((candidate) => candidate.title ?? String(candidate.providerId))),
    ];
    return haystackParts.join(' ').toLowerCase().includes(normalizedQuery);
  };

  const getLinkedAniListIds = (
    provider: MappingSummary['provider'],
    providerId: ProviderTargetId,
  ): AniListId[] => {
    const identity = parseProviderIdentity(provider, providerId);
    if (identity.provider === 'sonarr') {
      const ids = new Set<AniListId>(manualMappingService.getLinkedAniListIds(identity.provider, identity.providerId));
      for (const id of anibridgeMappingStore.getAniListIdsForTvdb(identity.providerId)) {
        ids.add(id);
      }
      return [...ids];
    } else {
      const ids = new Set<AniListId>(manualMappingService.getLinkedAniListIds(identity.provider, identity.providerId));
      for (const id of anibridgeMappingStore.getAniListIdsForTmdb(identity.providerId)) {
        ids.add(id);
      }
      return [...ids];
    }
  };

  const results: MappingSummary[] = [];
  for (const candidate of candidates) {
    const providerId = candidate.providerId ?? null;
    const tvdbId = candidate.provider === 'sonarr' ? providerId : null;
    const tmdbId = candidate.provider === 'radarr' ? providerId : null;
    const series = typeof tvdbId === 'number' ? libraryByTvdbId.get(tvdbId) ?? null : null;
    const movie = typeof tmdbId === 'number' ? libraryByTmdbId.get(tmdbId) ?? null : null;
    const linkedAniListIds = providerId === null ? [] : getLinkedAniListIds(candidate.provider, providerId);
    const libraryLookupFailed =
      providerId !== null &&
      ((candidate.provider === 'sonarr' && !sonarrLibraryResult.ok) ||
        (candidate.provider === 'radarr' && !radarrLibraryResult.ok));
    const isInLibrary = resolveIsInLibrary({
      providerMappingState: candidate.providerMappingState,
      hasLibraryMatch: Boolean(series || movie),
      libraryLookupFailed,
    });
    const libraryUnknownReason = deriveLibraryUnknownReason({
      providerMappingState: candidate.providerMappingState,
      isInLibrary,
      ...(libraryLookupFailed ? { libraryUnknownReason: 'library-check-failed' as const } : {}),
    });

    const inLibraryCount =
      series?.statistics?.episodeCount ??
      series?.statistics?.episodeFileCount ??
      (movie ? (movie.hasFile ? 1 : 0) : undefined);
    const statusLabel = series?.status ?? movie?.status;
    let providerMeta: MappingSummary['providerMeta'];
    if (candidate.mappingEntryKind === 'rejected') {
      providerMeta = undefined;
    } else if (series) {
      providerMeta = {
        ...(series.title ? { title: series.title } : {}),
        type: 'series',
        ...(statusLabel ? { statusLabel } : {}),
      };
    } else if (movie) {
      providerMeta = {
        ...(movie.title ? { title: movie.title } : {}),
        type: 'movie',
        ...(statusLabel ? { statusLabel } : {}),
      };
    } else {
      const evaluationTitle = resolveRecentEvaluationTitle(candidate.recentEvaluation);
      if (evaluationTitle) {
        providerMeta = {
          title: evaluationTitle,
          type: candidate.provider === 'sonarr' ? 'series' : 'movie',
        };
      }
    }

    const reviewProjection = projectMappingReview({
      mappingEntryKind: candidate.mappingEntryKind,
      providerId,
      ...(candidate.acceptedEvidence ? { acceptedEvidence: candidate.acceptedEvidence } : {}),
      ...(candidate.recentEvaluation ? { recentEvaluation: candidate.recentEvaluation } : {}),
      ...(candidate.resolverState ? { resolverState: candidate.resolverState } : {}),
      ...(candidate.exactUpstreamMatchProviderId === undefined
        ? {}
        : { exactUpstreamMatchProviderId: candidate.exactUpstreamMatchProviderId }),
    });
    const mappingRowStatus = deriveMappingRowStatus({
      ...(reviewProjection.reviewSummary ? { reviewSummary: reviewProjection.reviewSummary } : {}),
      ...(candidate.suppressionKind ? { suppressionKind: candidate.suppressionKind } : {}),
      providerMappingState: candidate.providerMappingState,
      isInLibrary,
    });

    const summary: MappingSummary = {
      anilistId: candidate.anilistId,
      provider: candidate.provider,
      providerId,
      providerMappingState: candidate.providerMappingState,
      isInLibrary,
      ...(candidate.suppressedProviderId === undefined ? {} : { suppressedProviderId: candidate.suppressedProviderId }),
      mappingRowStatus,
      mappingEntryKind: candidate.mappingEntryKind,
      ...(candidate.acceptedEvidence?.source ? { mappingSource: candidate.acceptedEvidence.source } : {}),
      ...(candidate.acceptedEvidence?.reason ? { mappingReason: candidate.acceptedEvidence.reason } : {}),
      ...(candidate.suppressionKind ? { suppressionKind: candidate.suppressionKind } : {}),
      ...(reviewProjection.reviewSummary ? { reviewSummary: reviewProjection.reviewSummary } : {}),
      ...(reviewProjection.reviewItems ? { reviewItems: reviewProjection.reviewItems } : {}),
      updatedAt: candidate.updatedAt,
      ...(linkedAniListIds.length > 0 ? { linkedAniListIds } : {}),
      ...(typeof inLibraryCount === 'number' ? { inLibraryCount } : {}),
      ...(providerMeta ? { providerMeta } : {}),
      ...(candidate.resolverState ? { resolverOutcome: candidate.resolverState } : {}),
      ...(candidate.mappingUnknownReason ? { mappingUnknownReason: candidate.mappingUnknownReason } : {}),
      ...(libraryUnknownReason ? { libraryUnknownReason } : {}),
      ...(candidate.hadResolveAttempt ? { hadResolveAttempt: true } : {}),
    };

    if (!entryKinds.has(summary.mappingEntryKind)) {
      continue;
    }

    if (matchesQuery(summary, candidate.recentEvaluation)) {
      results.push(summary);
    }
  }

  results.sort(
    (a, b) =>
      (b.updatedAt ?? 0) - (a.updatedAt ?? 0) ||
      a.provider.localeCompare(b.provider) ||
      a.anilistId - b.anilistId,
  );
  const total = results.length;
  const filteredByCursor =
    cursor && typeof cursor.updatedAt === 'number'
      ? results.filter(summary => {
          const ts = summary.updatedAt ?? 0;
          if (ts < cursor.updatedAt) return true;
          if (ts > cursor.updatedAt) return false;
          const providerDiff = summary.provider.localeCompare(cursor.provider);
          if (providerDiff > 0) return true;
          if (providerDiff < 0) return false;
          return summary.anilistId > cursor.anilistId;
        })
      : results;
  const page = filteredByCursor.slice(0, limit);
  const last = page.at(-1);
  const nextCursor =
    filteredByCursor.length > page.length && last
      ? {
          updatedAt: last.updatedAt ?? 0,
          anilistId: last.anilistId,
          provider: last.provider,
        }
      : null;

  return { mappings: page, total, nextCursor };
}
