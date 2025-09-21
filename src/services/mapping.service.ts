/**
 * AniList -> TVDB resolver (MV2).
 * - SWR pairs with ETag
 * - In-flight dedupe
 * - Robust matching (token overlap + Dice + year + anime heuristic)
 */

import type { CacheService } from './cache.service';
import type { AnilistApiService, AniTitles } from '@/api/anilist.api';
import type { SonarrApiService } from '@/api/sonarr.api';
import type { SonarrLookupSeries } from '@/types';
import { createError, ErrorCode, logError, normalizeError } from '@/utils/error-handling';
import { retryWithBackoff } from '@/utils/retry';
import { normTitle, stripParenContent, computeTitleMatchScore } from '@/utils/matching';
import { extensionOptions } from '@/utils/storage';

const RESOLVED_STALE = 30 * 24 * 60 * 60 * 1000;
const RESOLVED_HARD  = 180 * 24 * 60 * 60 * 1000;

const STATIC_MAPPING_URL = 'https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json';
const STATIC_MAPPING_KEY = 'static_anilist_tvdb_pairs_v3';   // pairs: [anilistId, tvdbId][]
const STATIC_STALE = 24 * 60 * 60 * 1000;
const STATIC_HARD  = 14 * 24 * 60 * 60 * 1000;

const SCORE_THRESHOLD = 0.72;
const MAX_SYNONYMS = 8;
const SONARR_LOOKUP_BATCH_SIZE = 4;

export interface ResolvedMapping {
  tvdbId: number;
  successfulSynonym?: string;
}

type Pair = readonly [anilistId: number, tvdbId: number];

export class MappingService {
  private inflight = new Map<number, Promise<ResolvedMapping>>();

  constructor(
    private readonly sonarrApi: SonarrApiService,
    private readonly anilistApi: AnilistApiService,
    private readonly cache: CacheService,
  ) {}

  public async resolveTvdbId(anilistId: number): Promise<ResolvedMapping> {
    const dup = this.inflight.get(anilistId);
    if (dup) return dup;

    const p = this.doResolve(anilistId).finally(() => this.inflight.delete(anilistId));
    this.inflight.set(anilistId, p);
    return p;
  }

  private async doResolve(anilistId: number): Promise<ResolvedMapping> {
    const cacheKey = `resolved_mapping:${anilistId}`;
    const cached = await this.cache.get<ResolvedMapping>(cacheKey);
    if (cached) return cached;

    const fromStatic = await this.findInStaticPairs(anilistId);
    if (fromStatic !== null) {
      const res: ResolvedMapping = { tvdbId: fromStatic };
      await this.cache.set(cacheKey, res, RESOLVED_STALE, RESOLVED_HARD);
      return res;
    }

    const { tvdbId: tvdbFromApi, synonyms, titles, startYear } = await this.anilistApi.findTvdbId(anilistId);
    if (tvdbFromApi !== null) {
      const res: ResolvedMapping = { tvdbId: tvdbFromApi };
      await this.cache.set(cacheKey, res, RESOLVED_STALE, RESOLVED_HARD);
      return res;
    }

    const options = await extensionOptions.getValue();
    if (!options?.sonarrUrl || !options?.sonarrApiKey) {
      throw this.notFound(anilistId);
    }
    const credentials = { url: options.sonarrUrl, apiKey: options.sonarrApiKey };

    const terms = this.buildSearchTerms(titles, synonyms, startYear);

    type CandidateMatch = { tvdbId: number; score: number; term: string };
    let best: CandidateMatch | undefined;
    for (let i = 0; i < terms.length; i += SONARR_LOOKUP_BATCH_SIZE) {
      const batch = terms.slice(i, i + SONARR_LOOKUP_BATCH_SIZE);
      const batchLookups: PromiseSettledResult<{
        term: string;
        results: SonarrLookupSeries[];
      }>[] = await Promise.allSettled(
        batch.map(async term => {
          try {
            const results = await this.sonarrApi.lookupSeriesByTerm(term, credentials);
            return { term, results: results as SonarrLookupSeries[] };
          } catch (e) {
            logError(normalizeError(e), `MappingService:lookup:${term}`);
            return { term, results: [] as SonarrLookupSeries[] };
          }
        }),
      );
      for (const settled of batchLookups) {
        if (settled.status !== 'fulfilled') continue;
        const { term, results } = settled.value;
        for (const r of results) {
          const score = computeTitleMatchScore({
            queryRaw: term,
            candidateRaw: r.title,
            ...(typeof r.year === 'number' ? { candidateYear: r.year } : {}),
            ...(typeof startYear === 'number' ? { targetYear: startYear } : {}),
            ...(Array.isArray(r.genres) ? { candidateGenres: r.genres as readonly string[] } : {}),
          });

          if (score >= SCORE_THRESHOLD && (!best || score > best.score)) {
            best = { tvdbId: r.tvdbId, score, term };
          }
        }
      }
      if (best && best.score >= 0.9) break;
    }

    if (best) {
      const res: ResolvedMapping = { tvdbId: best.tvdbId, successfulSynonym: best.term };
      await this.cache.set(cacheKey, res, RESOLVED_STALE, RESOLVED_HARD);
      return res;
    }

    throw this.notFound(anilistId);
  }

  // ---- Static mapping (pairs + ETag/SWR) ----

  public async refreshStaticMapping(): Promise<void> {
    try {
      await retryWithBackoff(async () => {
        const meta = await this.cache.getWithMeta<Pair[]>(STATIC_MAPPING_KEY);
        const etag = meta?.etag;
        const headers: HeadersInit = etag ? { 'If-None-Match': etag } : {};
        const resp = await fetch(STATIC_MAPPING_URL, { headers, cache: 'no-store' });

        if (resp.status === 304 && meta?.v) {
          await this.cache.set(STATIC_MAPPING_KEY, meta.v, STATIC_STALE, STATIC_HARD, etag);
          return;
        }
        if (!resp.ok) throw new Error(`Static mapping ${resp.status}`);
        const body = await resp.text();
        const pairs = this.parseAnimeIdsJson(body);
        const newEtag = resp.headers.get('ETag') ?? undefined;
        await this.cache.set(STATIC_MAPPING_KEY, pairs, STATIC_STALE, STATIC_HARD, newEtag);
      });
    } catch (e) {
      logError(normalizeError(e), 'MappingService:refreshStaticMapping');
    }
  }

  private async findInStaticPairs(anilistId: number): Promise<number | null> {
    let pairs = await this.cache.get<Pair[]>(STATIC_MAPPING_KEY);
    if (!pairs) {
      await this.refreshStaticMapping();
      pairs = await this.cache.get<Pair[]>(STATIC_MAPPING_KEY);
    }
    if (!pairs || pairs.length === 0) return null;

    let lo = 0, hi = pairs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const p = pairs[mid];
      if (!p) break;
      const [aid, tv] = p;
      if (aid === anilistId) return tv;
      if (aid < anilistId) lo = mid + 1; else hi = mid - 1;
    }
    return null;
  }

  private parseAnimeIdsJson(json: string): Pair[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return [];
    }
    const stack: unknown[] = [parsed];
    const visited = new Set<unknown>();
    const pairs = new Map<number, number>();
    const pushChildren = (value: unknown) => {
      if (!value) return;
      if (typeof value !== 'object') return;
      if (visited.has(value)) return;
      stack.push(value);
    };
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === null || current === undefined) continue;
      if (Array.isArray(current)) {
        if (visited.has(current)) continue;
        visited.add(current);
        for (const entry of current) pushChildren(entry);
        continue;
      }
      if (typeof current !== 'object') continue;
      if (visited.has(current)) continue;
      visited.add(current);
      const obj = current as Record<string, unknown>;
      let anilistId: number | null = null;
      let tvdbId: number | null = null;
      for (const [rawKey, rawValue] of Object.entries(obj)) {
        const normalizedKey = rawKey.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const isAnilistKey =
          normalizedKey === 'anilist' ||
          normalizedKey === 'anilistid' ||
          normalizedKey.endsWith('anilistid');
        const isTvdbKey =
          normalizedKey === 'thetvdb' ||
          normalizedKey === 'tvdb' ||
          normalizedKey === 'thetvdbid' ||
          normalizedKey === 'tvdbid' ||
          (normalizedKey.includes('thetvdb') && normalizedKey.endsWith('id')) ||
          (normalizedKey.includes('tvdb') && normalizedKey.endsWith('id') && !normalizedKey.includes('season'));
        if (anilistId === null && isAnilistKey) {
          anilistId = this.coerceId(rawValue);
        } else if (tvdbId === null && isTvdbKey) {
          tvdbId = this.coerceId(rawValue);
        }
        if (rawValue && typeof rawValue === 'object') {
          pushChildren(rawValue);
        }
      }
      if (anilistId !== null && tvdbId !== null) {
        if (!pairs.has(anilistId)) {
          pairs.set(anilistId, tvdbId);
        }
      }
    }
    return Array.from(pairs.entries())
      .map(([anilistId, tvdbId]) => [anilistId, tvdbId] as Pair)
      .sort((a, b) => a[0] - b[0]);
  }
  private coerceId(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === 'bigint') {
      return Number(value);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const parsed = Number.parseInt(trimmed, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if ('id' in obj) {
        return this.coerceId(obj.id);
      }
      if ('value' in obj) {
        return this.coerceId(obj.value);
      }
    }
    return null;
  }

  private buildSearchTerms(
    titles: AniTitles,
    synonyms: string[] | undefined,
    year?: number,
  ): string[] {
    const raw: string[] = [];
    const pushIf = (s?: string) => { if (s && s.trim()) raw.push(s); };

    pushIf(titles?.romaji);
    pushIf(titles?.english);
    if (Array.isArray(synonyms)) for (const s of synonyms) pushIf(s);

    const cleaned = new Set<string>();
    for (const s of raw) {
      const base = stripParenContent(s);
      const nt = normTitle(base);
      if (nt.length >= 3) cleaned.add(base);
    }

    const out: string[] = [];
    for (const base of cleaned) {
      out.push(base);
      if (typeof year === 'number') out.push(`${base} ${year}`);
      out.push(`${base} anime`);
    }

    const uniq: string[] = [];
    const seen = new Set<string>();
    for (const t of out) {
      const key = normTitle(t);
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(t);
      if (uniq.length >= MAX_SYNONYMS * 2) break;
    }
    return uniq;
  }

  private notFound(anilistId: number) {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      `Failed to resolve TVDB ID for AniList ID: ${anilistId}`,
      'Could not find a matching series on TheTVDB. The series may not be listed there yet.',
    );
  }
}
