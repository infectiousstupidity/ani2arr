/** Focused tests for provider credential extraction and configured-state derivation. */
// src/options/provider-config.test.ts

import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from '@/options';
import { getProviderCredentials, isProviderConfigured } from './provider-config';

describe('getProviderCredentials', () => {
  it('returns trimmed credentials when both fields present', () => {
    const settings = createDefaultSettings();
    settings.providers.sonarr.url = '  https://sonarr.example  ';
    settings.providers.sonarr.apiKey = '  abc123  ';

    expect(getProviderCredentials(settings, 'sonarr')).toEqual({
      url: 'https://sonarr.example',
      apiKey: 'abc123',
    });
  });

  it('returns null when url is missing', () => {
    const settings = createDefaultSettings();
    settings.providers.sonarr.url = '';
    settings.providers.sonarr.apiKey = 'abc123';

    expect(getProviderCredentials(settings, 'sonarr')).toBeNull();
  });

  it('returns null when apiKey is missing', () => {
    const settings = createDefaultSettings();
    settings.providers.radarr.url = 'https://radarr.example';
    settings.providers.radarr.apiKey = '';

    expect(getProviderCredentials(settings, 'radarr')).toBeNull();
  });

  it('returns null when both fields missing', () => {
    const settings = createDefaultSettings();
    expect(getProviderCredentials(settings, 'sonarr')).toBeNull();
  });

  it('treats whitespace-only values as unconfigured', () => {
    const settings = createDefaultSettings();
    settings.providers.sonarr.url = '   ';
    settings.providers.sonarr.apiKey = '  ';

    expect(getProviderCredentials(settings, 'sonarr')).toBeNull();
  });

  it('returns null for undefined settings', () => {
    expect(getProviderCredentials(undefined, 'sonarr')).toBeNull();
  });
});

describe('isProviderConfigured', () => {
  it('returns true when both fields present', () => {
    const settings = createDefaultSettings();
    settings.providers.radarr.url = 'https://radarr.example';
    settings.providers.radarr.apiKey = 'key';

    expect(isProviderConfigured(settings, 'radarr')).toBe(true);
  });

  it('returns false when a field is missing', () => {
    const settings = createDefaultSettings();
    settings.providers.radarr.url = 'https://radarr.example';
    settings.providers.radarr.apiKey = '';

    expect(isProviderConfigured(settings, 'radarr')).toBe(false);
  });

  it('returns false for undefined settings', () => {
    expect(isProviderConfigured(undefined, 'sonarr')).toBe(false);
  });
});
