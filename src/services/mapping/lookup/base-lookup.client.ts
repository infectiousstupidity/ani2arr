/** Shared lookup client base with cache reuse, queueing, and provider search orchestration. */
// src/services/mapping/lookup/base-lookup.client.ts

import { STORAGE_POLICIES, type TtlCache } from '@/storage';
import PQueue from 'p-queue';
import type { Provider } from '@/integrations/providers';
import type { MappingExternalIdKind } from '@/services/mapping/types';
import { normalizeError } from '@/shared/errors';
import type { ProviderCredentials } from '@/integrations/providers';
import type { RequestPriority } from '@/shared/utils/request-priority';
import {
  canonicalTitleKeyForProvider,
  sanitizeLookupDisplayForProvider,
} from '@/services/mapping/pipeline/matching';
import { incrementCounter, timeAsync } from '@/debug/metrics';
import { priorityValue } from '@/shared/utils/request-priority';
import { logger, type ScopedLogger } from '@/shared/utils/logger';
import type {
  ProviderLookupClient,
  ProviderLookupCacheHit,
  ProviderLookupOptions,
  ProviderLookupResult,
} from './provider-lookup.client';

const LOOKUP_LATENCY_BUCKETS = [50, 100, 250, 500, 1000, 2000, 5000];

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export type LookupCaches<TResult> = {
  positive: TtlCache<TResult[]>;
  negative: TtlCache<boolean>;
};

export abstract class BaseLookupClient<TResult extends ProviderLookupResult>
  implements ProviderLookupClient<ProviderCredentials, TResult>
{
  protected readonly log: ScopedLogger;
  private readonly inflight = new Map<string, Promise<TResult[]>>();
  private readonly queue = new PQueue({ concurrency: 5 });

  public readonly provider: Provider;
  public readonly externalIdKind: MappingExternalIdKind;

  constructor(
    provider: Provider,
    externalIdKind: MappingExternalIdKind,
    loggerName: string,
    private readonly caches: LookupCaches<TResult>,
  ) {
    this.provider = provider;
    this.externalIdKind = externalIdKind;
    this.log = logger.create(loggerName);
  }

  public async reset(): Promise<void> {
    this.inflight.clear();
    await Promise.all([this.caches.positive.clear(), this.caches.negative.clear()]);
  }

  public async readFromCache(
    canonical: string,
  ): Promise<ProviderLookupCacheHit<TResult>> {
    if (!canonical) {
      return { results: [], hit: 'none' };
    }

    const inflight = this.inflight.get(canonical);
    if (inflight) {
      incrementCounter('mapping.lookup.inflight_reuse');
      this.log.debug(`readFromCache(${canonical}): reusing inflight promise`);
      const results = await inflight;
      return { results, hit: 'inflight' };
    }

    const positive = await this.caches.positive.read(canonical);
    if (positive) {
      incrementCounter('mapping.lookup.cache_hit');
      this.log.debug(
        `readFromCache(${canonical}): positive cache hit (stale=${String(positive.stale)})`,
      );
      return { results: positive.value, hit: 'positive' };
    }

    const negative = await this.caches.negative.read(canonical);
    if (negative) {
      incrementCounter('mapping.lookup.negative_cache_hit');
      this.log.debug(
        `readFromCache(${canonical}): negative cache hit (stale=${String(negative.stale)})`,
      );
      return { results: [], hit: 'negative' };
    }

    return { results: [], hit: 'none' };
  }

  public async lookup(
    canonicalKey: string,
    rawTerm: string,
    credentials: ProviderCredentials,
    options: ProviderLookupOptions = {},
  ): Promise<TResult[]> {
    const safeTerm = sanitizeLookupDisplayForProvider(this.provider, rawTerm);
    if (!safeTerm) {
      this.log.debug(`lookup: sanitized term empty for raw='${rawTerm}', skipping.`);
      return [];
    }

    const canonical =
      canonicalKey ||
      canonicalTitleKeyForProvider(this.provider, safeTerm) ||
      canonicalTitleKeyForProvider(this.provider, rawTerm);
    const forceNetwork = options.forceNetwork === true;

    if (!canonical) {
      return this.performLookup(rawTerm, credentials);
    }

    // Reuse any existing inflight request immediately
    const existing = this.inflight.get(canonical);
    if (existing) {
      this.log.debug(`lookup(${canonical}): existing inflight found; reusing`);
      incrementCounter('mapping.lookup.inflight_reuse');
      return existing;
    }

    // Create a deferred promise and set it as inflight BEFORE any awaits
    const deferred = createDeferred<TResult[]>();
    this.inflight.set(canonical, deferred.promise);

    (async () => {
      try {
        if (!forceNetwork) {
          const positiveHit = await this.caches.positive.read(canonical);
          if (positiveHit && !positiveHit.stale) {
            incrementCounter('mapping.lookup.cache_hit');
            this.log.debug(`lookup(${canonical}): returning fresh positive cache (deferred)`);
            deferred.resolve(positiveHit.value);
            return;
          }

          const negativeHit = await this.caches.negative.read(canonical);
          if (negativeHit && !negativeHit.stale) {
            incrementCounter('mapping.lookup.negative_cache_hit');
            this.log.debug(`lookup(${canonical}): returning fresh negative cache (deferred)`);
            deferred.resolve([]);
            return;
          }
        }

        const results = await this.performLookup(safeTerm, credentials, options.priority);
        if (results.length > 0) {
          await this.caches.positive.write(canonical, results, {
            staleMs: STORAGE_POLICIES.lookupPositive.staleMs,
            hardMs: STORAGE_POLICIES.lookupPositive.hardMs,
          });
          await this.caches.negative.remove(canonical);
        } else {
          await this.caches.negative.write(canonical, true, {
            staleMs: STORAGE_POLICIES.lookupNegative.staleMs,
            hardMs: STORAGE_POLICIES.lookupNegative.hardMs,
          });
          await this.caches.positive.remove(canonical);
        }
        deferred.resolve(results);
      } catch (error) {
        deferred.reject(normalizeError(error));
      } finally {
        this.inflight.delete(canonical);
      }
    })();

    return deferred.promise;
  }

  public abstract getExternalId(result: unknown): number | null;

  /** Subclasses supply the actual API call (e.g. Sonarr series lookup, Radarr movie lookup). */
  protected abstract fetchFromApi(
    term: string,
    credentials: ProviderCredentials,
  ): Promise<TResult[]>;

  private async performLookup(
    term: string,
    credentials: ProviderCredentials,
    priority?: RequestPriority,
  ): Promise<TResult[]> {
    incrementCounter('mapping.lookup.network_miss');
    return timeAsync('mapping.lookup.latency', LOOKUP_LATENCY_BUCKETS, async () => {
      try {
        if (import.meta.env.DEV) {
          this.log.debug?.(
            `lookup:queue term='${term}' priority=${priority ?? 'normal'} prioValue=${priorityValue(priority)}`,
          );
        }
        const results = await (this.queue.add(
          () => this.fetchFromApi(term, credentials),
          { priority: priorityValue(priority) },
        ) as Promise<TResult[]>);
        this.log.debug(`performLookup: term='${term}' resultCount=${results.length}`);
        return results;
      } catch (error) {
        throw normalizeError(error);
      }
    });
  }
}
