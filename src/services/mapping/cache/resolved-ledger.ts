import type { MappingProvider } from '@/shared/types';
import type { ResolvedMapping } from '../types';

export type ResolvedMappingSource = 'auto' | 'upstream';

export interface ResolvedLedgerEntry extends ResolvedMapping {
  anilistId: number;
  provider: MappingProvider;
  source: ResolvedMappingSource;
  updatedAt: number;
}

export class ResolvedLedger {
  private readonly entries = new Map<string, ResolvedLedgerEntry>();

  public record(
    provider: MappingProvider,
    anilistId: number,
    mapping: ResolvedMapping,
    source: ResolvedMappingSource,
  ): void {
    this.entries.set(this.createKey(provider, anilistId), {
      anilistId,
      provider,
      externalId: mapping.externalId,
      ...(mapping.successfulSynonym ? { successfulSynonym: mapping.successfulSynonym } : {}),
      source,
      updatedAt: Date.now(),
    });
  }

  public get(provider: MappingProvider, anilistId: number): ResolvedLedgerEntry | undefined {
    return this.entries.get(this.createKey(provider, anilistId));
  }

  public delete(provider: MappingProvider, anilistId: number): void {
    this.entries.delete(this.createKey(provider, anilistId));
  }

  public clear(): void {
    this.entries.clear();
  }

  public list(): ResolvedLedgerEntry[] {
    return Array.from(this.entries.values());
  }

  private createKey(provider: MappingProvider, anilistId: number): string {
    return `${provider}:${anilistId}`;
  }
}
