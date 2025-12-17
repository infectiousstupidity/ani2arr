// src/services/mapping/index.ts
import type { TtlCache } from '@/cache';
import type { AnilistApiService } from '@/api/anilist.api';
import type { ExtensionError, AniMedia, RequestPriority } from '@/shared/types';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/utils/error-handling';
import { getExtensionOptionsSnapshot } from '@/shared/utils/storage/storage';
import { incrementCounter } from '@/shared/utils/metrics';
import { logger } from '@/shared/utils/logger';
import { StaticMappingProvider, type StaticMappingPayload } from './static-mapping.provider';
import { SonarrLookupClient, type SonarrLookupCredentials } from './sonarr-lookup.client';
import { resolveViaPipeline } from './pipeline/pipeline';
import { MappingOverridesService } from './overrides.service';
import { buildMediaFromMetadataHint } from './hints/media-hints';
import { tryHintLookup } from './hints/hint-lookup';
import { resolvePrequelStatic } from './hints/prequel-static';
import {
  ResolvedLedger,
  ALLOWED_FORMATS,
  FAILURE_HARD_TTL,
  FAILURE_SOFT_TTL,
  NETWORK_FAILURE_HARD_TTL,
  NETWORK_FAILURE_SOFT_TTL,
  NO_MATCH_HARD_TTL,
  NO_MATCH_SOFT_TTL,
  RESOLVED_PERSIST_MS,
  SCORE_THRESHOLD,
  EARLY_STOP_THRESHOLD,
  MAX_SEARCH_TERMS,
} from './cache';
import type { ResolveHints, ResolveTvdbIdOptions, ResolvedMapping } from './types';

export class MappingService {
  private readonly log = logger.create('MappingService');
  private readonly inflight = new Map<number, Promise<ResolvedMapping | null>>();
  private readonly sessionSeenCanonical = new Set<string>();
  private readonly ledger = new ResolvedLedger();

  constructor(
    private readonly anilistApi: AnilistApiService,
    private readonly staticProvider: StaticMappingProvider,
    private readonly lookupClient: SonarrLookupClient,
    private readonly caches: {
      success: TtlCache<ResolvedMapping>;
      failure: TtlCache<ExtensionError>;
    },
    private readonly overrides?: MappingOverridesService,
  ) {}

  public async resetLookupState(): Promise<void> {
    await Promise.all([this.lookupClient.reset(), this.caches.failure.clear()]);
    this.inflight.clear();
    this.sessionSeenCanonical.clear();
  }

  public initStaticPairs(): Promise<void> {
    return this.staticProvider.init();
  }

  // Expose a thin wrapper to bump AniList media priority from other services
  public prioritizeAniListMedia(anilistId: number, options?: { schedule?: boolean }): void {
    try {
      const anyApi = this.anilistApi as unknown as { prioritize?: (ids: number | number[], options?: { schedule?: boolean }) => void };
      if (anyApi && typeof anyApi.prioritize === 'function') {
        anyApi.prioritize(anilistId, { schedule: options?.schedule === true });
      }
    } catch {
      // best-effort; ignore failures
    }
  }

  /**
   * Resolve AniList ID to TVDB ID. Returns null if no mapping is found (expected case).
   * Still throws for genuine errors (network, permission, config, api errors).
   */
  public resolveTvdbId(anilistId: number, options: ResolveTvdbIdOptions = {}): Promise<ResolvedMapping | null> {
    if (import.meta.env.DEV) {
      this.log.debug?.(
        `mapping:start anilistId=${anilistId} priority=${options.priority ?? 'normal'} network=${options.network ?? 'allow'} ignoreFailureCache=${String(options.ignoreFailureCache === true)}`,
      );
    }
    const bypassFailureCache = options.ignoreFailureCache === true;
    const existing = this.inflight.get(anilistId);
    if (existing) {
      // If a mapping is already in-flight but caller requests high priority,
      // bump AniList fetch priority to ensure the underlying media request is preempted.
      if (options.priority === 'high') {
        try {
          const anyApi = this.anilistApi as unknown as { prioritize?: (ids: number | number[], options?: { schedule?: boolean }) => void };
          if (anyApi && typeof anyApi.prioritize === 'function') {
            // Only bump tokens; do not force-schedule a fetch here to respect AniList cache.
            anyApi.prioritize(anilistId, { schedule: false });
          }
        } catch {
          // best-effort bump; ignore failures
        }
      }
      return existing;
    }

    const promise = this.resolveTvdbIdInternal(anilistId, options, bypassFailureCache);
    this.inflight.set(anilistId, promise);

    promise.finally(() => {
      const current = this.inflight.get(anilistId);
      if (current === promise) {
        this.inflight.delete(anilistId);
      }
    });

    return promise;
  }

  private async resolveTvdbIdInternal(
    anilistId: number,
    options: ResolveTvdbIdOptions,
    bypassFailureCache: boolean,
  ): Promise<ResolvedMapping | null> {
    if (this.overrides?.isIgnored(anilistId)) {
      if (import.meta.env.DEV) {
        this.log.debug?.(`mapping:ignored anilistId=${anilistId}`);
      }
      return null;
    }
    // Phase 0: Check user overrides first; authoritative mapping if present
    const overrideTvdb = this.overrides?.get(anilistId) ?? null;
    if (typeof overrideTvdb === 'number') {
      const staticHit = this.staticProvider.get(anilistId);
      if (staticHit && staticHit.tvdbId === overrideTvdb) {
        // Upstream now matches the manual override; drop the override and treat as upstream.
        try {
          await this.overrides?.clear(anilistId);
        } catch (error) {
          logError(normalizeError(error), `MappingService:clearOverride:${anilistId}`);
        }
        this.recordResolvedMapping(anilistId, staticHit.tvdbId, 'upstream');
        // Update the cache with the new authoritative mapping and TTL
        const cacheKey = this.successCacheKey(anilistId);
        await this.caches.success.write(cacheKey, { tvdbId: staticHit.tvdbId }, {
          staleMs: RESOLVED_PERSIST_MS,
          hardMs: RESOLVED_PERSIST_MS,
        });
        if (import.meta.env.DEV) {
          this.log.debug?.(`mapping:override-cleared-to-upstream anilistId=${anilistId} tvdbId=${staticHit.tvdbId}`);
        }
        return { tvdbId: staticHit.tvdbId };
      }
      if (import.meta.env.DEV) {
        this.log.debug?.(`mapping:override-hit anilistId=${anilistId} tvdbId=${overrideTvdb}`);
      }
      return { tvdbId: overrideTvdb };
    }
    const cacheKey = this.successCacheKey(anilistId);
    const cachedSuccess = await this.caches.success.read(cacheKey);
    if (cachedSuccess) {
      if (import.meta.env.DEV) {
        this.log.debug?.(`mapping:success-cache-hit anilistId=${anilistId} tvdbId=${cachedSuccess.value.tvdbId}`);
      }
      this.recordResolvedMapping(anilistId, cachedSuccess.value.tvdbId, 'auto');
      return cachedSuccess.value;
    }

    if (!bypassFailureCache) {
      const cachedFailure = await this.caches.failure.read(this.failureCacheKey(anilistId));
      if (cachedFailure) {
        if (import.meta.env.DEV) {
          this.log.debug?.(`mapping:failure-cache-hit anilistId=${anilistId} code=${cachedFailure.value.code}`);
        }
        throw cachedFailure.value;
      }
    }

    const staticHit = this.staticProvider.get(anilistId);
    if (staticHit) {
      incrementCounter('mapping.lookup.static_hit');
      await this.caches.success.write(cacheKey, { tvdbId: staticHit.tvdbId }, {
        staleMs: RESOLVED_PERSIST_MS,
        hardMs: RESOLVED_PERSIST_MS,
      });
      if (import.meta.env.DEV) {
        this.log.debug?.(`mapping:static-hit anilistId=${anilistId} tvdbId=${staticHit.tvdbId}`);
      }
      this.recordResolvedMapping(anilistId, staticHit.tvdbId, 'upstream');
      return { tvdbId: staticHit.tvdbId };
    }

    if (options.network === 'never') {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        `AniList ID ${anilistId} requires a network lookup but network access is disabled.`,
        'Unable to resolve this title without contacting Sonarr.',
        { reason: 'network-disabled' },
      );
    }

    const hintTerm = options.hints?.primaryTitle?.trim();
    if (hintTerm) {
      try {
        const credentials = await this.getConfiguredCredentials();
        const hinted = await tryHintLookup(
          hintTerm,
          this.lookupClient,
          credentials,
          this.log,
          options.forceLookupNetwork === true,
        );
        if (hinted) {
          await this.caches.success.write(cacheKey, hinted, {
            staleMs: RESOLVED_PERSIST_MS,
            hardMs: RESOLVED_PERSIST_MS,
          });
          this.recordResolvedMapping(anilistId, hinted.tvdbId, 'auto');
          return hinted;
        }
      } catch (error) {
        logError(normalizeError(error), `MappingService:hintLookup:${anilistId}`);
      }
    }

    let resolved: ResolvedMapping | null;
    try {
      if (import.meta.env.DEV) {
        this.log.debug?.(`mapping:network-start anilistId=${anilistId} priority=${options.priority ?? 'normal'}`);
      }
      resolved = await this.resolveViaNetwork(
        anilistId,
        options.hints,
        options.priority,
        options.forceLookupNetwork === true,
      );
    } catch (error) {
      const normalized = normalizeError(error);
      // VALIDATION_ERROR means no match found (expected) — return null instead of throwing
      if (normalized.code === ErrorCode.VALIDATION_ERROR) {
        if (!bypassFailureCache) {
          const ttl = this.failureTtlsFor(normalized);
          await this.caches.failure.write(this.failureCacheKey(anilistId), normalized, {
            staleMs: ttl.stale,
            hardMs: ttl.hard,
          });
        }
        return null;
      }
      // Real errors (network, config, permission) still throw
      if (!bypassFailureCache && this.shouldCacheFailure(normalized)) {
        const ttl = this.failureTtlsFor(normalized);
        await this.caches.failure.write(this.failureCacheKey(anilistId), normalized, {
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
          `No TVDB match found for AniList ID ${anilistId}.`,
          'No matching TVDB entry was found.',
          { reason: 'no-match' },
        );
        const ttl = this.failureTtlsFor(noMatchError);
        await this.caches.failure.write(this.failureCacheKey(anilistId), noMatchError, {
          staleMs: ttl.stale,
          hardMs: ttl.hard,
        });
      }
      return null;
    }

    this.recordResolvedMapping(anilistId, resolved.tvdbId, 'auto');
    await this.caches.success.write(cacheKey, resolved, {
      staleMs: RESOLVED_PERSIST_MS,
      hardMs: RESOLVED_PERSIST_MS,
    });
    if (import.meta.env.DEV) {
      this.log.debug?.(
        `mapping:network-success anilistId=${anilistId} tvdbId=${resolved.tvdbId}${resolved.successfulSynonym ? ` synonym="${resolved.successfulSynonym}"` : ''}`,
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
    anilistId: number,
    hints: ResolveHints | undefined,
    prio: RequestPriority | undefined,
    forceLookupNetwork: boolean,
  ): Promise<ResolvedMapping | null> {
    const credentials = await this.getConfiguredCredentials();

    const metadataMedia = buildMediaFromMetadataHint(anilistId, hints?.domMedia);
    if (metadataMedia) {
      const resolved = await this.tryResolveWithMedia(
        metadataMedia,
        credentials,
        hints,
        prio,
        forceLookupNetwork,
      );
      if (resolved) {
        return resolved;
      }
    }

    const apiMedia = await this.anilistApi.fetchMediaWithRelations(
      anilistId,
      prio === undefined ? undefined : { priority: prio },
    );
    const apiResolved = await this.tryResolveWithMedia(
      apiMedia,
      credentials,
      hints,
      prio,
      forceLookupNetwork,
    );
    if (apiResolved) {
      return apiResolved;
    }

    // No match found — return null (expected case, not an error)
    this.log.debug(`resolveViaNetwork: no match found for AniList ID ${anilistId}`);
    return null;
  }

  private async tryResolveWithMedia(
    media: AniMedia,
    credentials: SonarrLookupCredentials,
    hints: ResolveHints | undefined,
    priority: RequestPriority | undefined,
    forceLookupNetwork: boolean,
  ): Promise<ResolvedMapping | null> {
    if (media.format && !ALLOWED_FORMATS.has(media.format)) {
      // Unsupported format — return null (not an error, just not mappable)
      this.log.debug(`tryResolveWithMedia: unsupported format '${media.format}' for AniList ID ${media.id}`);
      return null;
    }

    const prequelStatic = await resolvePrequelStatic(media, this.staticProvider, this.anilistApi);
    if (prequelStatic) {
      this.recordResolvedMapping(media.id, prequelStatic.tvdbId, 'upstream');
      return prequelStatic;
    }

    const outcome = await resolveViaPipeline(
      media,
      {
        anilistApi: this.anilistApi,
        lookupClient: this.lookupClient,
        staticProvider: this.staticProvider,
        credentials,
        ...(typeof priority !== 'undefined' ? { priority } : {}),
        ...(forceLookupNetwork ? { forceLookupNetwork: true } : {}),
        sessionSeenCanonical: this.sessionSeenCanonical,
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
        tvdbId: outcome.tvdbId,
        ...(outcome.successfulSynonym ? { successfulSynonym: outcome.successfulSynonym } : {}),
      };
    }
    return null;
  }

  private successCacheKey(anilistId: number): string {
    return `resolved:${anilistId}`;
  }

  private failureCacheKey(anilistId: number): string {
    return `resolved-failure:${anilistId}`;
  }

  // Evict resolved caches for a specific AniList ID (used when overrides change)
  public async evictResolved(anilistId: number): Promise<void> {
    await Promise.all([
      this.caches.success.remove(this.successCacheKey(anilistId)),
      this.caches.failure.remove(this.failureCacheKey(anilistId)),
    ]);
    this.inflight.delete(anilistId);
    this.evictAniListMedia(anilistId);
    this.ledger.delete(anilistId);
  }

  // Utility for LibraryService to surface whether an override is active
  public isOverrideActive(anilistId: number): boolean {
    return this.overrides?.has(anilistId) ?? false;
  }

  public isIgnored(anilistId: number): boolean {
    return this.overrides?.isIgnored(anilistId) ?? false;
  }

  public getRecordedResolvedMappings(): Array<{ anilistId: number; tvdbId: number; source: 'auto' | 'upstream'; updatedAt: number }> {
    return this.ledger.list().map(entry => ({
      anilistId: entry.anilistId,
      tvdbId: entry.tvdbId,
      source: entry.source,
      updatedAt: entry.updatedAt,
    }));
  }

  private recordResolvedMapping(anilistId: number, tvdbId: number, source: 'auto' | 'upstream'): void {
    this.ledger.record(anilistId, { tvdbId }, source);
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
      // No match found (expected) — back off for a day unless user explicitly retries
      return { stale: NO_MATCH_SOFT_TTL, hard: NO_MATCH_HARD_TTL };
    }
    if (error.code === ErrorCode.NETWORK_ERROR || error.code === ErrorCode.API_ERROR) {
      // Transient; keep short
      return { stale: NETWORK_FAILURE_SOFT_TTL, hard: NETWORK_FAILURE_HARD_TTL };
    }
    // Config/permission/api (non-transient): medium backoff
    return { stale: FAILURE_SOFT_TTL, hard: FAILURE_HARD_TTL };
  }

  private async getConfiguredCredentials(): Promise<SonarrLookupCredentials> {
    const opts = await getExtensionOptionsSnapshot();
    if (!opts?.sonarrUrl || !opts?.sonarrApiKey) {
      throw createError(
        ErrorCode.SONARR_NOT_CONFIGURED,
        'Sonarr credentials are not configured.',
        'Configure your Sonarr connection in ani2arr options.',
      );
    }
    return { url: opts.sonarrUrl, apiKey: opts.sonarrApiKey };
  }

  public getLinkedAniListIdsForTvdb(tvdbId: number): number[] {
    const ids = new Set<number>();
    if (this.overrides) {
      for (const id of this.overrides.getLinkedAniListIds(tvdbId)) {
        ids.add(id);
      }
    }
    const staticIds = this.staticProvider.getAniListIdsForTvdb(tvdbId);
    for (const id of staticIds) {
      ids.add(id);
    }
    return Array.from(ids);
  }
}

export type { StaticMappingPayload, ResolvedMapping };
