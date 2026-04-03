/** Sonarr title index used for fast local AniList-to-TVDB matching. */
// src/core/library/sonarr-library.indexer.ts

import { incrementCounter } from '@/debug/metrics';
import type { StatusInput } from '@/rpc/schemas';
import {
  buildTitleIndexKeysForProvider,
  computeTitleMatchScoreForProvider,
  extractCandidateTitleVariants,
} from '@/services/mapping/pipeline/matching';
import type { SonarrSeriesSnapshot } from '@/shared/types/providers';
import { LOCAL_INDEX_ACCEPTANCE_THRESHOLD } from './library.constants';

export class SonarrLibraryIndexer {
  private tvdbSet: Set<number> = new Set();
  private normalizedTitleIndex: Map<string, number | null> = new Map();
  private seriesByTvdbId: Map<number, SonarrSeriesSnapshot> = new Map();

  reset(): void {
    this.tvdbSet.clear();
    this.normalizedTitleIndex.clear();
    this.seriesByTvdbId.clear();
  }

  bulkIndex(list: SonarrSeriesSnapshot[]): void {
    for (const series of list) {
      this.indexSeries(series);
    }
  }

  reindex(list: SonarrSeriesSnapshot[]): void {
    this.reset();
    this.bulkIndex(list);
  }

  findTvdbIdInIndex(payload: Pick<StatusInput, 'title' | 'metadata'>): number | null {
    const candidateInputs = new Set<string>();

    if (payload.title) candidateInputs.add(payload.title);

    const mediaTitles = payload.metadata?.titles;
    if (mediaTitles) {
      if (mediaTitles.romaji) candidateInputs.add(mediaTitles.romaji);
      if (mediaTitles.english) candidateInputs.add(mediaTitles.english);
      if (mediaTitles.native) candidateInputs.add(mediaTitles.native);
    }

    if (Array.isArray(payload.metadata?.synonyms)) {
      for (const synonym of payload.metadata.synonyms) {
        if (synonym) candidateInputs.add(synonym);
      }
    }

    const targetYear = payload.metadata?.startYear ?? undefined;
    let sawAmbiguous = false;
    let bestMatch: { tvdbId: number; score: number } | null = null;

    const scoreAgainstSeries = (rawTitle: string, series: SonarrSeriesSnapshot): number => {
      return computeTitleMatchScoreForProvider({
        provider: 'sonarr',
        queryRaw: rawTitle,
        candidate: series,
        ...(typeof targetYear === 'number' ? { targetYear } : {}),
        candidateCount: 1,
      });
    };

    for (const rawTitle of candidateInputs) {
      if (!rawTitle) continue;
      const normalizedVariants = this.normalizeTitleCandidates([rawTitle]);
      if (normalizedVariants.length === 0) continue;

      for (const key of normalizedVariants) {
        const match = this.normalizedTitleIndex.get(key);
        if (typeof match === 'number' && this.tvdbSet.has(match)) {
          const series = this.seriesByTvdbId.get(match);
          if (!series) continue;
          const score = scoreAgainstSeries(rawTitle, series);
          if (score >= LOCAL_INDEX_ACCEPTANCE_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { tvdbId: match, score };
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

  private indexSeries(series: SonarrSeriesSnapshot): void {
    this.tvdbSet.add(series.tvdbId);
    this.seriesByTvdbId.set(series.tvdbId, series);

    const keys = this.normalizeTitleCandidates(
      extractCandidateTitleVariants('sonarr', series).map(variant => variant.value),
    );

    for (const key of keys) {
      const existing = this.normalizedTitleIndex.get(key);
      if (existing === undefined) {
        this.normalizedTitleIndex.set(key, series.tvdbId);
      } else if (existing !== series.tvdbId) {
        this.normalizedTitleIndex.set(key, null);
      }
    }
  }

  private normalizeTitleCandidates(values: Iterable<string | null | undefined>): string[] {
    const out = new Set<string>();

    for (const value of values) {
      if (!value) continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      for (const key of buildTitleIndexKeysForProvider('sonarr', trimmed)) {
        if (key) out.add(key);
      }
    }

    return [...out];
  }
}
