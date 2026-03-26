import type { AniListMediaFormat } from '@/shared/types';
import { resolveProviderForAniListFormat } from '@/services/providers/resolver';

// Hide only formats that do not map to any supported provider.
export const shouldSkipMediaFormat = (format: AniListMediaFormat | null | undefined): boolean =>
  resolveProviderForAniListFormat(format) === null;
