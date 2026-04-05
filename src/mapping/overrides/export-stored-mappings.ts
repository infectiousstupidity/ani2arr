/** Mapping-owned serializer for raw stored overrides and suppression records. */
// src/mapping/overrides/export-stored-mappings.ts

import type { MappingProviderIdRecord, MappingIgnoreRecord } from '@/mapping/types';

type ExportOverridesDeps = {
  list(): MappingProviderIdRecord[];
  listIgnores(): MappingIgnoreRecord[];
  listRejectedCandidates(): MappingProviderIdRecord[];
  listBlockedCandidates(): MappingProviderIdRecord[];
};

export async function exportStoredMappings(overridesService: ExportOverridesDeps) {
  const overrides = Object.fromEntries(
    overridesService.list().map(entry => [
      `${entry.provider}:${entry.anilistId}`,
      {
        anilistId: entry.anilistId,
        provider: entry.provider,
        providerId: entry.providerId,
        updatedAt: entry.updatedAt,
      },
    ]),
  );

  const ignores = Object.fromEntries(
    overridesService.listIgnores().map(entry => [
      `${entry.provider}:${entry.anilistId}`,
      {
        anilistId: entry.anilistId,
        provider: entry.provider,
        updatedAt: entry.updatedAt,
      },
    ]),
  );

  const rejectedCandidates = Object.fromEntries(
    overridesService.listRejectedCandidates().map(entry => [
      `${entry.provider}:${entry.anilistId}:${entry.providerId}`,
      {
        anilistId: entry.anilistId,
        provider: entry.provider,
        providerId: entry.providerId,
        updatedAt: entry.updatedAt,
      },
    ]),
  );

  const blockedCandidates = Object.fromEntries(
    overridesService.listBlockedCandidates().map(entry => [
      `${entry.provider}:${entry.anilistId}:${entry.providerId}`,
      {
        anilistId: entry.anilistId,
        provider: entry.provider,
        providerId: entry.providerId,
        updatedAt: entry.updatedAt,
      },
    ]),
  );

  return {
    version: 3 as const,
    exportedAt: new Date().toISOString(),
    summary: {
      overrideCount: Object.keys(overrides).length,
      ignoreCount: Object.keys(ignores).length,
      rejectedCandidateCount: Object.keys(rejectedCandidates).length,
      blockedCandidateCount: Object.keys(blockedCandidates).length,
    },
    mappings: {
      overrides,
      ignores,
      rejectedCandidates,
      blockedCandidates,
    },
  };
}
