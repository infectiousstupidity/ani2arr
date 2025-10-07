import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import {
  hasSonarrPermission,
  requestSonarrPermission,
  sanitizeInput,
  validateApiKey,
  validateUrl,
} from '@/utils/validation';

describe('validateUrl', () => {
  it.each([
    {
      name: 'rejects empty strings',
      input: '',
      expected: { isValid: false, error: 'URL is required.' },
    },
    {
      name: 'rejects whitespace only strings',
      input: '   ',
      expected: { isValid: false, error: 'URL cannot be empty.' },
    },
    {
      name: 'rejects invalid schemes',
      input: 'ftp://example.com',
      expected: { isValid: false, error: 'URL must use http or https.' },
    },
    {
      name: 'rejects malformed hosts',
      input: 'http://invalid_host',
      expected: { isValid: false, error: 'Invalid hostname.' },
    },
    {
      name: 'rejects out-of-range IPv4 octets',
      input: 'http://256.0.0.1',
      expected: { isValid: false, error: 'Invalid URL format.' },
    },
  ])('$name', ({ input, expected }) => {
    expect(validateUrl(input)).toEqual(expected);
  });

  it.each([
    {
      name: 'accepts IPv4 addresses with ports',
      input: 'http://127.0.0.1:8989',
      normalizedUrl: 'http://127.0.0.1:8989',
    },
    {
      name: 'accepts localhost without a TLD',
      input: 'http://localhost',
      normalizedUrl: 'http://localhost',
    },
    {
      name: 'accepts localhost with a port',
      input: 'http://localhost:8989',
      normalizedUrl: 'http://localhost:8989',
    },
    {
      name: 'accepts bare intranet hostnames',
      input: 'http://nas-box',
      normalizedUrl: 'http://nas-box',
    },
    {
      name: 'accepts IPv6 literals with ports',
      input: 'http://[::1]:8989',
      normalizedUrl: 'http://[::1]:8989',
    },
  ])('$name', ({ input, normalizedUrl }) => {
    expect(validateUrl(input)).toEqual({ isValid: true, normalizedUrl });
  });

  it('normalizes trailing slashes on valid URLs', () => {
    expect(validateUrl('https://example.com/')).toEqual({
      isValid: true,
      normalizedUrl: 'https://example.com',
    });
  });
});

describe('validateApiKey', () => {
  it.each([
    {
      name: 'rejects empty strings',
      input: '',
      expected: { isValid: false, error: 'API key is required.' },
    },
    {
      name: 'rejects whitespace-only strings',
      input: '   ',
      expected: { isValid: false, error: 'API key cannot be empty.' },
    },
    {
      name: 'rejects incorrect length',
      input: 'abc123',
      expected: {
        isValid: false,
        error: 'API key must be a 32-character hexadecimal string.',
      },
    },
    {
      name: 'rejects non-hexadecimal characters',
      input: 'g'.repeat(32),
      expected: {
        isValid: false,
        error: 'API key must be a 32-character hexadecimal string.',
      },
    },
  ])('$name', ({ input, expected }) => {
    expect(validateApiKey(input)).toEqual(expected);
  });

  it('accepts 32-character hexadecimal strings', () => {
    expect(validateApiKey('a'.repeat(32))).toEqual({ isValid: true });
  });
});

describe('sanitizeInput', () => {
  it('strips potentially dangerous characters', () => {
    expect(sanitizeInput('  <script>alert("x")</script>  ')).toBe('scriptalert(x)script');
  });

  it('preserves legitimate text', () => {
    expect(sanitizeInput('  Hello, world! Stay safe.  ')).toBe('Hello, world! Stay safe.');
  });

  it('returns an empty string when input is not a string', () => {
    expect(sanitizeInput(undefined as unknown as string)).toBe('');
  });
});

describe('Sonarr permission helpers', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('requests runtime permissions for normalized origins', async () => {
    const grantedOrigins = new Set<string>();

    const requestSpy = vi.spyOn(fakeBrowser.permissions, 'request').mockImplementation(
      async (permissions: unknown) => {
        const origins = (permissions as { origins?: string[] } | undefined)?.origins ?? [];
        origins.forEach((origin: string) => grantedOrigins.add(origin));
        return true;
      },
    );

    const result = await requestSonarrPermission('https://example.com:8989/api');

    expect(result).toEqual({ granted: true });
    expect(requestSpy).toHaveBeenCalledWith({ origins: ['https://example.com:8989/*'] });
    expect(grantedOrigins.has('https://example.com:8989/*')).toBe(true);
  });

  it('requests runtime permissions for IPv6 Sonarr hosts', async () => {
    const requestSpy = vi
      .spyOn(fakeBrowser.permissions, 'request')
      .mockResolvedValue(true);

    const result = await requestSonarrPermission('http://[::1]:8989/api');

    expect(result).toEqual({ granted: true });
    expect(requestSpy).toHaveBeenCalledWith({ origins: ['http://[::1]:8989/*'] });
  });

  it('propagates validation errors from invalid URLs when requesting permissions', async () => {
    expect(await requestSonarrPermission('')).toEqual({ granted: false, error: 'URL is required.' });
  });

  it('returns a descriptive error when the permission request throws', async () => {
    vi.spyOn(fakeBrowser.permissions, 'request').mockRejectedValue(new Error('boom'));

    expect(await requestSonarrPermission('https://example.com')).toEqual({
      granted: false,
      error: 'Failed to construct a valid origin for permission request.',
    });
  });

  it('indicates when the browser denies the permission request', async () => {
    vi.spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(false);

    expect(await requestSonarrPermission('https://example.com')).toEqual({ granted: false });
  });

  it('confirms when host permissions are present for a Sonarr URL', async () => {
    const grantedOrigins = new Set(['https://sonarr.example.com/*']);

    vi.spyOn(fakeBrowser.permissions, 'contains').mockImplementation(async (permissions: unknown) => {
      const origins = (permissions as { origins?: string[] } | undefined)?.origins ?? [];
      return origins.every((origin: string) => grantedOrigins.has(origin));
    });

    expect(await hasSonarrPermission('https://sonarr.example.com/path')).toBe(true);
  });

  it('confirms permissions for IPv6 Sonarr hosts', async () => {
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);

    expect(await hasSonarrPermission('http://[::1]:8989/sonarr')).toBe(true);
  });

  it('returns false when host permissions are missing', async () => {
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(false);

    expect(await hasSonarrPermission('https://sonarr.example.com')).toBe(false);
  });

  it('rejects invalid Sonarr URLs when checking permissions', async () => {
    expect(await hasSonarrPermission('notaurl')).toBe(false);
  });
});
