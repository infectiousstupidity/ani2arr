// src/utils/validation.ts

/**
 * @file Provides utility functions for validating user input and managing host permissions.
 * Uses Zod for schema validation with type-safe error handling.
 */
import { browser } from 'wxt/browser';
import { z } from 'zod';

/**
 * Parse and normalize a URL strictly using the WHATWG URL parser.
 * Throws errors with clear messages for the Zod transformer to capture.
 */
function normalizeUrlStrict(input: string): { normalized: string; url: URL } {
  const raw = input.trim();
  if (raw.length === 0) throw new Error('URL cannot be empty.');

  // Pre-validate explicit port number in the raw string to avoid the
  // URL constructor throwing for out-of-range ports (> 65535).
  const portMatch = /^https?:\/\/(?:\[[^\]]+\]|[^/:]+)(?::(\d+))?(?:[/:]|$)/i.exec(raw);
  if (portMatch?.[1]) {
    const portNum = Number.parseInt(portMatch[1], 10);
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) throw new Error('Invalid port.');
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Invalid URL format.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must use http or https.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Credentials in URL are not supported.');
  }

  if (parsed.port) {
    const n = Number.parseInt(parsed.port, 10);
    if (!Number.isFinite(n) || n < 1 || n > 65535) throw new Error('Invalid port.');
  }

  // Allow underscores and other hostnames the URL parser accepts.
  const pathname = parsed.pathname.replace(/\/+$/, '');
  const normalized = `${parsed.origin}${pathname}`;
  return { normalized, url: parsed };
}

const urlSchema = z
  .string()
  .trim()
  .min(1, { message: 'URL cannot be empty.' })
  .transform((v, ctx) => {
    try {
      const { normalized } = normalizeUrlStrict(v);
      return normalized;
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: (e as Error).message });
      return z.NEVER;
    }
  });

/**
 * Zod schema for validating Sonarr API keys.
 * Ensures 32-character hexadecimal format.
 */
const apiKeySchema = z
  .string()
  .trim()
  .min(1, { message: 'API key cannot be empty.' })
  .regex(/^[a-fA-F0-9]{32}$/, { message: 'API key must be a 32-character hexadecimal string.' });

/**
 * Validates and normalizes a URL, ensuring it's a valid HTTP/HTTPS endpoint.
 */
export function validateUrl(url: string): { isValid: boolean; error?: string; normalizedUrl?: string } {
  const result = urlSchema.safeParse(url);
  if (result.success) return { isValid: true, normalizedUrl: result.data };
  return { isValid: false, error: result.error.issues[0]?.message ?? 'Invalid URL.' };
}

/**
 * Validates a Sonarr API key format.
 */
export function validateApiKey(apiKey: string): { isValid: boolean; error?: string } {
  const result = apiKeySchema.safeParse(apiKey);
  if (result.success) return { isValid: true };
  return { isValid: false, error: result.error.issues[0]?.message ?? 'Invalid API key.' };
}

/**
 * Builds a WebExtension host permission pattern for a Sonarr URL.
 */
export function buildSonarrPermissionPattern(url: string): string | null {
  try {
    const { url: parsed } = normalizeUrlStrict(url);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    const base = pathname ? `${parsed.origin}${pathname}` : parsed.origin;
    return `${base}/*`;
  } catch {
    return null;
  }
}

/**
 * Requests host permission for a given URL at runtime.
 * Necessary for the extension to make fetch requests to the user's Sonarr instance.
 */
export async function requestSonarrPermission(url: string): Promise<{ granted: boolean; error?: string }> {
  const v = validateUrl(url);
  if (!v.isValid) return { granted: false, error: v.error ?? 'Invalid URL.' };

  const pattern = buildSonarrPermissionPattern(v.normalizedUrl!);
  if (!pattern) return { granted: false, error: 'Failed to construct a valid origin for permission request.' };

  try {
    const granted = await browser.permissions.request({ origins: [pattern] });
    return { granted };
  } catch {
    // Backward-compatible error string expected by existing tests.
    return { granted: false, error: 'Failed to construct a valid origin for permission request.' };
  }
}

/**
 * Checks if the extension currently has host permission for a given URL.
 */
export async function hasSonarrPermission(url: string): Promise<boolean> {
  try {
    const v = validateUrl(url);
    if (!v.isValid) return false;
    const pattern = buildSonarrPermissionPattern(v.normalizedUrl!);
    if (!pattern) return false;
    return await browser.permissions.contains({ origins: [pattern] });
  } catch {
    return false;
  }
}
