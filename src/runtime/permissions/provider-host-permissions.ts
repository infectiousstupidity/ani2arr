/** Browser host-permission helpers for validated provider connection URLs. */
// src/runtime/permissions/provider-host-permissions.ts

import { browser } from 'wxt/browser';
import {
  normalizeProviderConnectionUrl,
  type ProviderConnectionResult,
} from '@/shared/schemas/providers/provider-connection.schema';

export function getProviderHostPermissionPattern(url: string): ProviderConnectionResult<string> {
  const normalized = normalizeProviderConnectionUrl(url);
  if (!normalized.ok) {
    return normalized;
  }

  return { ok: true, value: `${normalized.value.normalizedUrl}/*` };
}

export async function requestProviderHostPermission(
  url: string,
): Promise<ProviderConnectionResult<{ pattern: string; granted: boolean }>> {
  const pattern = getProviderHostPermissionPattern(url);
  if (!pattern.ok) {
    return pattern;
  }

  try {
    const granted = await browser.permissions.request({ origins: [pattern.value] });
    return { ok: true, value: { pattern: pattern.value, granted } };
  } catch {
    return {
      ok: false,
      error: `Permission request for origin '${pattern.value}' failed unexpectedly.`,
    };
  }
}

export async function hasProviderHostPermission(
  url: string,
): Promise<ProviderConnectionResult<boolean>> {
  const pattern = getProviderHostPermissionPattern(url);
  if (!pattern.ok) {
    return pattern;
  }

  try {
    return {
      ok: true,
      value: await browser.permissions.contains({ origins: [pattern.value] }),
    };
  } catch {
    return {
      ok: false,
      error: `Permission check for origin '${pattern.value}' failed unexpectedly.`,
    };
  }
}

export async function removeProviderHostPermission(
  url: string,
): Promise<ProviderConnectionResult<{ pattern: string; removed: boolean }>> {
  const pattern = getProviderHostPermissionPattern(url);
  if (!pattern.ok) {
    return pattern;
  }

  try {
    return {
      ok: true,
      value: {
        pattern: pattern.value,
        removed: await browser.permissions.remove({ origins: [pattern.value] }),
      },
    };
  } catch {
    return {
      ok: false,
      error: `Permission removal for origin '${pattern.value}' failed unexpectedly.`,
    };
  }
}
