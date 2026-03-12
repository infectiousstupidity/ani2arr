import type { MappingExternalId, MediaMetadataHint, RequestPriority } from '@/shared/types';

export interface ResolvedMapping {
  externalId: MappingExternalId;
  successfulSynonym?: string;
}

export type ResolveHints = {
  primaryTitle?: string;
  domMedia?: MediaMetadataHint | null;
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
