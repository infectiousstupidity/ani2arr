import type { CheckSeriesStatusResponse } from '@/rpc/types';
import type { MappingStatus } from '@/mapping/types';

export function toMappingStatus(status: CheckSeriesStatusResponse | undefined): MappingStatus {
  if (!(typeof status?.tvdbId === 'number' && Number.isFinite(status.tvdbId))) return 'unmapped';
  return status?.exists ? 'in-provider' : 'not-in-provider';
}
