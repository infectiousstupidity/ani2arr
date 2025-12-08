import type { CheckSeriesStatusResponse, MappingStatus } from '@/shared/types';

export function toMappingStatus(status: CheckSeriesStatusResponse | undefined): MappingStatus {
  const externalId =
    status?.externalId ??
    (typeof status?.tvdbId === 'number' && Number.isFinite(status.tvdbId)
      ? { id: status.tvdbId, kind: 'tvdb' as const }
      : null);
  if (!externalId) return 'unmapped';
  return status?.exists ? 'in-provider' : 'not-in-provider';
}
