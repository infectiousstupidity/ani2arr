import type { CheckMovieStatusPayload, LeanRadarrMovie, TitleIndexer } from './types';
import { canonicalizeLookupTerm, computeTitleMatchScore, stripParenContent, sanitizeLookupDisplay } from '@/services/mapping/pipeline/matching';
import { incrementCounter } from '@/shared/utils/metrics';
import { LOCAL_INDEX_ACCEPTANCE_THRESHOLD } from './constants';

export class RadarrTitleIndexer implements TitleIndexer {
  private tmdbSet: Set<number> = new Set();
  private normalizedTitleIndex: Map<string, number | null> = new Map();
  private leanMovieByTmdbId: Map<number, LeanRadarrMovie> = new Map();

  reset(): void {
    this.tmdbSet.clear();
    this.normalizedTitleIndex.clear();
    this.leanMovieByTmdbId.clear();
  }

  bulkIndex(list: LeanRadarrMovie[]): void {
    for (const movie of list) this.indexMovie(movie);
  }

  reindex(list: LeanRadarrMovie[]): void {
    this.reset();
    this.bulkIndex(list);
  }

  findTmdbIdInIndex(payload: CheckMovieStatusPayload): number | null {
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
      for (const synonym of payload.metadata.synonyms) if (synonym) candidateInputs.add(synonym);
    }

    const targetYear = payload.metadata?.startYear ?? undefined;
    let sawAmbiguous = false;
    let bestMatch: { tmdbId: number; score: number } | null = null;

    const scoreAgainstMovie = (rawTitle: string, movie: LeanRadarrMovie): number => {
      const sanitizedQuery = sanitizeLookupDisplay(rawTitle);
      const libraryTitles = new Set<string>();
      libraryTitles.add(movie.title);
      if (movie.titleSlug) libraryTitles.add(movie.titleSlug);
      if (movie.sortTitle) libraryTitles.add(movie.sortTitle);
      if (movie.originalTitle) libraryTitles.add(movie.originalTitle);
      if (movie.folderName) libraryTitles.add(movie.folderName);
      if (Array.isArray(movie.alternateTitles)) for (const alt of movie.alternateTitles) if (alt) libraryTitles.add(alt);

      let top = 0;
      for (const candidateRaw of libraryTitles) {
        if (!candidateRaw) continue;
        const baseArgs = (year?: number) => (year !== undefined ? { targetYear: year } : {});
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
        if (typeof match === 'number' && this.tmdbSet.has(match)) {
          const movie = this.leanMovieByTmdbId.get(match);
          if (!movie) continue;
          const score = scoreAgainstMovie(rawTitle, movie);
          if (score >= LOCAL_INDEX_ACCEPTANCE_THRESHOLD) {
            if (!bestMatch || score > bestMatch.score) bestMatch = { tmdbId: match, score };
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

  private indexMovie(movie: LeanRadarrMovie): void {
    this.tmdbSet.add(movie.tmdbId);
    this.leanMovieByTmdbId.set(movie.tmdbId, movie);
    const keys = this.buildNormalizedKeysForMovie(movie);
    for (const key of keys) {
      const existing = this.normalizedTitleIndex.get(key);
      if (existing === undefined) {
        this.normalizedTitleIndex.set(key, movie.tmdbId);
      } else if (existing !== movie.tmdbId) {
        this.normalizedTitleIndex.set(key, null);
      }
    }
  }

  private buildNormalizedKeysForMovie(movie: LeanRadarrMovie): string[] {
    const rawValues = new Set<string>();
    rawValues.add(movie.title);
    if (movie.titleSlug) {
      rawValues.add(movie.titleSlug);
      const slugSpaced = movie.titleSlug.replace(/[-_.]+/g, ' ');
      if (slugSpaced !== movie.titleSlug) rawValues.add(slugSpaced);
    }
    if (movie.sortTitle) rawValues.add(movie.sortTitle);
    if (movie.originalTitle) rawValues.add(movie.originalTitle);
    if (movie.folderName) rawValues.add(movie.folderName);
    if (Array.isArray(movie.alternateTitles)) for (const value of movie.alternateTitles) if (value) rawValues.add(value);
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
