// src/shared/sonarr/validation.ts

import {
  buildArrPermissionPattern,
  hasArrPermission,
  requestArrPermission,
  type Err,
  type Ok,
  validateArrApiKey,
  validateArrUrl,
} from '@/shared/arr/validation';

export function validateUrl(url: string): { isValid: boolean; error?: string; normalizedUrl?: string } {
  return validateArrUrl(url);
}

export function validateApiKey(apiKey: string): { isValid: boolean; error?: string } {
  return validateArrApiKey(apiKey);
}

export function buildSonarrPermissionPattern(input: string): Ok<string> | Err {
  return buildArrPermissionPattern(input);
}

export async function requestSonarrPermission(url: string): Promise<{ granted: boolean; error?: string }> {
  return requestArrPermission(url);
}

export async function hasSonarrPermission(url: string): Promise<boolean> {
  return hasArrPermission(url);
}
