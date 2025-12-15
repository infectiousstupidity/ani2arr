import type { MediaMetadataHint, RequestPriority } from '@/shared/types';

export interface ResolvedMapping {
  tvdbId: number;
  successfulSynonym?: string;
}

export type ResolveHints = {
  primaryTitle?: string;
  domMedia?: MediaMetadataHint | null;
};

export type ResolveTvdbIdOptions = {
  network?: 'never';
  hints?: ResolveHints;
  ignoreFailureCache?: boolean;
  priority?: RequestPriority;
  // Force Sonarr lookups to bypass fresh caches (used by anime detail force-verify).
  forceLookupNetwork?: boolean;
};
