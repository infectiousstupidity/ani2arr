/** Mapping service input and output types for AniList-driven resolution flows. */
// src/services/mapping/types.ts

import type { AniListMediaHint } from '@/shared/schemas/anilist/anilist-media.schema';
import type { MappingExternalId } from '@/shared/types';
import type { RequestPriority } from '@/shared/types/request-scheduling';

export interface ResolvedMapping {
  externalId: MappingExternalId;
  successfulSynonym?: string;
}

export interface ResolveExternalIdOptions {
  network?: 'never';
  hints?: {
    primaryTitle?: string;
    domMedia?: AniListMediaHint | null;
  };
  ignoreFailureCache?: boolean;
  priority?: RequestPriority;
  // Force provider lookups to bypass fresh caches (used by anime detail force-verify).
  forceLookupNetwork?: boolean;
}
