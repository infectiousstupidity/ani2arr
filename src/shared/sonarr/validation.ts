// src/shared/sonarr/validation.ts

/**
 * @file Provides utility functions for validating user input and managing host permissions.
 * Uses Valibot for schema validation with type-safe error handling.
 */

import { browser } from "wxt/browser";
import * as v from "valibot";

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };

// Schemas

const nonEmptyUrlSchema = v.pipe(
  v.string(),
  v.nonEmpty("URL cannot be empty.")
);

const apiKeySchema = v.pipe(
  v.string(),
  v.nonEmpty("API key cannot be empty."),
  v.regex(/^[a-fA-F0-9]{32}$/, "API key must be a 32-character hexadecimal string.")
);

// Helpers

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed;
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
    return { ok: false, error: (first && String(first.message)) || "URL cannot be empty." };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "Invalid URL format." };
  }

  const protocol = parsed.protocol;
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

  const normalizedPath = normalizePathname(parsed.pathname);
  const normalized = `${parsed.origin}${normalizedPath}`;

  return { ok: true, value: { normalized, url: parsed } };
}

// Public API

export function validateUrl(url: string): { isValid: boolean; error?: string; normalizedUrl?: string } {
  const r = normalizeUrl(url);
  if (!r.ok) return { isValid: false, error: r.error };
  return { isValid: true, normalizedUrl: r.value.normalized };
}

export function validateApiKey(apiKey: string): { isValid: boolean; error?: string } {
  const parsed = v.safeParse(apiKeySchema, apiKey.trim());
  if (!parsed.success) {
    const first = parsed.issues?.[0];
    return { isValid: false, error: (first && String(first.message)) || "Invalid API key." };
  }
  return { isValid: true };
}

export function buildSonarrPermissionPattern(input: string): Ok<string> | Err {
  const r = normalizeUrl(input);
  if (!r.ok) return r;

  const { url } = r.value;
  const base = buildBaseUrl(url);
  return { ok: true, value: `${base}/*` };
}

export async function requestSonarrPermission(url: string): Promise<{ granted: boolean; error?: string }> {
  const pattern = buildSonarrPermissionPattern(url);
  if (!pattern.ok) return { granted: false, error: pattern.error };

  try {
    const granted = await browser.permissions.request({ origins: [pattern.value] });
    return { granted };
  } catch {
    return { granted: false, error: `Permission request for origin '${pattern.value}' failed unexpectedly.` };
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
