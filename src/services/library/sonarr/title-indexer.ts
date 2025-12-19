// src/services/library/sonarr/title-indexer.ts
import type { LeanSonarrSeries, TitleIndexer, CheckSeriesStatusPayload } from './types';
import { canonicalizeLookupTerm, computeTitleMatchScore, stripParenContent, sanitizeLookupDisplay } from '@/services/mapping/pipeline/matching';
import { incrementCounter } from '@/shared/utils/metrics';
import { LOCAL_INDEX_ACCEPTANCE_THRESHOLD } from './constants';

export class SonarrTitleIndexer implements TitleIndexer {
  private tvdbSet: Set<number> = new Set();
  private normalizedTitleIndex: Map<string, number | null> = new Map();
  private leanSeriesByTvdbId: Map<number, LeanSonarrSeries> = new Map();

  reset(): void {
    this.tvdbSet.clear();
    this.normalizedTitleIndex.clear();
    this.leanSeriesByTvdbId.clear();
  }

  bulkIndex(list: LeanSonarrSeries[]): void {
    for (const s of list) this.indexSeries(s);
  }

  reindex(list: LeanSonarrSeries[]): void {
    this.reset();
    this.bulkIndex(list);
  }

  findTvdbIdInIndex(payload: CheckSeriesStatusPayload): number | null {
    const candidateInputs = new Set<string>();

    if (payload.title) candidateInputs.add(payload.title);

    const mediaTitles = payload.metadata?.titles;
    if (mediaTitles) {
      const { romaji, english, native } = mediaTitles;
      if (romaji) candidateInputs.add(romaji);
      if (english) candidateInputs.add(english);
      if (native) candidateInputs.add(native);
    }

    if (Array.isArray(payload.metadata?.synonyms)) {
      for (const s of payload.metadata!.synonyms) if (s) candidateInputs.add(s);
    }

    const targetYear = payload.metadata?.startYear ?? undefined;
    let sawAmbiguous = false;
    let bestMatch: { tvdbId: number; score: number } | null = null;

    const scoreAgainstSeries = (rawTitle: string, series: LeanSonarrSeries): number => {
      const sanitizedQuery = sanitizeLookupDisplay(rawTitle);
      const libraryTitles = new Set<string>();
      libraryTitles.add(series.title);
      libraryTitles.add(series.titleSlug);
      if (Array.isArray(series.alternateTitles)) for (const alt of series.alternateTitles) if (alt) libraryTitles.add(alt);

      let top = 0;
      for (const candidateRaw of libraryTitles) {
        if (!candidateRaw) continue;
        const baseArgs = (yr?: number) => (yr !== undefined ? { targetYear: yr } : {});
        const scoreRaw = computeTitleMatchScore({ queryRaw: rawTitle, candidateRaw, ...baseArgs(targetYear) });
        if (scoreRaw > top) top = scoreRaw;
        if (sanitizedQuery && sanitizedQuery !== rawTitle) {
          const scoreSanitized = computeTitleMatchScore({ queryRaw: sanitizedQuery, candidateRaw, ...baseArgs(targetYear) });
          if (scoreSanitized > top) top = scoreSanitized;
        }
      }
      return top;
    };

    for (const rawTitle of candidateInputs) {
      if (!rawTitle) continue;
      const normalizedVariants = this.normalizeTitleCandidates([rawTitle]);
      if (normalizedVariants.length === 0) continue;

      for (const key of normalizedVariants) {
        const match = this.normalizedTitleIndex.get(key);
        if (typeof match === 'number' && this.tvdbSet.has(match)) {
          const series = this.leanSeriesByTvdbId.get(match);
          if (!series) continue;
          const score = scoreAgainstSeries(rawTitle, series);
          if (score >= LOCAL_INDEX_ACCEPTANCE_THRESHOLD) {
            if (!bestMatch || score > bestMatch.score) bestMatch = { tvdbId: match, score };
          }
        } else if (match === null) {
          sawAmbiguous = true;
        }
      }
    }

    if (bestMatch) {
      incrementCounter('library.index.hit');
      return bestMatch.tvdbId;
    }
    if (sawAmbiguous) incrementCounter('library.index.ambiguous');
    else incrementCounter('library.index.miss');

    return null;
  }

  private indexSeries(series: LeanSonarrSeries): void {
    this.tvdbSet.add(series.tvdbId);
    this.leanSeriesByTvdbId.set(series.tvdbId, series);
    const keys = this.buildNormalizedKeysForSeries(series);
    for (const key of keys) {
      const existing = this.normalizedTitleIndex.get(key);
      if (existing === undefined) {
        this.normalizedTitleIndex.set(key, series.tvdbId);
      } else if (existing !== series.tvdbId) {
        this.normalizedTitleIndex.set(key, null);
      }
    }
  }

  private buildNormalizedKeysForSeries(series: LeanSonarrSeries): string[] {
    const rawValues = new Set<string>();
    rawValues.add(series.title);
    rawValues.add(series.titleSlug);
    const slugSpaced = series.titleSlug.replace(/[-_.]+/g, ' ');
    if (slugSpaced !== series.titleSlug) rawValues.add(slugSpaced);
    if (Array.isArray(series.alternateTitles)) for (const t of series.alternateTitles) if (t) rawValues.add(t);
    return this.normalizeTitleCandidates(rawValues);
    }

  private normalizeTitleCandidates(values: Iterable<string | null | undefined>): string[] {
    const out = new Set<string>();
    for (const value of values) {
      if (!value) continue;
      const trimmed = value.trim();
      if (!trimmed) continue;

      const primary = canonicalizeLookupTerm(trimmed);
      if (primary) out.add(primary);

      const sanitized = sanitizeLookupDisplay(trimmed);
      if (sanitized && sanitized !== trimmed) {
        const sanitizedCanonical = canonicalizeLookupTerm(sanitized);
        if (sanitizedCanonical) out.add(sanitizedCanonical);
      }

      const stripped = stripParenContent(trimmed);
      if (stripped && stripped !== trimmed) {
        const strippedCanonical = canonicalizeLookupTerm(stripped);
        if (strippedCanonical) out.add(strippedCanonical);
      }
    }
    return Array.from(out);
  }
}
