/** Mapping override-owned persisted entry types for overrides, ignores, and candidate suppressions. */
// src/services/mapping/overrides/types.ts

import type { MappingExternalId } from '@/shared/types';
import type { Provider } from '@/shared/types/providers';

export interface StoredMappingExternalIdEntry {
  provider: Provider;
  externalId: MappingExternalId;
  updatedAt: number;
}

export interface MappingIgnoreEntry {
  provider: Provider;
  updatedAt: number;
}
