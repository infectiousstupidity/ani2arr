/** Converts provider library status responses into mapping-library status values. */
// src/features/mapping/status.ts

import type { CheckSeriesStatusResponse } from '@/rpc/types';
import type { MappingLibraryStatus } from '@/mapping/types';

export function toMappingStatus(status: CheckSeriesStatusResponse | undefined): MappingLibraryStatus {
  if (!(typeof status?.tvdbId === 'number' && Number.isFinite(status.tvdbId))) return 'unmapped';
  return status?.exists ? 'in-provider' : 'not-in-provider';
}
