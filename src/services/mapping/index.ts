import type { TtlCache } from '@/cache';
import type { AnilistApiService } from '@/clients/anilist.api';
import type {
  AniMedia,
  ExtensionError,
  MappingExternalId,
  MappingProvider,
  RequestPriority,
} from '@/shared/types';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/errors/error-utils';
import { getExtensionOptionsSnapshot } from '@/shared/options/storage';
import { incrementCounter } from '@/shared/utils/metrics';
import { logger } from '@/shared/utils/logger';
import { getProviderLabel, resolveProviderForAniListFormat } from '@/services/providers/resolver';
import {
  EARLY_STOP_THRESHOLD,
  FAILURE_HARD_TTL,
  FAILURE_SOFT_TTL,
  MAX_SEARCH_TERMS,
  NETWORK_FAILURE_HARD_TTL,
  NETWORK_FAILURE_SOFT_TTL,
  NO_MATCH_HARD_TTL,
  NO_MATCH_SOFT_TTL,
  RESOLVED_PERSIST_MS,
  ResolvedLedger,
  SCORE_THRESHOLD,
  UnresolvedLedger,
} from './cache';
import { tryHintLookup } from './hints/hint-lookup';
import { buildMediaFromMetadataHint } from './hints/media-hints';
import { resolvePrequelStatic } from './hints/prequel-static';
import { MappingOverridesService } from './overrides.service';
import {
  type LookupClientCredentials,
  type ProviderLookupClient,
  type ProviderLookupResult,
} from './provider-lookup.client';
import { resolveViaPipeline } from './pipeline/pipeline';
import { StaticMappingProvider, type StaticMappingPayload } from './static-mapping.provider';
import type { ResolveExternalIdOptions, ResolveHints, ResolveTvdbIdOptions, ResolvedMapping } from './types';

type ProviderCaches = {
  success: TtlCache<ResolvedMapping>;
  failure: TtlCache<ExtensionError>;
};

type ProviderLookupRegistry = Record<
  MappingProvider,
  ProviderLookupClient<LookupClientCredentials, ProviderLookupResult>
>;

export class MappingService {
  private readonly log = logger.create('MappingService');
  private readonly inflight = new Map<string, Promise<ResolvedMapping | null>>();
  private readonly sessionSeenCanonical: Record<MappingProvider, Set<string>> = {
    sonarr: new Set<string>(),
    radarr: new Set<string>(),
  };
  private readonly ledger = new ResolvedLedger();
  private readonly unresolvedLedger = new UnresolvedLedger();

  constructor(
    private readonly anilistApi: AnilistApiService,
    private readonly staticProvider: StaticMappingProvider,
    private readonly lookupClients: ProviderLookupRegistry,
    private readonly caches: Record<MappingProvider, ProviderCaches>,
    private readonly overrides?: MappingOverridesService,
    private readonly notifyMappingsChanged?: () => void,
  ) {}

  public async resetLookupState(): Promise<void> {
    await Promise.all([
      this.lookupClients.sonarr.reset(),
      this.lookupClients.radarr.reset(),
      this.caches.sonarr.failure.clear(),
      this.caches.radarr.failure.clear(),
    ]);
    this.inflight.clear();
    this.sessionSeenCanonical.sonarr.clear();
    this.sessionSeenCanonical.radarr.clear();
    if (this.unresolvedLedger.clear()) {
      this.notifyMappingsChanged?.();
    }
  }

  public initStaticPairs(): Promise<void> {
    return this.staticProvider.init();
  }

  public prioritizeAniListMedia(anilistId: number, options?: { schedule?: boolean }): void {
    try {
      const anyApi = this.anilistApi as unknown as {
        prioritize?: (ids: number | number[], options?: { schedule?: boolean }) => void;
      };
      if (anyApi && typeof anyApi.prioritize === 'function') {
        anyApi.prioritize(anilistId, { schedule: options?.schedule === true });
      }
    } catch {
      // best-effort; ignore failures
    }
  }

  public async resolveExternalId(
    provider: MappingProvider,
    anilistId: number,
    options: ResolveExternalIdOptions = {},
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

    const promise = this.resolveExternalIdInternal(provider, anilistId, options, bypassFailureCache);
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
    options: ResolveTvdbIdOptions = {},
  ): Promise<{ tvdbId: number; successfulSynonym?: string } | null> {
    const mapping = await this.resolveExternalId('sonarr', anilistId, options);
    if (!mapping || mapping.externalId.kind !== 'tvdb') {
      return null;
    }
    return {
      tvdbId: mapping.externalId.id,
      ...(mapping.successfulSynonym ? { successfulSynonym: mapping.successfulSynonym } : {}),
    };
  }

  private async resolveExternalIdInternal(
    provider: MappingProvider,
    anilistId: number,
    options: ResolveExternalIdOptions,
    bypassFailureCache: boolean,
  ): Promise<ResolvedMapping | null> {
    if (this.overrides?.isIgnored(provider, anilistId)) {
      this.clearUnresolvedMapping(provider, anilistId);
      if (import.meta.env.DEV) {
        this.log.debug?.(`mapping:ignored provider=${provider} anilistId=${anilistId}`);
      }
      return null;
    }

    const providerCaches = this.caches[provider];
    const providerLabel = getProviderLabel(provider);
    const expectedExternalIdKind = this.lookupClients[provider].externalIdKind;
    const cacheKey = this.successCacheKey(provider, anilistId);
    const overrideExternalId = this.overrides?.get(provider, anilistId) ?? null;
    if (overrideExternalId) {
      this.clearUnresolvedMapping(provider, anilistId);
      const staticHit = this.getUpstreamStaticExternalId(provider, anilistId);
      if (staticHit && staticHit.id === overrideExternalId.id && staticHit.kind === overrideExternalId.kind) {
        try {
          await this.overrides?.clear(provider, anilistId);
        } catch (error) {
          logError(normalizeError(error), `MappingService:clearOverride:${provider}:${anilistId}`);
        }

        const resolved: ResolvedMapping = { externalId: staticHit };
        this.recordResolvedMapping(provider, anilistId, resolved, 'upstream');
        await providerCaches.success.write(cacheKey, resolved, {
          staleMs: RESOLVED_PERSIST_MS,
          hardMs: RESOLVED_PERSIST_MS,
        });
        return resolved;
      }

      if (import.meta.env.DEV) {
        this.log.debug?.(
          `mapping:override-hit provider=${provider} anilistId=${anilistId} ${overrideExternalId.kind}Id=${overrideExternalId.id}`,
        );
      }
      return { externalId: overrideExternalId };
    }

    const cachedSuccess = await providerCaches.success.read(cacheKey);
    if (cachedSuccess) {
      if (import.meta.env.DEV) {
        this.log.debug?.(
          `mapping:success-cache-hit provider=${provider} anilistId=${anilistId} ${cachedSuccess.value.externalId.kind}Id=${cachedSuccess.value.externalId.id}`,
        );
      }
      this.clearUnresolvedMapping(provider, anilistId);
      this.recordResolvedMapping(provider, anilistId, cachedSuccess.value, 'auto');
      return cachedSuccess.value;
    }

    if (!bypassFailureCache) {
      const cachedFailure = await providerCaches.failure.read(this.failureCacheKey(provider, anilistId));
      if (cachedFailure) {
        if (import.meta.env.DEV) {
          this.log.debug?.(
            `mapping:failure-cache-hit provider=${provider} anilistId=${anilistId} code=${cachedFailure.value.code}`,
          );
        }
        throw cachedFailure.value;
      }
    }

    const staticHit = this.getUpstreamStaticExternalId(provider, anilistId);
    if (staticHit) {
      incrementCounter('mapping.lookup.static_hit');
      const resolved: ResolvedMapping = { externalId: staticHit };
      await providerCaches.success.write(cacheKey, resolved, {
        staleMs: RESOLVED_PERSIST_MS,
        hardMs: RESOLVED_PERSIST_MS,
      });
      await providerCaches.failure.remove(this.failureCacheKey(provider, anilistId));
      this.clearUnresolvedMapping(provider, anilistId);
      this.recordResolvedMapping(provider, anilistId, resolved, 'upstream');
      return resolved;
    }

    if (options.network === 'never') {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        `AniList ID ${anilistId} requires a network lookup but network access is disabled.`,
        `Unable to resolve this title without contacting ${providerLabel}.`,
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
          await providerCaches.success.write(cacheKey, hinted, {
            staleMs: RESOLVED_PERSIST_MS,
            hardMs: RESOLVED_PERSIST_MS,
          });
          await providerCaches.failure.remove(this.failureCacheKey(provider, anilistId));
          this.clearUnresolvedMapping(provider, anilistId);
          this.recordResolvedMapping(provider, anilistId, hinted, 'auto');
          return hinted;
        }
      } catch (error) {
        logError(normalizeError(error), `MappingService:hintLookup:${provider}:${anilistId}`);
      }
    }

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
        if (!bypassFailureCache) {
          const ttl = this.failureTtlsFor(normalized);
          await providerCaches.failure.write(this.failureCacheKey(provider, anilistId), normalized, {
            staleMs: ttl.stale,
            hardMs: ttl.hard,
          });
        }
        return null;
      }

      if (!bypassFailureCache && this.shouldCacheFailure(normalized)) {
        const ttl = this.failureTtlsFor(normalized);
        await providerCaches.failure.write(this.failureCacheKey(provider, anilistId), normalized, {
          staleMs: ttl.stale,
          hardMs: ttl.hard,
        });
      }
      throw normalized;
    }

    if (resolved === null) {
      if (!bypassFailureCache) {
        const noMatchError = createError(
          ErrorCode.VALIDATION_ERROR,
          `No ${expectedExternalIdKind.toUpperCase()} match found for AniList ID ${anilistId}.`,
          `No matching ${expectedExternalIdKind.toUpperCase()} entry was found.`,
          { reason: 'no-match', provider },
        );
        const ttl = this.failureTtlsFor(noMatchError);
        await providerCaches.failure.write(this.failureCacheKey(provider, anilistId), noMatchError, {
          staleMs: ttl.stale,
          hardMs: ttl.hard,
        });
      }
      this.recordUnresolvedMapping(provider, anilistId, options.hints);
      return null;
    }

    this.clearUnresolvedMapping(provider, anilistId);
    this.recordResolvedMapping(provider, anilistId, resolved, 'auto');
    await providerCaches.success.write(cacheKey, resolved, {
      staleMs: RESOLVED_PERSIST_MS,
      hardMs: RESOLVED_PERSIST_MS,
    });
    await providerCaches.failure.remove(this.failureCacheKey(provider, anilistId));
    if (import.meta.env.DEV) {
      this.log.debug?.(
        `mapping:network-success provider=${provider} anilistId=${anilistId} ${resolved.externalId.kind}Id=${resolved.externalId.id}${resolved.successfulSynonym ? ` synonym="${resolved.successfulSynonym}"` : ''}`,
      );
    }
    return resolved;
  }

  private evictAniListMedia(anilistId: number): void {
    try {
      const anyApi = this.anilistApi as unknown as { removeMediaFromCache?: (id: number) => Promise<void> };
      if (anyApi && typeof anyApi.removeMediaFromCache === 'function') {
        void anyApi.removeMediaFromCache(anilistId).catch(() => {});
      }
    } catch {
      // best-effort eviction; ignore failures
    }
  }

  private async resolveViaNetwork(
    provider: MappingProvider,
    anilistId: number,
    hints: ResolveHints | undefined,
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
    provider: MappingProvider,
    media: AniMedia,
    credentials: LookupClientCredentials,
    hints: ResolveHints | undefined,
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
      const prequelStatic = await resolvePrequelStatic(media, this.staticProvider, this.anilistApi);
      if (prequelStatic) {
        this.recordResolvedMapping(provider, media.id, prequelStatic, 'upstream');
        return prequelStatic;
      }
    }

    const lookupClient = this.lookupClients[provider];
    const outcome = await resolveViaPipeline(
      media,
      {
        anilistApi: this.anilistApi,
        lookupClient,
        staticProvider: this.staticProvider,
        credentials,
        ...(typeof priority !== 'undefined' ? { priority } : {}),
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
        externalId: { id: outcome.externalId, kind: lookupClient.externalIdKind },
        ...(outcome.successfulSynonym ? { successfulSynonym: outcome.successfulSynonym } : {}),
      };
    }
    return null;
  }

  private successCacheKey(provider: MappingProvider, anilistId: number): string {
    return `resolved:${provider}:${anilistId}`;
  }

  private failureCacheKey(provider: MappingProvider, anilistId: number): string {
    return `resolved-failure:${provider}:${anilistId}`;
  }

  private inflightKey(provider: MappingProvider, anilistId: number): string {
    return `${provider}:${anilistId}`;
  }

  public async evictResolved(anilistId: number, provider: MappingProvider = 'sonarr'): Promise<void> {
    await Promise.all([
      this.caches[provider].success.remove(this.successCacheKey(provider, anilistId)),
      this.caches[provider].failure.remove(this.failureCacheKey(provider, anilistId)),
    ]);
    this.inflight.delete(this.inflightKey(provider, anilistId));
    this.evictAniListMedia(anilistId);
    this.ledger.delete(provider, anilistId);
    this.clearUnresolvedMapping(provider, anilistId);
  }

  public isOverrideActive(anilistId: number, provider: MappingProvider = 'sonarr'): boolean {
    return this.overrides?.has(provider, anilistId) ?? false;
  }

  public isIgnored(anilistId: number, provider: MappingProvider = 'sonarr'): boolean {
    return this.overrides?.isIgnored(provider, anilistId) ?? false;
  }

  public getRecordedResolvedMappings(
    provider?: MappingProvider,
  ): Array<{ anilistId: number; provider: MappingProvider; externalId: MappingExternalId; source: 'auto' | 'upstream'; updatedAt: number }> {
    return this.ledger
      .list()
      .filter(entry => (provider ? entry.provider === provider : true))
      .map(entry => ({
        anilistId: entry.anilistId,
        provider: entry.provider,
        externalId: entry.externalId,
        source: entry.source,
        updatedAt: entry.updatedAt,
      }));
  }

  public getRecordedUnresolvedMappings(
    provider?: MappingProvider,
  ): Array<{ anilistId: number; provider: MappingProvider; source: 'unresolved'; updatedAt: number; title?: string }> {
    return this.unresolvedLedger
      .list()
      .filter(entry => (provider ? entry.provider === provider : true))
      .map(entry => ({
        anilistId: entry.anilistId,
        provider: entry.provider,
        source: entry.source,
        updatedAt: entry.updatedAt,
        ...(entry.title ? { title: entry.title } : {}),
      }));
  }

  public getLinkedAniListIds(provider: MappingProvider, externalId: MappingExternalId): number[] {
    const ids = new Set<number>();
    if (this.overrides) {
      for (const id of this.overrides.getLinkedAniListIds(provider, externalId)) {
        ids.add(id);
      }
    }
    if (provider === 'sonarr' && externalId.kind === 'tvdb') {
      for (const id of this.staticProvider.getAniListIdsForTvdb(externalId.id)) {
        ids.add(id);
      }
    }
    return Array.from(ids);
  }

  public getLinkedAniListIdsForTvdb(tvdbId: number): number[] {
    return this.getLinkedAniListIds('sonarr', { id: tvdbId, kind: 'tvdb' });
  }

  private recordResolvedMapping(
    provider: MappingProvider,
    anilistId: number,
    mapping: ResolvedMapping,
    source: 'auto' | 'upstream',
  ): void {
    this.ledger.record(provider, anilistId, mapping, source);
  }

  private recordUnresolvedMapping(provider: MappingProvider, anilistId: number, hints?: ResolveHints): void {
    const changed = this.unresolvedLedger.record(provider, anilistId, this.resolveUnresolvedTitle(hints));
    if (changed) {
      this.notifyMappingsChanged?.();
    }
  }

  private clearUnresolvedMapping(provider: MappingProvider, anilistId: number): void {
    if (this.unresolvedLedger.delete(provider, anilistId)) {
      this.notifyMappingsChanged?.();
    }
  }

  private resolveUnresolvedTitle(hints?: ResolveHints): string | undefined {
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
      error.code === ErrorCode.VALIDATION_ERROR ||
      error.code === ErrorCode.CONFIGURATION_ERROR ||
      error.code === ErrorCode.NETWORK_ERROR ||
      error.code === ErrorCode.API_ERROR ||
      error.code === ErrorCode.PERMISSION_ERROR
    );
  }

  private failureTtlsFor(error: ExtensionError): { stale: number; hard: number } {
    if (error.code === ErrorCode.VALIDATION_ERROR) {
      return { stale: NO_MATCH_SOFT_TTL, hard: NO_MATCH_HARD_TTL };
    }
    if (error.code === ErrorCode.NETWORK_ERROR || error.code === ErrorCode.API_ERROR) {
      return { stale: NETWORK_FAILURE_SOFT_TTL, hard: NETWORK_FAILURE_HARD_TTL };
    }
    return { stale: FAILURE_SOFT_TTL, hard: FAILURE_HARD_TTL };
  }

  private async getConfiguredCredentials(provider: MappingProvider): Promise<LookupClientCredentials> {
    const options = await getExtensionOptionsSnapshot();
    const config = options?.providers?.[provider];
    if (!config?.url || !config?.apiKey) {
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
    return { url: config.url, apiKey: config.apiKey };
  }

  private getUpstreamStaticExternalId(
    provider: MappingProvider,
    anilistId: number,
  ): MappingExternalId | null {
    if (provider !== 'sonarr') {
      return null;
    }
    const hit = this.staticProvider.get(anilistId);
    if (!hit) {
      return null;
    }
    return { id: hit.tvdbId, kind: 'tvdb' };
  }
}

export type { StaticMappingPayload, ResolvedMapping };
