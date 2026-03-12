import type { AniFormat } from '@/shared/types';
import { resolveProviderForAniListFormat } from '@/services/providers/resolver';

// Hide only formats that do not map to any supported provider.
export const shouldSkipMediaFormat = (format: AniFormat | null | undefined): boolean =>
  resolveProviderForAniListFormat(format) === null;

// Backward-compatible alias for older Sonarr-named call sites.
export const shouldSkipSonarrFormat = (format: AniFormat | null | undefined): boolean =>
  shouldSkipMediaFormat(format);
