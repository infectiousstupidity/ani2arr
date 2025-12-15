import type { ResolvedMapping } from './types';

export type ResolvedMappingSource = 'auto' | 'upstream';

export interface ResolvedLedgerEntry extends ResolvedMapping {
  anilistId: number;
  source: ResolvedMappingSource;
  updatedAt: number;
}

export class ResolvedLedger {
  private readonly entries = new Map<number, ResolvedLedgerEntry>();

  public record(anilistId: number, mapping: ResolvedMapping, source: ResolvedMappingSource): void {
    const { tvdbId, successfulSynonym } = mapping;
    this.entries.set(anilistId, {
      anilistId,
      tvdbId,
      ...(successfulSynonym !== undefined ? { successfulSynonym } : {}),
      source,
      updatedAt: Date.now(),
    });
  }

  public get(anilistId: number): ResolvedLedgerEntry | undefined {
    return this.entries.get(anilistId);
  }

  public delete(anilistId: number): void {
    this.entries.delete(anilistId);
  }

  public clear(): void {
    this.entries.clear();
  }

  public list(): ResolvedLedgerEntry[] {
    return Array.from(this.entries.values());
  }
}
