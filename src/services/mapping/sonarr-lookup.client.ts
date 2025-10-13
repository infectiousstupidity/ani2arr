// src/services/mapping/sonarr-lookup.client.ts
import type { TtlCache } from '@/cache';
import PQueue from 'p-queue';
import type { SonarrApiService } from '@/api/sonarr.api';
import type { SonarrLookupSeries } from '@/types';
import { canonicalTitleKey, sanitizeLookupDisplay } from '@/utils/matching';
import { incrementCounter, timeAsync } from '@/utils/metrics';
import { logger } from '@/utils/logger';
import { normalizeError } from '@/utils/error-handling';

const LOOKUP_SOFT_TTL = 10 * 60 * 1000; // 10 minutes
const LOOKUP_HARD_TTL = 30 * 60 * 1000; // 30 minutes

const LOOKUP_NEGATIVE_SOFT_TTL = 5 * 60 * 1000; // 5 minutes
const LOOKUP_NEGATIVE_HARD_TTL = 15 * 60 * 1000; // 15 minutes

const LOOKUP_LATENCY_BUCKETS = [50, 100, 250, 500, 1000, 2000, 5000];

export interface SonarrLookupCredentials {
  url: string;
  apiKey: string;
}

export interface SonarrLookupOptions {
  forceNetwork?: boolean;
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

  public async readFromCache(canonical: string): Promise<SonarrLookupSeries[]> {
    if (!canonical) {
      return [];
    }

    const inflight = this.inflight.get(canonical);
    if (inflight) {
      incrementCounter('mapping.lookup.inflight_reuse');
      this.log.debug(`readFromCache(${canonical}): reusing inflight promise`);
      return inflight;
    }

    const positive = await this.caches.positive.read(canonical);
    if (positive) {
      incrementCounter('mapping.lookup.cache_hit');
      this.log.debug(`readFromCache(${canonical}): positive cache hit (stale=${String(positive.stale)})`);
      return positive.value;
    }

    const negative = await this.caches.negative.read(canonical);
    if (negative) {
      incrementCounter('mapping.lookup.negative_cache_hit');
      this.log.debug(`readFromCache(${canonical}): negative cache hit (stale=${String(negative.stale)})`);
      return [];
    }

    return [];
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

    if (!forceNetwork) {
      const positiveHit = await this.caches.positive.read(canonical);
      if (positiveHit && !positiveHit.stale) {
        incrementCounter('mapping.lookup.cache_hit');
        this.log.debug(`lookup(${canonical}): returning fresh positive cache`);
        return positiveHit.value;
      }

      const negativeHit = await this.caches.negative.read(canonical);
      if (negativeHit && !negativeHit.stale) {
        incrementCounter('mapping.lookup.negative_cache_hit');
        this.log.debug(`lookup(${canonical}): returning fresh negative cache`);
        return [];
      }

      const inflight = this.inflight.get(canonical);
      if (inflight) {
        incrementCounter('mapping.lookup.inflight_reuse');
        this.log.debug(`lookup(${canonical}): reusing inflight lookup`);
        return inflight;
      }
    } else {
      const inflight = this.inflight.get(canonical);
      if (inflight) {
        this.log.debug(`lookup(${canonical}): forceNetwork requested but inflight exists; reusing`);
        return inflight;
      }
    }

    const promise = this.performLookup(safeTerm, credentials)
      .then(async results => {
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
        return results;
      })
      .catch(error => {
        throw normalizeError(error);
      })
      .finally(() => {
        this.inflight.delete(canonical);
      });

    this.inflight.set(canonical, promise);
    return promise;
  }

  private async performLookup(
    term: string,
    credentials: SonarrLookupCredentials,
  ): Promise<SonarrLookupSeries[]> {
    incrementCounter('mapping.lookup.network_miss');
    return timeAsync('mapping.lookup.latency', LOOKUP_LATENCY_BUCKETS, async () => {
      try {
        const results = await (this.queue.add(() =>
          this.sonarrApi.lookupSeriesByTerm(term, credentials),
        ) as Promise<SonarrLookupSeries[]>);
        this.log.debug(`performLookup: term='${term}' resultCount=${results.length}`);
        return results;
      } catch (error) {
        throw normalizeError(error);
      }
    });
  }
}
