// src/shared/utils/validation.ts

/**
 * @file Provides utility functions for validating user input and managing host permissions.
 * Uses Zod for schema validation with type-safe error handling.
 */

import { browser } from "wxt/browser";

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };

function normalizeUrl(input: string): Ok<{ normalized: string; url: URL }> | Err {
  const raw = input.trim();
  if (raw.length === 0) return { ok: false, error: "URL cannot be empty." };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "Invalid URL format." };
  }

  const protocol = parsed.protocol; // already lowercase
  if (protocol !== "http:" && protocol !== "https:") {
    return { ok: false, error: "URL must use http or https." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Credentials in URL are not supported." };
  }
  if (parsed.port) {
    const n = Number.parseInt(parsed.port, 10);
    if (!Number.isFinite(n) || n < 1 || n > 65535) {
      return { ok: false, error: "Invalid port." };
    }
  }

  const pathname = parsed.pathname.replace(/\/+$/, "");
  const normalized = `${parsed.origin}${pathname}`;
  return { ok: true, value: { normalized, url: parsed } };
}

export function validateUrl(url: string): { isValid: boolean; error?: string; normalizedUrl?: string } {
  const r = normalizeUrl(url);
  if (!r.ok) return { isValid: false, error: r.error };
  return { isValid: true, normalizedUrl: r.value.normalized };
}

export function validateApiKey(apiKey: string): { isValid: boolean; error?: string } {
  const v = apiKey.trim();
  if (v.length === 0) return { isValid: false, error: "API key cannot be empty." };
  if (!/^[a-fA-F0-9]{32}$/.test(v)) {
    return { isValid: false, error: "API key must be a 32-character hexadecimal string." };
  }
  return { isValid: true };
}

export function buildSonarrPermissionPattern(input: string): Ok<string> | Err {
  const r = normalizeUrl(input);
  if (!r.ok) return r;
  const { url } = r.value;
  const base = url.pathname.replace(/\/+$/, "") ? `${url.origin}${url.pathname.replace(/\/+$/, "")}` : url.origin;
  return { ok: true, value: `${base}/*` };
}

export async function requestSonarrPermission(url: string): Promise<{ granted: boolean; error?: string }> {
  const pattern = buildSonarrPermissionPattern(url);
  if (!pattern.ok) return { granted: false, error: pattern.error };

  try {
    const granted = await browser.permissions.request({ origins: [pattern.value] });
    return { granted };
  } catch {
    return { granted: false, error: "Failed to construct a valid origin for permission request." };
  }
}

export async function hasSonarrPermission(url: string): Promise<boolean> {
  const pattern = buildSonarrPermissionPattern(url);
  if (!pattern.ok) return false;
  try {
    return await browser.permissions.contains({ origins: [pattern.value] });
  } catch {
    return false;
  }
}
