import { browser } from 'wxt/browser';
import * as v from 'valibot';

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: string };

const nonEmptyUrlSchema = v.pipe(
  v.string(),
  v.nonEmpty('URL cannot be empty.'),
);

const apiKeySchema = v.pipe(
  v.string(),
  v.nonEmpty('API key cannot be empty.'),
);

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, '');
}

function buildBaseUrl(url: URL): string {
  const path = normalizePathname(url.pathname);
  return path ? `${url.origin}${path}` : url.origin;
}

function normalizeUrl(input: string): Ok<{ normalized: string; url: URL }> | Err {
  const raw = input.trim();
  const parsedResult = v.safeParse(nonEmptyUrlSchema, raw);
  if (!parsedResult.success) {
    const first = parsedResult.issues?.[0];
    return { ok: false, error: (first && String(first.message)) || 'URL cannot be empty.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: 'Invalid URL format.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'URL must use http or https.' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Credentials in URL are not supported.' };
  }

  if (parsed.port) {
    const n = Number.parseInt(parsed.port, 10);
    if (!Number.isFinite(n) || n < 1 || n > 65535) {
      return { ok: false, error: 'Invalid port.' };
    }
  }

  const normalizedPath = normalizePathname(parsed.pathname);
  const normalized = `${parsed.origin}${normalizedPath}`;

  return { ok: true, value: { normalized, url: parsed } };
}

export function validateArrUrl(url: string): { isValid: boolean; error?: string; normalizedUrl?: string } {
  const result = normalizeUrl(url);
  if (!result.ok) return { isValid: false, error: result.error };
  return { isValid: true, normalizedUrl: result.value.normalized };
}

export function validateArrApiKey(apiKey: string): { isValid: boolean; error?: string } {
  const parsed = v.safeParse(apiKeySchema, apiKey.trim());
  if (!parsed.success) {
    const first = parsed.issues?.[0];
    return { isValid: false, error: (first && String(first.message)) || 'Invalid API key.' };
  }
  return { isValid: true };
}

export function buildArrPermissionPattern(input: string): Ok<string> | Err {
  const result = normalizeUrl(input);
  if (!result.ok) return result;
  return { ok: true, value: `${buildBaseUrl(result.value.url)}/*` };
}

export async function requestArrPermission(url: string): Promise<{ granted: boolean; error?: string }> {
  const pattern = buildArrPermissionPattern(url);
  if (!pattern.ok) return { granted: false, error: pattern.error };

  try {
    const granted = await browser.permissions.request({ origins: [pattern.value] });
    return { granted };
  } catch {
    return { granted: false, error: `Permission request for origin '${pattern.value}' failed unexpectedly.` };
  }
}

export async function hasArrPermission(url: string): Promise<boolean> {
  const pattern = buildArrPermissionPattern(url);
  if (!pattern.ok) return false;

  try {
    return await browser.permissions.contains({ origins: [pattern.value] });
  } catch {
    return false;
  }
}
