/** Mapping service orchestration for AniList-to-provider resolution, caching, and persistence. */
// src/services/mapping/index.ts

import type { AniListMediaService } from '@/core/anilist';
import type { AniListMedia } from '@/shared/schemas/anilist/anilist-media.schema';
import { getExtensionOptionsSnapshot } from '@/options';
import type { Provider, ProviderCredentials } from '@/providers';
import type { MappingExternalId } from './types';
import {
  createError,
  ErrorCode,
  logError,
  normalizeError,
  type ExtensionError,
} from '@/shared/errors';
import {
  clearExtensionMappingFailures,
  clearExtensionMappings,
  readExtensionMapping,
  readExtensionMappingFailure,
  removeExtensionMapping,
  removeExtensionMappingFailure,
  writeExtensionMapping,
  writeExtensionMappingFailure,
} from '@/storage';
import { incrementCounter } from '@/debug/metrics';
import { logger } from '@/shared/utils/logger';
import { getProviderLabel, resolveProviderForAniListFormat } from '@/providers/provider-routing';
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
  ResolvedLedger,
  SCORE_THRESHOLD,
  UnresolvedLedger,
} from './cache';
import { tryHintLookup } from './hints/hint-lookup';
import { buildMediaFromMetadataHint } from './hints/media-hints';
import { resolvePrequelStatic } from './hints/prequel-static';
import { MappingOverridesService } from './overrides';
import { type ProviderLookupClient, type ProviderLookupResult } from './lookup';
import { resolveViaPipeline } from './pipeline/pipeline';
import { UpstreamMappingStore,  } from './upstream';
import type { ResolveExternalIdOptions, ResolvedMapping } from './types';

type ProviderLookupRegistry = Record<
  Provider,
  ProviderLookupClient<ProviderCredentials, ProviderLookupResult>
>;

export class MappingService {
  private readonly log = logger.create('MappingService');
  private readonly inflight = new Map<string, Promise<ResolvedMapping | null>>();
  private readonly sessionSeenCanonical: Record<Provider, Set<string>> = {
    sonarr: new Set<string>(),
    radarr: new Set<string>(),
  };
  private readonly ledger = new ResolvedLedger();
  private readonly unresolvedLedger = new UnresolvedLedger();

  constructor(
    private readonly anilistApi: AniListMediaService,
    private readonly upstreamMappingStore: UpstreamMappingStore,
    private readonly lookupClients: ProviderLookupRegistry,
    private readonly overrides?: MappingOverridesService,
    private readonly notifyMappingsChanged?: () => void,
  ) {}

  public async resetLookupState(): Promise<void> {
    await Promise.all([
      this.lookupClients.sonarr.reset(),
      this.lookupClients.radarr.reset(),
      clearExtensionMappings(),
      clearExtensionMappingFailures(),
    ]);
    this.inflight.clear();
    this.ledger.clear();
    this.sessionSeenCanonical.sonarr.clear();
    this.sessionSeenCanonical.radarr.clear();
    if (this.unresolvedLedger.clear()) {
      this.notifyMappingsChanged?.();
    }
  }

  public initStaticPairs(): Promise<void> {
    return this.upstreamMappingStore.init();
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
    provider: Provider,
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
    options: ResolveExternalIdOptions = {},
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
    provider: Provider,
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
        try {
          await Promise.all([
            writeExtensionMapping(provider, anilistId, resolved),
            removeExtensionMappingFailure(provider, anilistId),
          ]);
        } catch (error) {
          logError(
            normalizeError(error),
            `MappingService:persistResolvedOverrideStaticHit:${provider}:${anilistId}`,
          );
        }
        return resolved;
      }

      if (import.meta.env.DEV) {
        this.log.debug?.(
          `mapping:override-hit provider=${provider} anilistId=${anilistId} ${overrideExternalId.kind}Id=${overrideExternalId.id}`,
        );
      }
      return { externalId: overrideExternalId };
    }

    const cachedSuccess = await readExtensionMapping(provider, anilistId);
    if (cachedSuccess) {
      if (import.meta.env.DEV) {
        this.log.debug?.(
          `mapping:success-cache-hit provider=${provider} anilistId=${anilistId} ${cachedSuccess.value.externalId.kind}Id=${cachedSuccess.value.externalId.id}`,
        );
      }
      this.clearUnresolvedMapping(provider, anilistId);
      if (this.isCandidateSuppressed(provider, anilistId, cachedSuccess.value.externalId)) {
        return null;
      }
      this.recordResolvedMapping(provider, anilistId, cachedSuccess.value, 'auto');
      return cachedSuccess.value;
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
    }

    const staticHit = this.getUpstreamStaticExternalId(provider, anilistId);
    if (staticHit) {
      incrementCounter('mapping.lookup.static_hit');
      return this.acceptResolved(provider, anilistId, { externalId: staticHit }, 'upstream');
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
    source: 'auto' | 'upstream',
  ): Promise<ResolvedMapping | null> {
    try {
      await Promise.all([
        writeExtensionMapping(provider, anilistId, resolved),
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
    this.clearUnresolvedMapping(provider, anilistId);
    if (this.isCandidateSuppressed(provider, anilistId, resolved.externalId)) {
      return null;
    }
    this.recordResolvedMapping(provider, anilistId, resolved, source);
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
    options: ResolveExternalIdOptions,
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
        if (!bypassFailureCache) {
          await this.cacheFailure(provider, anilistId, normalized);
        }
        return null;
      }

      if (!bypassFailureCache && this.shouldCacheFailure(normalized)) {
        await this.cacheFailure(provider, anilistId, normalized);
      }
      throw normalized;
    }

    if (resolved === null) {
      if (!bypassFailureCache) {
        const expectedExternalIdKind = this.lookupClients[provider].externalIdKind;
        await this.cacheFailure(
          provider,
          anilistId,
          createError(
            ErrorCode.VALIDATION_ERROR,
            `No ${expectedExternalIdKind.toUpperCase()} match found for AniList ID ${anilistId}.`,
            `No matching ${expectedExternalIdKind.toUpperCase()} entry was found.`,
            { reason: 'no-match', provider },
          ),
        );
      }
      this.recordUnresolvedMapping(provider, anilistId, options.hints);
      return null;
    }

    if (import.meta.env.DEV) {
      this.log.debug?.(
        `mapping:network-success provider=${provider} anilistId=${anilistId} ${resolved.externalId.kind}Id=${resolved.externalId.id}${resolved.successfulSynonym ? ` synonym="${resolved.successfulSynonym}"` : ''}`,
      );
    }
    return this.acceptResolved(provider, anilistId, resolved, 'auto');
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
    provider: Provider,
    anilistId: number,
    hints: ResolveExternalIdOptions['hints'] | undefined,
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
    hints: ResolveExternalIdOptions['hints'] | undefined,
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
        externalId: { id: outcome.externalId, kind: lookupClient.externalIdKind },
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
      removeExtensionMapping(provider, anilistId),
      removeExtensionMappingFailure(provider, anilistId),
    ]);
    this.inflight.delete(this.inflightKey(provider, anilistId));
    this.evictAniListMedia(anilistId);
    this.ledger.delete(provider, anilistId);
    this.clearUnresolvedMapping(provider, anilistId);
  }

  public isOverrideActive(anilistId: number, provider: Provider = 'sonarr'): boolean {
    return this.overrides?.has(provider, anilistId) ?? false;
  }

  public isIgnored(anilistId: number, provider: Provider = 'sonarr'): boolean {
    return this.overrides?.isIgnored(provider, anilistId) ?? false;
  }

  public getCandidateSuppression(
    anilistId: number,
    externalId: MappingExternalId,
    provider: Provider = 'sonarr',
  ): 'blocked' | 'rejected' | null {
    return this.overrides?.getCandidateSuppression(provider, anilistId, externalId) ?? null;
  }

  public getRecordedResolvedMappings(
    provider?: Provider,
  ): Array<{ anilistId: number; provider: Provider; externalId: MappingExternalId; source: 'auto' | 'upstream'; updatedAt: number }> {
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
    provider?: Provider,
  ): Array<{ anilistId: number; provider: Provider; source: 'unresolved'; updatedAt: number; title?: string }> {
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

  public getLinkedAniListIds(provider: Provider, externalId: MappingExternalId): number[] {
    const ids = new Set<number>();
    if (this.overrides) {
      for (const id of this.overrides.getLinkedAniListIds(provider, externalId)) {
        ids.add(id);
      }
    }
    if (provider === 'sonarr' && externalId.kind === 'tvdb') {
      for (const id of this.upstreamMappingStore.getAniListIdsForTvdb(externalId.id)) {
        ids.add(id);
      }
    }
    return [...ids];
  }

  public getLinkedAniListIdsForTvdb(tvdbId: number): number[] {
    return this.getLinkedAniListIds('sonarr', { id: tvdbId, kind: 'tvdb' });
  }

  private recordResolvedMapping(
    provider: Provider,
    anilistId: number,
    mapping: ResolvedMapping,
    source: 'auto' | 'upstream',
  ): void {
    this.ledger.record(provider, anilistId, mapping, source);
  }

  private recordUnresolvedMapping(
    provider: Provider,
    anilistId: number,
    hints?: ResolveExternalIdOptions['hints'],
  ): void {
    const changed = this.unresolvedLedger.record(provider, anilistId, this.resolveUnresolvedTitle(hints));
    if (changed) {
      this.notifyMappingsChanged?.();
    }
  }

  private clearUnresolvedMapping(provider: Provider, anilistId: number): void {
    if (this.unresolvedLedger.delete(provider, anilistId)) {
      this.notifyMappingsChanged?.();
    }
  }

  private isCandidateSuppressed(
    provider: Provider,
    anilistId: number,
    externalId: MappingExternalId,
  ): boolean {
    return this.overrides?.getCandidateSuppression(provider, anilistId, externalId) != null;
  }

  private resolveUnresolvedTitle(hints?: ResolveExternalIdOptions['hints']): string | undefined {
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

  private async getConfiguredCredentials(provider: Provider): Promise<ProviderCredentials> {
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
    provider: Provider,
    anilistId: number,
  ): MappingExternalId | null {
    if (provider !== 'sonarr') {
      return null;
    }
    const hit = this.upstreamMappingStore.get(anilistId);
    if (!hit) {
      return null;
    }
    return { id: hit.tvdbId, kind: 'tvdb' };
  }
}



export {type UpstreamMappingPayload} from './upstream';
export {type ResolvedMapping} from './types';
