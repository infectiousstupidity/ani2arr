// src/services/mapping/sonarr-lookup.client.ts
import type { TtlCache } from '@/cache';
import PQueue from 'p-queue';
import type { SonarrApiService } from '@/clients/sonarr.api';
import type { SonarrLookupSeries, RequestPriority } from '@/shared/types';
import { priorityValue } from '@/shared/utils/priority';
import { canonicalTitleKey, sanitizeLookupDisplay } from '@/services/mapping/pipeline/matching';
import { incrementCounter, timeAsync } from '@/shared/utils/metrics';
import { logger } from '@/shared/utils/logger';
import { normalizeError } from '@/shared/errors/error-utils';

const LOOKUP_SOFT_TTL = 10 * 60 * 1000; // 10 minutes
const LOOKUP_HARD_TTL = 30 * 60 * 1000; // 30 minutes

// Negative results (no matches) should not be retried frequently during browsing
// Manual retries bypasses via forceNetwork.
const LOOKUP_NEGATIVE_SOFT_TTL = 24 * 60 * 60 * 1000; // 24 hours
const LOOKUP_NEGATIVE_HARD_TTL = 48 * 60 * 60 * 1000; // 48 hours

const LOOKUP_LATENCY_BUCKETS = [50, 100, 250, 500, 1000, 2000, 5000];

export interface SonarrLookupCredentials {
  url: string;
  apiKey: string;
}

export interface SonarrLookupOptions {
  forceNetwork?: boolean;
  priority?: RequestPriority;
}

type LookupCaches = {
  positive: TtlCache<SonarrLookupSeries[]>;
  negative: TtlCache<boolean>;
};

export class SonarrLookupClient {
  private readonly log = logger.create('SonarrLookupClient');
  private readonly inflight = new Map<string, Promise<SonarrLookupSeries[]>>();
  private readonly queue = new PQueue({ concurrency: 5 });

  constructor(
    private readonly sonarrApi: SonarrApiService,
    private readonly caches: LookupCaches,
  ) {}

  public async reset(): Promise<void> {
    this.inflight.clear();
    await Promise.all([this.caches.positive.clear(), this.caches.negative.clear()]);
  }

  public async readFromCache(
    canonical: string,
  ): Promise<{ results: SonarrLookupSeries[]; hit: 'positive' | 'negative' | 'inflight' | 'none' }> {
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
    credentials: SonarrLookupCredentials,
    options: SonarrLookupOptions = {},
  ): Promise<SonarrLookupSeries[]> {
    const safeTerm = sanitizeLookupDisplay(rawTerm);
    if (!safeTerm) {
      this.log.debug(`lookup: sanitized term empty for raw='${rawTerm}', skipping.`);
      return [];
    }

    const canonical = canonicalKey || canonicalTitleKey(safeTerm) || canonicalTitleKey(rawTerm);
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
    let resolveFn!: (v: SonarrLookupSeries[]) => void;
    let rejectFn!: (e: unknown) => void;
    const deferred = new Promise<SonarrLookupSeries[]>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });
    this.inflight.set(canonical, deferred);

    (async () => {
      try {
        if (!forceNetwork) {
          const positiveHit = await this.caches.positive.read(canonical);
          if (positiveHit && !positiveHit.stale) {
            incrementCounter('mapping.lookup.cache_hit');
            this.log.debug(`lookup(${canonical}): returning fresh positive cache (deferred)`);
            resolveFn(positiveHit.value);
            return;
          }

          const negativeHit = await this.caches.negative.read(canonical);
          if (negativeHit && !negativeHit.stale) {
            incrementCounter('mapping.lookup.negative_cache_hit');
            this.log.debug(`lookup(${canonical}): returning fresh negative cache (deferred)`);
            resolveFn([]);
            return;
          }
        }

        const results = await this.performLookup(safeTerm, credentials, options.priority);
        if (results.length > 0) {
          await this.caches.positive.write(canonical, results, {
            staleMs: LOOKUP_SOFT_TTL,
            hardMs: LOOKUP_HARD_TTL,
          });
          await this.caches.negative.remove(canonical);
        } else {
          await this.caches.negative.write(canonical, true, {
            staleMs: LOOKUP_NEGATIVE_SOFT_TTL,
            hardMs: LOOKUP_NEGATIVE_HARD_TTL,
          });
          await this.caches.positive.remove(canonical);
        }
        resolveFn(results);
      } catch (error) {
        rejectFn(normalizeError(error));
      } finally {
        this.inflight.delete(canonical);
      }
    })();

    return deferred;
  }

  private async performLookup(
    term: string,
    credentials: SonarrLookupCredentials,
    priority?: RequestPriority,
  ): Promise<SonarrLookupSeries[]> {
    incrementCounter('mapping.lookup.network_miss');
    return timeAsync('mapping.lookup.latency', LOOKUP_LATENCY_BUCKETS, async () => {
      try {
        if (import.meta.env.DEV) {
          this.log.debug?.(`lookup:queue term='${term}' priority=${priority ?? 'normal'} prioValue=${priorityValue(priority)}`);
        }
        const results = await (this.queue.add(
          () => this.sonarrApi.lookupSeriesByTerm(term, credentials),
          { priority: priorityValue(priority) },
        ) as Promise<SonarrLookupSeries[]>);
        this.log.debug(`performLookup: term='${term}' resultCount=${results.length}`);
        return results;
      } catch (error) {
        throw normalizeError(error);
      }
    });
  }
}
