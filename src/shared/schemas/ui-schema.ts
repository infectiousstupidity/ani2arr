import * as v from 'valibot';
import type {
  BadgeVisibility,
  ProviderAnimePageUiOptions,
  ProviderBrowseCardUiOptions,
  UiOptions,
} from '@/shared/types/options';
import type { TitleLanguage } from '@/shared/providers/common/types';

// --- Constants ---

const BADGE_VISIBILITY_OPTIONS: [BadgeVisibility, ...BadgeVisibility[]] = [
  'always',
  'hover',
  'hidden',
];

const TITLE_LANGUAGES: [TitleLanguage, ...TitleLanguage[]] = [
  'english',
  'romaji',
  'native',
];

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

const isBadgeVisibility = (value: unknown): value is BadgeVisibility =>
  typeof value === 'string' && BADGE_VISIBILITY_OPTIONS.includes(value as BadgeVisibility);

export const isTitleLanguage = (value: unknown): value is TitleLanguage =>
  typeof value === 'string' && TITLE_LANGUAGES.includes(value as TitleLanguage);

// --- Migration ---

export const migrateLegacyUiOptions = (input: unknown): Record<string, unknown> => {
  const raw = asRecord(input);
  const browseCards = asRecord(raw.browseCards);
  const animePages = asRecord(raw.animePages);
  const legacyBrowseEnabled = typeof raw.browseOverlayEnabled === 'boolean' ? raw.browseOverlayEnabled : undefined;
  const legacyBadgeVisibility = isBadgeVisibility(raw.badgeVisibility) ? raw.badgeVisibility : undefined;
  const legacyHeaderEnabled = typeof raw.headerInjectionEnabled === 'boolean' ? raw.headerInjectionEnabled : undefined;

  const resolveBrowseProvider = (provider: 'sonarr' | 'radarr'): Record<string, unknown> => {
    const providerRaw = asRecord(browseCards[provider]);
    return {
      enabled:
        typeof providerRaw.enabled === 'boolean'
          ? providerRaw.enabled
          : (legacyBrowseEnabled ?? true),
      visibility: isBadgeVisibility(providerRaw.visibility)
        ? providerRaw.visibility
        : (legacyBadgeVisibility ?? 'always'),
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
