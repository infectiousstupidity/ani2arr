// src/services/mapping/pipeline.ts
import { generateSearchTerms, isSeasonalCanonicalTokens } from './search-term-generator';
import { scoreCandidates } from './scoring';
import { maybeEarlyStop, pickBest } from './early-stop';
import type { EvaluationOutcome, EvaluationOutcomeResolved, MappingContext, AniMedia } from '@/types';
import { canonicalTitleKey, sanitizeLookupDisplay } from '@/utils/matching';

export async function resolveViaPipeline(media: AniMedia, ctx: MappingContext, primaryTitleHint?: string): Promise<EvaluationOutcome> {
  if (import.meta.env.DEV) {
    ctx.log.debug?.(
      `pipeline:start anilistId=${media.id} priority=${ctx.priority ?? 'normal'}${primaryTitleHint ? ` hint="${primaryTitleHint}"` : ''}`,
    );
  }
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
    let results;
    if (ctx.forceLookupNetwork) {
      // Always hit network on anime detail force-verify
      const opts = {
        ...(typeof ctx.priority !== 'undefined' ? { priority: ctx.priority } : {}),
        forceNetwork: true as const,
      };
      results = await ctx.lookupClient.lookup(term.canonical, term.display, ctx.credentials, opts);
    } else if (seenInSession) {
      const probe = await ctx.lookupClient.readFromCache(term.canonical);
      if (probe.hit === 'none') {
        const opts = {
          ...(typeof ctx.priority !== 'undefined' ? { priority: ctx.priority } : {}),
        };
        results = await ctx.lookupClient.lookup(term.canonical, term.display, ctx.credentials, opts);
      } else {
        results = probe.results;
      }
    } else {
      const opts = {
        ...(typeof ctx.priority !== 'undefined' ? { priority: ctx.priority } : {}),
      };
      results = await ctx.lookupClient.lookup(term.canonical, term.display, ctx.credentials, opts);
    }

    const scored = scoreCandidates(term, results, mediaYear);
    overall = overall.concat(scored);

    // Mark canonical as seen once we’ve either looked up or confirmed a cache hit
    ctx.sessionSeenCanonical.add(term.canonical);

    const early = maybeEarlyStop(scored, {
      earlyStopThreshold: ctx.limits.earlyStopThreshold,
      scoreThreshold: ctx.limits.scoreThreshold,
    });
    if (early.stop && early.pick) {
      const out: EvaluationOutcomeResolved = {
        status: 'resolved',
        tvdbId: early.pick.result.tvdbId,
        confidence: early.pick.score,
        successfulSynonym: early.pick.term.display,
      };
      if (import.meta.env.DEV) {
        ctx.log.debug?.(
          `pipeline:resolved anilistId=${media.id} tvdbId=${out.tvdbId} confidence=${early.pick.score} synonym="${early.pick.term.display}"`,
        );
      }
      return out;
    }

    // Optional soft time budget guard (kept minimal per constraints)
    if (Date.now() - start > 2000) break;
  }

  overall.sort((a, b) => b.score - a.score);
  const pick = pickBest(overall, ctx.limits.scoreThreshold);
  if (pick) {
    const out: EvaluationOutcomeResolved = {
      status: 'resolved',
      tvdbId: pick.result.tvdbId,
      confidence: pick.score,
      successfulSynonym: pick.term.display,
    };
    if (import.meta.env.DEV) {
      ctx.log.debug?.(
        `pipeline:resolved anilistId=${media.id} tvdbId=${out.tvdbId} confidence=${pick.score} synonym="${pick.term.display}"`,
      );
    }
    return out;
  }

  if (import.meta.env.DEV) {
    ctx.log.debug?.(`pipeline:unresolved anilistId=${media.id} reason=low-confidence`);
  }
  return { status: 'unresolved', reason: 'low-confidence' };
}
