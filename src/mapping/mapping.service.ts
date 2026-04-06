/** Mapping service orchestration for AniList-to-provider resolution, caching, and persistence. */
// src/mapping/mapping.service.ts

import type { AniListMediaService } from '@/anilist';
import type { AniListMedia } from '@/anilist/schemas/media.schema';
import { getExtensionOptionsSnapshot, getProviderCredentials } from '@/options';
import type { Provider, ProviderCredentials } from '@/providers';
import {
  createError,
  ErrorCode,
  logError,
  normalizeError,
  type ExtensionError,
} from '@/shared/errors';
import {
  clearExtensionMappingFailures,
  readExtensionMappingFailure,
  removeExtensionMappingFailure,
  writeExtensionMappingFailure,
} from '@/mapping/cache/extension-mapping.cache';
import { incrementCounter } from '@/debug/metrics';
import { logger } from '@/shared/utils/logger';
import { getProviderLabel, resolveProviderForAniListFormat } from '@/providers/provider-routing';
import { STORAGE_POLICIES } from '@/storage/policies';
import type { RequestPriority } from '@/shared/utils/request-priority';
import {
  EARLY_STOP_THRESHOLD,
  FAILURE_HARD_TTL,
  FAILURE_SOFT_TTL,
  MAX_SEARCH_TERMS,
  NETWORK_FAILURE_HARD_TTL,
  NETWORK_FAILURE_SOFT_TTL,
  NO_MATCH_HARD_TTL,
  NO_MATCH_SOFT_TTL,
  SCORE_THRESHOLD,
} from './constants';
import { tryHintLookup } from './hints/hint-lookup';
import { buildMediaFromMetadataHint } from './hints/media-hints';
import { resolvePrequelStatic } from './hints/prequel-static';
import { MappingOverridesService } from './overrides';
import { type ProviderLookupClient, type ProviderLookupResult } from './lookup';
import { resolveViaPipeline } from './pipeline/pipeline';
import { ResolverStateStore } from './resolver-state/resolver-state.store';
import { UpstreamMappingStore } from './upstream';
import type {
  MappingResolvedSource,
  ResolveProviderIdOptions,
  ResolvedMapping,
  ResolverStateRecord,
} from './types';

type ProviderLookupRegistry = Record<
  Provider,
  ProviderLookupClient<ProviderCredentials, ProviderLookupResult>
>;

type AniListPrioritizeApi = {
  prioritize: (ids: number | number[], options?: { schedule?: boolean }) => void;
};

type AniListCacheEvictApi = {
  removeMediaFromCache: (id: number) => Promise<void>;
};

function canPrioritizeAniListMedia(api: AniListMediaService): api is AniListMediaService & AniListPrioritizeApi {
  return typeof (api as { prioritize?: unknown }).prioritize === 'function';
}

function canEvictAniListMedia(api: AniListMediaService): api is AniListMediaService & AniListCacheEvictApi {
  return typeof (api as { removeMediaFromCache?: unknown }).removeMediaFromCache === 'function';
}

export class MappingService {
  private readonly log = logger.create('MappingService');
  private readonly inflight = new Map<string, Promise<ResolvedMapping | null>>();
  private readonly sessionSeenCanonical: Record<Provider, Set<string>> = {
    sonarr: new Set<string>(),
    radarr: new Set<string>(),
  };

  constructor(
    private readonly anilistApi: AniListMediaService,
    private readonly upstreamMappingStore: UpstreamMappingStore,
    private readonly lookupClients: ProviderLookupRegistry,
    private readonly resolverStateStore: ResolverStateStore,
    private readonly overrides?: MappingOverridesService,
    private readonly notifyMappingsChanged?: () => void,
  ) {}

  public async resetLookupState(): Promise<void> {
    await Promise.all([
      this.lookupClients.sonarr.reset(),
      this.lookupClients.radarr.reset(),
      clearExtensionMappingFailures(),
      this.resolverStateStore.clear(),
    ]);
    this.inflight.clear();
    this.sessionSeenCanonical.sonarr.clear();
    this.sessionSeenCanonical.radarr.clear();
    this.notifyMappingsChanged?.();
  }

  public initStaticPairs(): Promise<void> {
    return this.upstreamMappingStore.init();
  }

  public prioritizeAniListMedia(anilistId: number, options?: { schedule?: boolean }): void {
    try {
      if (canPrioritizeAniListMedia(this.anilistApi)) {
        this.anilistApi.prioritize(anilistId, { schedule: options?.schedule === true });
      }
    } catch {
      // best-effort; ignore failures
    }
  }

  public async resolveProviderId(
    provider: Provider,
    anilistId: number,
    options: ResolveProviderIdOptions = {},
  ): Promise<ResolvedMapping | null> {
    if (import.meta.env.DEV) {
      this.log.debug?.(
        `mapping:start provider=${provider} anilistId=${anilistId} priority=${options.priority ?? 'normal'} network=${options.network ?? 'allow'} ignoreFailureCache=${String(options.ignoreFailureCache === true)}`,
      );
    }

    const bypassFailureCache = options.ignoreFailureCache === true;
    const inflightKey = this.inflightKey(provider, anilistId);
    const existing = this.inflight.get(inflightKey);
    if (existing) {
      if (options.priority === 'high') {
        this.prioritizeAniListMedia(anilistId, { schedule: false });
      }
      return existing;
    }

    const promise = this.resolveProviderIdInternal(provider, anilistId, options, bypassFailureCache);
    this.inflight.set(inflightKey, promise);

    promise.finally(() => {
      const current = this.inflight.get(inflightKey);
      if (current === promise) {
        this.inflight.delete(inflightKey);
      }
    });

    return promise;
  }

  public async resolveTvdbId(
    anilistId: number,
    options: ResolveProviderIdOptions = {},
  ): Promise<{ tvdbId: number; successfulSynonym?: string } | null> {
    const mapping = await this.resolveProviderId('sonarr', anilistId, options);
    if (!mapping) {
      return null;
    }
    return {
      tvdbId: mapping.providerId,
      ...(mapping.successfulSynonym ? { successfulSynonym: mapping.successfulSynonym } : {}),
    };
  }

  private async resolveProviderIdInternal(
    provider: Provider,
    anilistId: number,
    options: ResolveProviderIdOptions,
    bypassFailureCache: boolean,
  ): Promise<ResolvedMapping | null> {
    if (this.overrides?.isIgnored(provider, anilistId)) {
      await this.clearResolverState(provider, anilistId);
      if (import.meta.env.DEV) {
        this.log.debug?.(`mapping:ignored provider=${provider} anilistId=${anilistId}`);
      }
      return null;
    }

    const overrideProviderId = this.overrides?.get(provider, anilistId) ?? null;
    if (overrideProviderId !== null) {
      await this.clearResolverState(provider, anilistId);
      const staticProviderId = this.getUpstreamStaticProviderId(provider, anilistId);
      if (staticProviderId !== null && staticProviderId === overrideProviderId) {
        try {
          await this.overrides?.clear(provider, anilistId);
        } catch (error) {
          logError(normalizeError(error), `MappingService:clearOverride:${provider}:${anilistId}`);
        }

        return this.acceptResolved(provider, anilistId, { providerId: staticProviderId }, 'upstream');
      }

      if (import.meta.env.DEV) {
        this.log.debug?.(
          `mapping:override-hit provider=${provider} anilistId=${anilistId} providerId=${overrideProviderId}`,
        );
      }
      return { providerId: overrideProviderId };
    }

    const staticProviderId = this.getUpstreamStaticProviderId(provider, anilistId);
    if (staticProviderId !== null) {
      incrementCounter('mapping.lookup.static_hit');
      return this.acceptResolved(provider, anilistId, { providerId: staticProviderId }, 'upstream');
    }

    const resolverState = await this.resolverStateStore.get(provider, anilistId);
    if (resolverState?.state === 'mapped') {
      if (import.meta.env.DEV) {
        this.log.debug?.(
          `mapping:resolver-state-hit provider=${provider} anilistId=${anilistId} providerId=${resolverState.providerId} source=${resolverState.source}`,
        );
      }
      if (this.isCandidateSuppressed(provider, anilistId, resolverState.providerId)) {
        return null;
      }
      return {
        providerId: resolverState.providerId,
        ...(resolverState.successfulSynonym ? { successfulSynonym: resolverState.successfulSynonym } : {}),
      };
    }

    if (!bypassFailureCache) {
      const cachedFailure = await readExtensionMappingFailure(provider, anilistId);
      if (cachedFailure) {
        if (import.meta.env.DEV) {
          this.log.debug?.(
            `mapping:failure-cache-hit provider=${provider} anilistId=${anilistId} code=${cachedFailure.value.code}`,
          );
        }
        throw cachedFailure.value;
      }
      if (resolverState) {
        if (import.meta.env.DEV) {
          this.log.debug?.(
            `mapping:resolver-state-terminal provider=${provider} anilistId=${anilistId} state=${resolverState.state}`,
          );
        }
        return null;
      }
    }

    if (options.network === 'never') {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        `AniList ID ${anilistId} requires a network lookup but network access is disabled.`,
        `Unable to resolve this title without contacting ${getProviderLabel(provider)}.`,
        { reason: 'network-disabled', provider },
      );
    }

    const hintTerm = options.hints?.primaryTitle?.trim();
    if (hintTerm) {
      try {
        const credentials = await this.getConfiguredCredentials(provider);
        const hinted = await tryHintLookup(
          hintTerm,
          this.lookupClients[provider],
          credentials,
          this.log,
          options.forceLookupNetwork === true,
        );
        if (hinted) {
          return this.acceptResolved(provider, anilistId, hinted, 'auto');
        }
      } catch (error) {
        logError(normalizeError(error), `MappingService:hintLookup:${provider}:${anilistId}`);
      }
    }

    return this.attemptNetworkResolution(provider, anilistId, options, bypassFailureCache);
  }

  private async acceptResolved(
    provider: Provider,
    anilistId: number,
    resolved: ResolvedMapping,
    source: MappingResolvedSource,
  ): Promise<ResolvedMapping | null> {
    const mappedState: Omit<Extract<ResolverStateRecord, { state: 'mapped' }>, 'updatedAt'> = {
      state: 'mapped',
      providerId: resolved.providerId,
      source,
      ...(resolved.successfulSynonym ? { successfulSynonym: resolved.successfulSynonym } : {}),
    };

    try {
      await Promise.all([
        this.resolverStateStore.set(
          provider,
          anilistId,
          mappedState,
          STORAGE_POLICIES.extensionMapping,
        ),
        removeExtensionMappingFailure(provider, anilistId),
      ]);
    } catch (error) {
      const normalized = normalizeError(error);
      this.log.error?.(
        `mapping:persist-resolved-failed provider=${provider} anilistId=${anilistId}`,
        normalized,
      );
      return null;
    }
    if (this.isCandidateSuppressed(provider, anilistId, resolved.providerId)) {
      return null;
    }
    this.notifyMappingsChanged?.();
    return resolved;
  }

  private async cacheFailure(
    provider: Provider,
    anilistId: number,
    error: ExtensionError,
  ): Promise<void> {
    const ttl = this.failureTtlsFor(error);
    await writeExtensionMappingFailure(provider, anilistId, error, {
      staleMs: ttl.stale,
      hardMs: ttl.hard,
    });
  }

  private async attemptNetworkResolution(
    provider: Provider,
    anilistId: number,
    options: ResolveProviderIdOptions,
    bypassFailureCache: boolean,
  ): Promise<ResolvedMapping | null> {
    let resolved: ResolvedMapping | null;
    try {
      if (import.meta.env.DEV) {
        this.log.debug?.(
          `mapping:network-start provider=${provider} anilistId=${anilistId} priority=${options.priority ?? 'normal'}`,
        );
      }
      resolved = await this.resolveViaNetwork(
        provider,
        anilistId,
        options.hints,
        options.priority,
        options.forceLookupNetwork === true,
      );
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.code === ErrorCode.VALIDATION_ERROR) {
        await this.recordResolverState(
          provider,
          anilistId,
          {
            state: 'unresolved',
            ...(this.resolveUnresolvedTitle(options.hints)
              ? { title: this.resolveUnresolvedTitle(options.hints) }
              : {}),
          },
          {
            staleMs: NO_MATCH_SOFT_TTL,
            hardMs: NO_MATCH_HARD_TTL,
          },
        );
        await removeExtensionMappingFailure(provider, anilistId);
        return null;
      }

      if (!bypassFailureCache && this.shouldCacheFailure(normalized)) {
        await this.cacheFailure(provider, anilistId, normalized);
      }
      throw normalized;
    }

    if (resolved === null) {
      await this.recordResolverState(
        provider,
        anilistId,
        {
          state: 'unresolved',
          ...(this.resolveUnresolvedTitle(options.hints)
            ? { title: this.resolveUnresolvedTitle(options.hints) }
            : {}),
        },
        {
          staleMs: NO_MATCH_SOFT_TTL,
          hardMs: NO_MATCH_HARD_TTL,
        },
      );
      await removeExtensionMappingFailure(provider, anilistId);
      return null;
    }

    if (import.meta.env.DEV) {
      this.log.debug?.(
        `mapping:network-success provider=${provider} anilistId=${anilistId} providerId=${resolved.providerId}${resolved.successfulSynonym ? ` synonym="${resolved.successfulSynonym}"` : ''}`,
      );
    }
    return this.acceptResolved(provider, anilistId, resolved, 'auto');
  }

  private evictAniListMedia(anilistId: number): void {
    try {
      if (canEvictAniListMedia(this.anilistApi)) {
        void this.anilistApi.removeMediaFromCache(anilistId).catch(() => {});
      }
    } catch {
      // best-effort eviction; ignore failures
    }
  }

  private async resolveViaNetwork(
    provider: Provider,
    anilistId: number,
    hints: ResolveProviderIdOptions['hints'] | undefined,
    priority: RequestPriority | undefined,
    forceLookupNetwork: boolean,
  ): Promise<ResolvedMapping | null> {
    const credentials = await this.getConfiguredCredentials(provider);

    const metadataMedia = buildMediaFromMetadataHint(anilistId, hints?.domMedia);
    if (metadataMedia) {
      const resolved = await this.tryResolveWithMedia(
        provider,
        metadataMedia,
        credentials,
        hints,
        priority,
        forceLookupNetwork,
      );
      if (resolved) {
        return resolved;
      }
    }

    const apiMedia = await this.anilistApi.fetchMediaWithRelations(
      anilistId,
      priority === undefined
        ? { source: 'mapping-resolve' }
        : { priority, source: 'mapping-resolve' },
    );
    const apiResolved = await this.tryResolveWithMedia(
      provider,
      apiMedia,
      credentials,
      hints,
      priority,
      forceLookupNetwork,
    );
    if (apiResolved) {
      return apiResolved;
    }

    this.log.debug(`resolveViaNetwork: provider=${provider} no match found for AniList ID ${anilistId}`);
    return null;
  }

  private async tryResolveWithMedia(
    provider: Provider,
    media: AniListMedia,
    credentials: ProviderCredentials,
    hints: ResolveProviderIdOptions['hints'] | undefined,
    priority: RequestPriority | undefined,
    forceLookupNetwork: boolean,
  ): Promise<ResolvedMapping | null> {
    const routedProvider = resolveProviderForAniListFormat(media.format);
    if (routedProvider !== provider) {
      this.log.debug(
        `tryResolveWithMedia: provider mismatch for AniList ID ${media.id} format='${String(media.format)}' expected=${provider} actual=${String(routedProvider)}`,
      );
      return null;
    }

    if (provider === 'sonarr') {
      const prequelStatic = await resolvePrequelStatic(media, this.upstreamMappingStore, this.anilistApi);
      if (prequelStatic) {
        return prequelStatic;
      }
    }

    const lookupClient = this.lookupClients[provider];
    const outcome = await resolveViaPipeline(
      media,
      {
        anilistApi: this.anilistApi,
        lookupClient,
        upstreamMappingStore: this.upstreamMappingStore,
        credentials,
        ...(priority === undefined ? {} : { priority }),
        ...(forceLookupNetwork ? { forceLookupNetwork: true } : {}),
        sessionSeenCanonical: this.sessionSeenCanonical[provider],
        limits: {
          maxTerms: MAX_SEARCH_TERMS,
          scoreThreshold: SCORE_THRESHOLD,
          earlyStopThreshold: EARLY_STOP_THRESHOLD,
        },
        log: this.log,
      },
      hints?.primaryTitle,
    );

    if (outcome.status === 'resolved') {
      return {
        providerId: outcome.providerId,
        ...(outcome.successfulSynonym ? { successfulSynonym: outcome.successfulSynonym } : {}),
      };
    }
    return null;
  }

  private inflightKey(provider: Provider, anilistId: number): string {
    return `${provider}:${anilistId}`;
  }

  public async evictResolved(anilistId: number, provider: Provider = 'sonarr'): Promise<void> {
    await Promise.all([
      this.resolverStateStore.delete(provider, anilistId),
      removeExtensionMappingFailure(provider, anilistId),
    ]);
    this.inflight.delete(this.inflightKey(provider, anilistId));
    this.evictAniListMedia(anilistId);
    this.notifyMappingsChanged?.();
  }

  private async recordResolverState(
    provider: Provider,
    anilistId: number,
    state: Omit<ResolverStateRecord, 'updatedAt'>,
    ttl: { staleMs: number; hardMs: number },
  ): Promise<void> {
    const changed = await this.resolverStateStore.set(provider, anilistId, state, ttl);
    if (changed) {
      this.notifyMappingsChanged?.();
    }
  }

  private async clearResolverState(provider: Provider, anilistId: number): Promise<void> {
    if (await this.resolverStateStore.delete(provider, anilistId)) {
      this.notifyMappingsChanged?.();
    }
  }

  private isCandidateSuppressed(
    provider: Provider,
    anilistId: number,
    providerId: number,
  ): boolean {
    return this.overrides?.getCandidateSuppression(provider, anilistId, providerId) != null;
  }

  private resolveUnresolvedTitle(hints?: ResolveProviderIdOptions['hints']): string | undefined {
    const directTitle = hints?.primaryTitle?.trim();
    if (directTitle) {
      return directTitle;
    }
    const titles = hints?.domMedia?.titles;
    const metadataTitle = [titles?.english, titles?.romaji, titles?.native]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
      ?.trim();
    return metadataTitle || undefined;
  }

  private shouldCacheFailure(error: ExtensionError): boolean {
    return (
      error.code === ErrorCode.CONFIGURATION_ERROR ||
      error.code === ErrorCode.NETWORK_ERROR ||
      error.code === ErrorCode.API_ERROR ||
      error.code === ErrorCode.PERMISSION_ERROR ||
      error.code === ErrorCode.SONARR_NOT_CONFIGURED
    );
  }

  private failureTtlsFor(error: ExtensionError): { stale: number; hard: number } {
    if (error.code === ErrorCode.NETWORK_ERROR || error.code === ErrorCode.API_ERROR) {
      return { stale: NETWORK_FAILURE_SOFT_TTL, hard: NETWORK_FAILURE_HARD_TTL };
    }
    return { stale: FAILURE_SOFT_TTL, hard: FAILURE_HARD_TTL };
  }

  private async getConfiguredCredentials(provider: Provider): Promise<ProviderCredentials> {
    const options = await getExtensionOptionsSnapshot();
    const credentials = getProviderCredentials(options, provider);
    if (!credentials) {
      if (provider === 'sonarr') {
        throw createError(
          ErrorCode.SONARR_NOT_CONFIGURED,
          'Sonarr credentials are not configured.',
          'Configure your Sonarr connection in ani2arr options.',
        );
      }
      throw createError(
        ErrorCode.CONFIGURATION_ERROR,
        'Radarr credentials are not configured.',
        'Configure your Radarr connection in ani2arr options.',
      );
    }
    return credentials;
  }

  private getUpstreamStaticProviderId(
    provider: Provider,
    anilistId: number,
  ): number | null {
    if (provider !== 'sonarr') {
      return null;
    }
    const hit = this.upstreamMappingStore.get(anilistId);
    if (!hit) {
      return null;
    }
    return hit.tvdbId;
  }
}



export {type UpstreamMappingPayload} from './upstream';
export {type ResolvedMapping} from './types';
