import type { SonarrLookupCredentials } from '../sonarr-lookup.client';
import type { SonarrLookupClient } from '../sonarr-lookup.client';
import { canonicalTitleKey, sanitizeLookupDisplay } from '@/shared/utils/matching';
import { scoreCandidates } from '../pipeline/scoring';
import { isSeasonalCanonicalTokens } from '../pipeline/search-term-generator';
import type { ResolvedMapping } from '../types';
import type { ScopedLogger } from '@/shared/utils/logger';
import { SCORE_THRESHOLD } from '../constants';

export async function tryHintLookup(
  term: string,
  lookupClient: SonarrLookupClient,
  credentials: SonarrLookupCredentials,
  log: ScopedLogger,
  forceLookupNetwork?: boolean,
): Promise<ResolvedMapping | null> {
  const trimmed = term.trim();
  const sanitized = sanitizeLookupDisplay(trimmed);
  if (!sanitized) {
    log.debug?.(`mapping:hint-skip empty after sanitize raw="${term}"`);
    return null;
  }

  const canonical = canonicalTitleKey(sanitized) ?? '';
  const canonicalTokens = canonical.split(/\s+/).filter(Boolean);
  if (canonicalTokens.length === 0 || isSeasonalCanonicalTokens(canonicalTokens)) {
    log.debug?.(`mapping:hint-skip seasonal/empty canonical="${canonical}" raw="${sanitized}"`);
    return null;
  }

  const results = await lookupClient.lookup(canonical, sanitized, credentials, {
    ...(forceLookupNetwork ? { forceNetwork: true } : {}),
  });
  const scored = scoreCandidates({ canonical, display: sanitized }, results);
  const top = scored[0];
  if (top && top.score >= SCORE_THRESHOLD) {
    log.debug?.(
      `mapping:hint-hit canonical="${canonical}" tvdbId=${top.result.tvdbId} score=${top.score} synonym="${sanitized}"`,
    );
    return { tvdbId: top.result.tvdbId, successfulSynonym: sanitized };
  }
  log.debug?.(
    `mapping:hint-miss canonical="${canonical}" raw="${sanitized}" results=${results.length} topScore=${top?.score ?? 'n/a'}`,
  );
  return null;
}
