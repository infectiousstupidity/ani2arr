/** Hint-based mapping lookup helper for fast title probes outside the full pipeline. */
// src/services/mapping/hints/hint-lookup.ts

import {
  canonicalTitleKeyForProvider,
  sanitizeLookupDisplayForProvider,
} from '@/services/mapping/pipeline/matching';
import { scoreCandidates } from '../pipeline/scoring';
import { isSeasonalCanonicalTokens } from '../pipeline/search-term-generator';
import type { ResolvedMapping } from '../types';
import type { ScopedLogger } from '@/shared/utils/logger';
import type { ProviderCredentials } from '@/providers';
import { SCORE_THRESHOLD } from '../constants';
import type { ProviderLookupClient, ProviderLookupResult } from '../lookup';

export async function tryHintLookup<TResult extends ProviderLookupResult>(
  term: string,
  lookupClient: ProviderLookupClient<ProviderCredentials, TResult>,
  credentials: ProviderCredentials,
  log: ScopedLogger,
  forceLookupNetwork?: boolean,
): Promise<ResolvedMapping | null> {
  const provider = lookupClient.provider;
  const trimmed = term.trim();
  const sanitized = sanitizeLookupDisplayForProvider(provider, trimmed);
  if (!sanitized) {
    log.debug?.(`mapping:hint-skip empty after sanitize raw="${term}"`);
    return null;
  }

  const canonical = canonicalTitleKeyForProvider(provider, sanitized) ?? '';
  const canonicalTokens = canonical.split(/\s+/).filter(Boolean);
  if (canonicalTokens.length === 0 || isSeasonalCanonicalTokens(canonicalTokens)) {
    log.debug?.(`mapping:hint-skip seasonal/empty canonical="${canonical}" raw="${sanitized}"`);
    return null;
  }

  const results = await lookupClient.lookup(canonical, sanitized, credentials, {
    ...(forceLookupNetwork ? { forceNetwork: true } : {}),
  });
  const scored = scoreCandidates(provider, { canonical, display: sanitized }, results);
  const top = scored[0];
  if (top && top.score >= SCORE_THRESHOLD) {
    const externalId = lookupClient.getExternalId(top.result);
    if (externalId === null) {
      return null;
    }
    log.debug?.(
      `mapping:hint-hit canonical="${canonical}" ${lookupClient.externalIdKind}Id=${externalId} score=${top.score} synonym="${sanitized}"`,
    );
    return {
      externalId: { id: externalId, kind: lookupClient.externalIdKind },
      successfulSynonym: sanitized,
    };
  }
  log.debug?.(
    `mapping:hint-miss canonical="${canonical}" raw="${sanitized}" results=${results.length} topScore=${top?.score ?? 'n/a'}`,
  );
  return null;
}
