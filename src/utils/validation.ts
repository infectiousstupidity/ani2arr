// src/utils/validation.ts

/**
 * @file Provides utility functions for validating user input and managing host permissions.
 * These are pure functions, ensuring they are testable and have no side effects.
 */
import browser from 'webextension-polyfill';

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

  try {
    const urlObj = new URL(trimmedUrl);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { isValid: false, error: 'URL must use http or https.' };
    }
    // A simple check for a TLD or an IP address-like structure.
    if (!urlObj.hostname || (urlObj.hostname.indexOf('.') === -1 && !/^\d{1,3}(\.\d{1,3}){3}$/.test(urlObj.hostname))) {
        return { isValid: false, error: 'Invalid hostname.' };
    }
    // Return the URL without a trailing slash for consistency.
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
    const origin = new URL(validation.normalizedUrl!).origin + '/*';
    const granted = await browser.permissions.request({ origins: [origin] });
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
    const origin = new URL(validation.normalizedUrl!).origin + '/*';
    return await browser.permissions.contains({ origins: [origin] });
  } catch {
    return false;
  }
}