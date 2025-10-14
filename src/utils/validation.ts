// src/utils/validation.ts

/**
 * @file Provides utility functions for validating user input and managing host permissions.
 * These are pure functions, ensuring they are testable and have no side effects.
 */
import { browser } from 'wxt/browser';

/**
 * Validates and normalizes a URL, ensuring it's a valid HTTP/HTTPS endpoint.
 * @param url The URL string to validate.
 * @returns An object indicating validity, an error message, and the normalized URL.
 */
export function validateUrl(url: string): { isValid: boolean; error?: string; normalizedUrl?: string } {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL is required.' };
  }

  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    return { isValid: false, error: 'URL cannot be empty.' };
  }

  // Quickly detect explicit port and validate range before URL parsing (handles >65535 which can throw)
  const portMatch = /^https?:\/\/(?:\[[^\]]+\]|[^\/:]+)(?::(?<port>\d+))?(?:[\/:]|$)/i.exec(trimmedUrl);
  if (portMatch?.groups?.port) {
    const portNum = Number.parseInt(portMatch.groups.port, 10);
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      return { isValid: false, error: 'Invalid port.' };
    }
  }

  try {
    const urlObj = new URL(trimmedUrl);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { isValid: false, error: 'URL must use http or https.' };
    }

    // Disallow embedded credentials (userinfo) in URLs
    if ((urlObj.username && urlObj.username.length > 0) || (urlObj.password && urlObj.password.length > 0)) {
      return { isValid: false, error: 'Credentials in URL are not supported.' };
    }

    // Validate explicit port range when present
    if (urlObj.port) {
      const portNum = Number.parseInt(urlObj.port, 10);
      if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
        return { isValid: false, error: 'Invalid port.' };
      }
    }

    const hostname = urlObj.hostname;
    if (!hostname) {
      return { isValid: false, error: 'Invalid hostname.' };
    }

    const isIpv6Literal = hostname.startsWith('[') && hostname.endsWith(']');
    const normalizedHostname = isIpv6Literal ? hostname.slice(1, -1) : hostname;

    const hostnameLabelRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
    const hostnameSegments = normalizedHostname.split('.');
    const looksLikeIpv4 = hostnameSegments.length === 4 && hostnameSegments.every(part => /^\d+$/.test(part));
    const isIpv4Address = looksLikeIpv4
      ? hostnameSegments.every(part => {
          if (!/^\d{1,3}$/.test(part)) return false;
          const value = Number.parseInt(part, 10);
          return value >= 0 && value <= 255;
        })
      : false;

    const hasValidHostnameLabels =
      !isIpv6Literal &&
      hostnameSegments.every(segment => segment.length > 0 && hostnameLabelRegex.test(segment));

    const isIpv6Address = isIpv6Literal && /^[0-9a-f:.]+$/i.test(normalizedHostname);
    const isValidHostname =
      isIpv4Address ||
      isIpv6Address ||
      (hasValidHostnameLabels && (!looksLikeIpv4 || isIpv4Address));

    if (!isValidHostname) {
      return { isValid: false, error: 'Invalid hostname.' };
    }

    const normalizedUrl = urlObj.toString().replace(/\/$/, '');
    return { isValid: true, normalizedUrl };
  } catch {
    return { isValid: false, error: 'Invalid URL format.' };
  }
}

/**
 * Validates a Sonarr API key format.
 * @param apiKey The API key string to validate.
 * @returns An object indicating validity and an error message.
 */
export function validateApiKey(apiKey: string): { isValid: boolean; error?: string } {
  if (!apiKey || typeof apiKey !== 'string') {
    return { isValid: false, error: 'API key is required.' };
  }
  const trimmedKey = apiKey.trim();
  if (trimmedKey.length === 0) {
    return { isValid: false, error: 'API key cannot be empty.' };
  }
  if (trimmedKey.length !== 32 || !/^[a-fA-F0-9]{32}$/.test(trimmedKey)) {
    return { isValid: false, error: 'API key must be a 32-character hexadecimal string.' };
  }
  return { isValid: true };
}

/**
 * A basic input sanitizer to remove potentially harmful characters.
 * @param input The string to sanitize.
 * @returns A sanitized string.
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  // Strips characters that could be used to break out of HTML attributes or create script tags.
  return input.trim().replace(/[<>"'&/]/g, '');
}

/**
 * Builds a WebExtension host permission pattern for a Sonarr URL.
 * @param url The Sonarr URL to convert into a permission pattern.
 * @returns The permission pattern or null when the URL cannot be parsed.
 */
export function buildSonarrPermissionPattern(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const normalizedPath = urlObj.pathname.replace(/\/+$/, '');
    const finalPath = normalizedPath.length > 0 && normalizedPath !== '/' ? normalizedPath : '';
    return `${urlObj.origin}${finalPath}/*`;
  } catch {
    return null;
  }
}

/**
 * Requests host permission for a given URL at runtime.
 * This is necessary for the extension to make fetch requests to the user's Sonarr instance.
 * @param url The URL for which to request permission.
 * @returns A promise resolving to an object indicating if permission was granted.
 */
export async function requestSonarrPermission(url: string): Promise<{ granted: boolean; error?: string }> {
  const validation = validateUrl(url);
  if (!validation.isValid) {
    return validation.error !== undefined
      ? { granted: false, error: validation.error }
      : { granted: false };
  }
  try {
    const permissionPattern = buildSonarrPermissionPattern(validation.normalizedUrl!);
    if (!permissionPattern) {
      return { granted: false, error: 'Failed to construct a valid origin for permission request.' };
    }
    const granted = await browser.permissions.request({ origins: [permissionPattern] });
    return { granted };
  } catch {
    return { granted: false, error: 'Failed to construct a valid origin for permission request.' };
  }
}

/**
 * Checks if the extension currently has host permission for a given URL.
 * @param url The URL to check permission for.
 * @returns A promise resolving to true if permission is held, false otherwise.
 */
export async function hasSonarrPermission(url: string): Promise<boolean> {
  try {
    const validation = validateUrl(url);
    if (!validation.isValid) return false;
    const permissionPattern = buildSonarrPermissionPattern(validation.normalizedUrl!);
    if (!permissionPattern) return false;
    return await browser.permissions.contains({ origins: [permissionPattern] });
  } catch {
    return false;
  }
}