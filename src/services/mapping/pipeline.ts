// src/services/mapping/pipeline.ts
import { generateSearchTerms } from './search-term-generator';
import { scoreCandidates } from './scoring';
import { maybeEarlyStop, pickBest } from './early-stop';
import type { EvaluationOutcome, MappingContext, AniMedia } from './types';
import { canonicalTitleKey, sanitizeLookupDisplay } from '@/utils/matching';
import { isSeasonalCanonicalTokens } from './search-term-generator';

export async function resolveViaPipeline(media: AniMedia, ctx: MappingContext, primaryTitleHint?: string): Promise<EvaluationOutcome> {
  const mediaYear = media.startDate?.year ?? undefined;
  const terms = generateSearchTerms(media.title ?? ({} as Record<string, never>), media.synonyms);

  if (primaryTitleHint) {
    const trimmed = primaryTitleHint.trim();
    const sanitized = sanitizeLookupDisplay(trimmed);
    if (sanitized) {
      const canonical = canonicalTitleKey(sanitized);
      if (canonical) {
        const canonicalTokens = canonical.split(/\s+/).filter(Boolean);
        if (canonicalTokens.length > 0 && !isSeasonalCanonicalTokens(canonicalTokens)) {
          const existingIndex = terms.findIndex(t => t.canonical === canonical);
          if (existingIndex >= 0) terms.splice(existingIndex, 1);
          terms.unshift({ canonical, display: sanitized });
        }
      }
    }
  }

  let overall: ReturnType<typeof scoreCandidates>[number][] = [];
  const start = Date.now();

  for (const term of terms.slice(0, ctx.limits.maxTerms)) {
    if (!term.canonical) continue;

    const seenInSession = ctx.sessionSeenCanonical.has(term.canonical);
    const results = seenInSession
      ? await ctx.lookupClient.readFromCache(term.canonical)
      : await ctx.lookupClient.lookup(term.canonical, term.display, ctx.credentials);

    const scored = scoreCandidates(term, results, mediaYear);
    overall = overall.concat(scored);

    if (!seenInSession) {
      ctx.sessionSeenCanonical.add(term.canonical);
    }

    const early = maybeEarlyStop(scored, {
      earlyStopThreshold: ctx.limits.earlyStopThreshold,
      scoreThreshold: ctx.limits.scoreThreshold,
    });
    if (early.stop && early.pick) {
      return {
        status: 'resolved',
        tvdbId: early.pick.result.tvdbId,
        confidence: early.pick.score,
        successfulSynonym: early.pick.term.display,
      };
    }

  // Optional soft time budget guard (kept minimal per constraints)
  if (Date.now() - start > 2000) break;
  }

  overall.sort((a, b) => b.score - a.score);
  const pick = pickBest(overall, ctx.limits.scoreThreshold);
  if (pick) {
    return {
      status: 'resolved',
      tvdbId: pick.result.tvdbId,
      confidence: pick.score,
      successfulSynonym: pick.term.display,
    };
  }

  return { status: 'unresolved', reason: 'low-confidence' };
}
