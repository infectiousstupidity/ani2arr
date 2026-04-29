/** Pure mapping-resolution policy helpers for failure caching and suppression gates. */
// src/mapping/resolution-policy.ts

import type { ExtensionError } from '@/shared/errors';
import { ErrorCode } from '@/shared/errors';
import type { AcceptedMappingReason, AcceptedMappingSource } from './types';
import type { AutoMappingOptions } from './auto-mapping/types';

export function shouldApplyCandidateSuppression(
  _source: AcceptedMappingSource,
  reason: AcceptedMappingReason,
): boolean {
  // Exact manual and exact upstream mappings are authoritative and must bypass candidate suppression.
  return reason !== 'manual-override' && reason !== 'exact-upstream';
}

export function resolveUnresolvedSearchTerms(
  hints?: AutoMappingOptions['hints'],
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
