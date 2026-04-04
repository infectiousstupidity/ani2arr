/** Mapping pipeline execution for provider lookups, scoring, and final candidate selection. */
// src/services/mapping/pipeline/pipeline.ts

import { generateSearchTerms, isSeasonalCanonicalTokens } from './search-term-generator';
import { scoreCandidates } from './scoring';
import { maybeEarlyStop, pickBest } from './early-stop';
import type { EvaluationOutcome, AniListMedia } from './types';
import {
  canonicalTitleKeyForProvider,
  sanitizeLookupDisplayForProvider,
} from '@/services/mapping/pipeline/matching';
import { PIPELINE_SOFT_TIME_BUDGET_MS } from '../constants';
import type { UpstreamMappingStore } from '../upstream';
import type { ScopedLogger } from '@/shared/utils/logger';
import type { RequestPriority } from '@/shared/utils/request-priority';
import type { AniListMediaService } from '@/core/anilist';
import type { ProviderCredentials } from '@/providers';
import type { ProviderLookupClient, ProviderLookupResult } from '../lookup';


export async function resolveViaPipeline(
  media: AniListMedia,
  ctx: {
    anilistApi: AniListMediaService;
    lookupClient: ProviderLookupClient<ProviderCredentials, ProviderLookupResult>;
    upstreamMappingStore: UpstreamMappingStore;
    credentials: ProviderCredentials;
    priority?: RequestPriority;
    forceLookupNetwork?: boolean;
    sessionSeenCanonical: Set<string>;
    limits: {
      maxTerms: number;
      scoreThreshold: number;
      earlyStopThreshold: number;
    };
    log: ScopedLogger;
  },
  primaryTitleHint?: string,
): Promise<EvaluationOutcome> {
  if (import.meta.env.DEV) {
    ctx.log.debug?.(
      `pipeline:start anilistId=${media.id} priority=${ctx.priority ?? 'normal'}${primaryTitleHint ? ` hint="${primaryTitleHint}"` : ''}`,
    );
  }
  const mediaYear = media.startDate?.year ?? undefined;
  const provider = ctx.lookupClient.provider;
  const terms = generateSearchTerms(provider, media.title ?? ({} as Record<string, never>), media.synonyms);

  if (primaryTitleHint) {
    const trimmed = primaryTitleHint.trim();
    const sanitized = sanitizeLookupDisplayForProvider(provider, trimmed);
    if (sanitized) {
      const canonical = canonicalTitleKeyForProvider(provider, sanitized);
      if (canonical) {
        const canonicalTokens = canonical.split(/\s+/).filter(Boolean);
        if (canonicalTokens.length > 0 && !isSeasonalCanonicalTokens(canonicalTokens)) {
          const existingIndex = terms.findIndex(t => t.canonical === canonical);
          if (existingIndex !== -1) terms.splice(existingIndex, 1);
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
        ...(ctx.priority === undefined ? {} : { priority: ctx.priority }),
        forceNetwork: true as const,
      };
      results = await ctx.lookupClient.lookup(term.canonical, term.display, ctx.credentials, opts);
    } else if (seenInSession) {
      const probe = await ctx.lookupClient.readFromCache(term.canonical);
      if (probe.hit === 'none') {
        const opts = {
          ...(ctx.priority === undefined ? {} : { priority: ctx.priority }),
        };
        results = await ctx.lookupClient.lookup(term.canonical, term.display, ctx.credentials, opts);
      } else {
        results = probe.results;
      }
    } else {
      const opts = {
        ...(ctx.priority === undefined ? {} : { priority: ctx.priority }),
      };
      results = await ctx.lookupClient.lookup(term.canonical, term.display, ctx.credentials, opts);
    }

    const scored = scoreCandidates(provider, term, results, mediaYear);
    overall = [...overall, ...scored];

    // Mark canonical as seen once we've either looked up or confirmed a cache hit
    ctx.sessionSeenCanonical.add(term.canonical);

    const early = maybeEarlyStop(scored, {
      earlyStopThreshold: ctx.limits.earlyStopThreshold,
      scoreThreshold: ctx.limits.scoreThreshold,
    });
    if (early.stop && early.pick) {
      const externalId = ctx.lookupClient.getExternalId(early.pick.result);
      if (externalId === null) {
        continue;
      }
      const out: EvaluationOutcome = {
        status: 'resolved',
        externalId,
        confidence: early.pick.score,
        successfulSynonym: early.pick.term.display,
      };
      if (import.meta.env.DEV) {
        ctx.log.debug?.(
          `pipeline:resolved anilistId=${media.id} ${ctx.lookupClient.externalIdKind}Id=${out.externalId} confidence=${early.pick.score} synonym="${early.pick.term.display}"`,
        );
      }
      return out;
    }

    // Optional soft time budget guard (kept minimal per constraints)
    if (Date.now() - start > PIPELINE_SOFT_TIME_BUDGET_MS) break;
  }

  overall.sort((a, b) => b.score - a.score);
  const pick = pickBest(overall, ctx.limits.scoreThreshold);
  if (pick) {
    const externalId = ctx.lookupClient.getExternalId(pick.result);
    if (externalId === null) {
      return { status: 'unresolved', reason: 'missing-external-id' };
    }
    const out: EvaluationOutcome = {
      status: 'resolved',
      externalId,
      confidence: pick.score,
      successfulSynonym: pick.term.display,
    };
    if (import.meta.env.DEV) {
      ctx.log.debug?.(
        `pipeline:resolved anilistId=${media.id} ${ctx.lookupClient.externalIdKind}Id=${out.externalId} confidence=${pick.score} synonym="${pick.term.display}"`,
      );
    }
    return out;
  }

  if (import.meta.env.DEV) {
    ctx.log.debug?.(`pipeline:unresolved anilistId=${media.id} reason=low-confidence`);
  }
  return { status: 'unresolved', reason: 'low-confidence' };
}
