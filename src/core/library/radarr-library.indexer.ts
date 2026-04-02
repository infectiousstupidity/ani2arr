import { incrementCounter } from '@/debug/metrics';
import type { CheckMovieStatusPayload } from '@/rpc/types';
import {
  buildTitleIndexKeysForProvider,
  computeTitleMatchScoreForProvider,
  extractCandidateTitleVariants,
} from '@/services/mapping/pipeline/matching';
import type { RadarrMovieSnapshot } from '@/shared/types/providers';
import { LOCAL_INDEX_ACCEPTANCE_THRESHOLD } from './library.constants';

export class RadarrLibraryIndexer {
  private tmdbSet: Set<number> = new Set();
  private normalizedTitleIndex: Map<string, number | null> = new Map();
  private moviesByTmdbId: Map<number, RadarrMovieSnapshot> = new Map();

  reset(): void {
    this.tmdbSet.clear();
    this.normalizedTitleIndex.clear();
    this.moviesByTmdbId.clear();
  }

  bulkIndex(list: RadarrMovieSnapshot[]): void {
    for (const movie of list) {
      this.indexMovie(movie);
    }
  }

  reindex(list: RadarrMovieSnapshot[]): void {
    this.reset();
    this.bulkIndex(list);
  }

  findTmdbIdInIndex(payload: CheckMovieStatusPayload): number | null {
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
    let bestMatch: { tmdbId: number; score: number } | null = null;

    const scoreAgainstMovie = (rawTitle: string, movie: RadarrMovieSnapshot): number => {
      return computeTitleMatchScoreForProvider({
        provider: 'radarr',
        queryRaw: rawTitle,
        candidate: movie,
        ...(typeof movie.year === 'number' ? { candidateYear: movie.year } : {}),
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
        if (typeof match === 'number' && this.tmdbSet.has(match)) {
          const movie = this.moviesByTmdbId.get(match);
          if (!movie) continue;
          const score = scoreAgainstMovie(rawTitle, movie);
          if (score >= LOCAL_INDEX_ACCEPTANCE_THRESHOLD) {
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { tmdbId: match, score };
            }
          }
        } else if (match === null) {
          sawAmbiguous = true;
        }
      }
    }

    if (bestMatch) {
      incrementCounter('library.index.hit');
      return bestMatch.tmdbId;
    }

    if (sawAmbiguous) incrementCounter('library.index.ambiguous');
    else incrementCounter('library.index.miss');

    return null;
  }

  private indexMovie(movie: RadarrMovieSnapshot): void {
    this.tmdbSet.add(movie.tmdbId);
    this.moviesByTmdbId.set(movie.tmdbId, movie);

    const keys = this.normalizeTitleCandidates(
      extractCandidateTitleVariants('radarr', movie).map(variant => variant.value),
    );

    for (const key of keys) {
      const existing = this.normalizedTitleIndex.get(key);
      if (existing === undefined) {
        this.normalizedTitleIndex.set(key, movie.tmdbId);
      } else if (existing !== movie.tmdbId) {
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
      for (const key of buildTitleIndexKeysForProvider('radarr', trimmed)) {
        if (key) out.add(key);
      }
    }

    return Array.from(out);
  }
}
