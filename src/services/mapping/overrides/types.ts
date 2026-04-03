/** Mapping override-owned persisted entry types for overrides, ignores, and candidate suppressions. */
// src/services/mapping/overrides/types.ts

import type { Provider } from '@/integrations/providers';
import type { MappingExternalId } from '@/services/mapping/types';

export interface StoredMappingExternalIdEntry {
  provider: Provider;
  externalId: MappingExternalId;
  updatedAt: number;
}

export interface MappingIgnoreEntry {
  provider: Provider;
  updatedAt: number;
}
