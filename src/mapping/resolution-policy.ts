/** Pure mapping-resolution policy helpers for failure caching and suppression gates. */
// src/mapping/resolution-policy.ts

import type { ExtensionError } from '@/shared/errors';
import { ErrorCode } from '@/shared/errors';
import {
  FAILURE_HARD_TTL,
  FAILURE_SOFT_TTL,
  NETWORK_FAILURE_HARD_TTL,
  NETWORK_FAILURE_SOFT_TTL,
} from './constants';
import type { MappingAcceptedReason, MappingAcceptedSource, ResolveProviderIdOptions } from './types';

export function shouldApplyCandidateSuppression(
  _source: MappingAcceptedSource,
  reason: MappingAcceptedReason,
): boolean {
  // Exact manual and exact upstream mappings are authoritative and must bypass candidate suppression.
  return reason !== 'manual-override' && reason !== 'exact-upstream';
}

export function resolveUnresolvedSearchTerms(
  hints?: ResolveProviderIdOptions['hints'],
): string[] {
  const directTitle = hints?.primaryTitle?.trim();
  if (directTitle) {
    return [directTitle];
  }
  const titles = hints?.domMedia?.titles;
  const metadataTitle = [titles?.english, titles?.romaji, titles?.native]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim();
  return metadataTitle ? [metadataTitle] : [];
}

export function shouldCacheFailure(error: ExtensionError): boolean {
  return (
    error.code === ErrorCode.CONFIGURATION_ERROR ||
    error.code === ErrorCode.NETWORK_ERROR ||
    error.code === ErrorCode.API_ERROR ||
    error.code === ErrorCode.PERMISSION_ERROR ||
    error.code === ErrorCode.SONARR_NOT_CONFIGURED
  );
}

export function failureTtlsFor(error: ExtensionError): { stale: number; hard: number } {
  if (error.code === ErrorCode.NETWORK_ERROR || error.code === ErrorCode.API_ERROR) {
    return { stale: NETWORK_FAILURE_SOFT_TTL, hard: NETWORK_FAILURE_HARD_TTL };
  }
  return { stale: FAILURE_SOFT_TTL, hard: FAILURE_HARD_TTL };
}
