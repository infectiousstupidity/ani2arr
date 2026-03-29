/** Runtime-validated UI settings schema and legacy migration rules for stored UI options. */
// src/shared/schemas/ui-schema.ts

import * as v from 'valibot';
import type {
  BadgeVisibility,
  ProviderAnimePageUiOptions,
  ProviderBrowseCardUiOptions,
  UiOptions,
} from '@/shared/types/options';

// --- Constants ---

const BADGE_VISIBILITY_OPTIONS: [BadgeVisibility, ...BadgeVisibility[]] = [
  'always',
  'hover',
];
const LEGACY_BADGE_VISIBILITY_OPTIONS = [...BADGE_VISIBILITY_OPTIONS, 'hidden'] as const;

// --- Factories ---

const createDefaultBrowseCardUiOptions = (): ProviderBrowseCardUiOptions => ({
  enabled: true,
  visibility: 'always',
});

const createDefaultAnimePageUiOptions = (): ProviderAnimePageUiOptions => ({
  enabled: true,
});

export const createDefaultUiOptions = (): UiOptions => ({
  browseCards: {
    sonarr: createDefaultBrowseCardUiOptions(),
    radarr: createDefaultBrowseCardUiOptions(),
  },
  animePages: {
    sonarr: createDefaultAnimePageUiOptions(),
    radarr: createDefaultAnimePageUiOptions(),
  },
  schedulerDebugOverlayEnabled: false,
});

// --- Helpers ---

const asRecord = (input: unknown): Record<string, unknown> =>
  input && typeof input === 'object' ? (input as Record<string, unknown>) : {};

const isLegacyBadgeVisibility = (
  value: unknown,
): value is BadgeVisibility | 'hidden' =>
  typeof value === 'string'
  && LEGACY_BADGE_VISIBILITY_OPTIONS.includes(value as (typeof LEGACY_BADGE_VISIBILITY_OPTIONS)[number]);

// --- Migration ---

export const migrateLegacyUiOptions = (input: unknown): Record<string, unknown> => {
  const raw = asRecord(input);
  const browseCards = asRecord(raw.browseCards);
  const animePages = asRecord(raw.animePages);
  const legacyBrowseEnabled = typeof raw.browseOverlayEnabled === 'boolean' ? raw.browseOverlayEnabled : undefined;
  const legacyBadgeVisibility = isLegacyBadgeVisibility(raw.badgeVisibility) ? raw.badgeVisibility : undefined;
  const legacyHeaderEnabled = typeof raw.headerInjectionEnabled === 'boolean' ? raw.headerInjectionEnabled : undefined;

  const resolveBrowseProvider = (provider: 'sonarr' | 'radarr'): Record<string, unknown> => {
    const providerRaw = asRecord(browseCards[provider]);
    const enabled =
      typeof providerRaw.enabled === 'boolean'
        ? providerRaw.enabled
        : (legacyBrowseEnabled ?? true);
    const visibility = isLegacyBadgeVisibility(providerRaw.visibility)
      ? providerRaw.visibility
      : legacyBadgeVisibility;

    if (visibility === 'hidden') {
      return {
        enabled: false,
        visibility: 'always',
      };
    }

    return {
      enabled,
      visibility: visibility ?? 'always',
    };
  };

  const resolveAnimeProvider = (provider: 'sonarr' | 'radarr'): Record<string, unknown> => {
    const providerRaw = asRecord(animePages[provider]);
    return {
      enabled:
        typeof providerRaw.enabled === 'boolean'
          ? providerRaw.enabled
          : (legacyHeaderEnabled ?? true),
    };
  };

  return {
    ...raw,
    browseCards: {
      sonarr: resolveBrowseProvider('sonarr'),
      radarr: resolveBrowseProvider('radarr'),
    },
    animePages: {
      sonarr: resolveAnimeProvider('sonarr'),
      radarr: resolveAnimeProvider('radarr'),
    },
  };
};

// --- Schemas ---

const ProviderBrowseCardUiOptionsSchema = v.pipe(
  v.unknown(),
  v.transform((input) => (input && typeof input === 'object' ? input : {})),
  v.object({
    enabled: v.fallback(v.boolean(), true),
    visibility: v.fallback(v.picklist(BADGE_VISIBILITY_OPTIONS), 'always'),
  }),
);

const ProviderAnimePageUiOptionsSchema = v.pipe(
  v.unknown(),
  v.transform((input) => (input && typeof input === 'object' ? input : {})),
  v.object({
    enabled: v.fallback(v.boolean(), true),
  }),
);

export const UiOptionsSchema = v.pipe(
  v.unknown(),
  v.transform(migrateLegacyUiOptions),
  v.object({
    browseCards: v.object({
      sonarr: v.fallback(ProviderBrowseCardUiOptionsSchema, createDefaultBrowseCardUiOptions()),
      radarr: v.fallback(ProviderBrowseCardUiOptionsSchema, createDefaultBrowseCardUiOptions()),
    }),
    animePages: v.object({
      sonarr: v.fallback(ProviderAnimePageUiOptionsSchema, createDefaultAnimePageUiOptions()),
      radarr: v.fallback(ProviderAnimePageUiOptionsSchema, createDefaultAnimePageUiOptions()),
    }),
    schedulerDebugOverlayEnabled: v.fallback(v.boolean(), false),
  })
);
