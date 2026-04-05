/** Mapping override-owned persisted entry types for overrides, ignores, and candidate suppressions. */
// src/mapping/overrides/types.ts

import type { Provider } from '@/providers';

export interface StoredMappingProviderIdEntry {
  provider: Provider;
  providerId: number;
  updatedAt: number;
}

export interface MappingIgnoreEntry {
  provider: Provider;
  updatedAt: number;
}
