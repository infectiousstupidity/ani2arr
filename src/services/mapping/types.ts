/** Mapping service input and output types for AniList-driven resolution flows. */
// src/services/mapping/types.ts

import type { AniListMediaHint } from '@/shared/schemas/anilist/anilist-media.schema';
import type { MappingExternalId, RequestPriority } from '@/shared/types';

export interface ResolvedMapping {
  externalId: MappingExternalId;
  successfulSynonym?: string;
}

export type ResolveHints = {
  primaryTitle?: string;
  domMedia?: AniListMediaHint | null;
};

export type ResolveExternalIdOptions = {
  network?: 'never';
  hints?: ResolveHints;
  ignoreFailureCache?: boolean;
  priority?: RequestPriority;
  // Force provider lookups to bypass fresh caches (used by anime detail force-verify).
  forceLookupNetwork?: boolean;
};

export type ResolveTvdbIdOptions = ResolveExternalIdOptions;
