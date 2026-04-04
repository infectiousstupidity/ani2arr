/** Mapping-owned serializer for raw stored overrides and suppression records. */
// src/mapping/overrides/export-stored-mappings.ts

import type { MappingExternalIdRecord, MappingIgnoreRecord } from '@/mapping/types';

type ExportOverridesDeps = {
  list(): MappingExternalIdRecord[];
  listIgnores(): MappingIgnoreRecord[];
  listRejectedCandidates(): MappingExternalIdRecord[];
  listBlockedCandidates(): MappingExternalIdRecord[];
};

export async function exportStoredMappings(overridesService: ExportOverridesDeps) {
  const overrides = Object.fromEntries(
    overridesService.list().map(entry => [
      `${entry.provider}:${entry.anilistId}`,
      {
        anilistId: entry.anilistId,
        provider: entry.provider,
        externalId: entry.externalId,
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
      `${entry.provider}:${entry.anilistId}:${entry.externalId.kind}:${entry.externalId.id}`,
      {
        anilistId: entry.anilistId,
        provider: entry.provider,
        externalId: entry.externalId,
        updatedAt: entry.updatedAt,
      },
    ]),
  );

  const blockedCandidates = Object.fromEntries(
    overridesService.listBlockedCandidates().map(entry => [
      `${entry.provider}:${entry.anilistId}:${entry.externalId.kind}:${entry.externalId.id}`,
      {
        anilistId: entry.anilistId,
        provider: entry.provider,
        externalId: entry.externalId,
        updatedAt: entry.updatedAt,
      },
    ]),
  );

  return {
    version: 2 as const,
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
