/** Pure helpers to extract provider credentials and configured state from ExtensionOptions. */
// src/options/provider-config.ts

import type { Provider, ProviderCredentials } from '@/providers';
import type { ExtensionOptions } from './types';

/**
 * Extract trimmed credentials for a provider, or `null` if either field is missing/empty.
 * Pure derivation — no side effects, no throws.
 */
export function getProviderCredentials(
  settings: ExtensionOptions | undefined,
  provider: Provider,
): ProviderCredentials | null {
  const config = settings?.providers[provider];
  const url = config?.url?.trim();
  const apiKey = config?.apiKey?.trim();
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

/** Convenience boolean: is the provider fully configured in the given settings? */
export function isProviderConfigured(
  settings: ExtensionOptions | undefined,
  provider: Provider,
): boolean {
  return getProviderCredentials(settings, provider) !== null;
}
