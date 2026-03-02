import type { AniFormat } from '@/shared/types';

// Current overlay surfaces are Sonarr-driven. Keep non-series formats hidden until
// they have a dedicated integration path instead of surfacing a false mapping error.
export const shouldSkipSonarrFormat = (format: AniFormat | null | undefined): boolean =>
  format === 'MOVIE' || format === 'MUSIC';
