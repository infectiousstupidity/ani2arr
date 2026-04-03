/** In-memory ledger of successfully resolved mappings for debug and export surfaces. */
// src/services/mapping/cache/resolved-ledger.ts

import type { Provider } from '@/shared/types/providers';
import type { ResolvedMapping } from '../types';

export interface ResolvedLedgerEntry extends ResolvedMapping {
  anilistId: number;
  provider: Provider;
  source: 'auto' | 'upstream';
  updatedAt: number;
}

export class ResolvedLedger {
  private readonly entries = new Map<string, ResolvedLedgerEntry>();

  public record(
    provider: Provider,
    anilistId: number,
    mapping: ResolvedMapping,
    source: ResolvedLedgerEntry['source'],
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

  public get(provider: Provider, anilistId: number): ResolvedLedgerEntry | undefined {
    return this.entries.get(this.createKey(provider, anilistId));
  }

  public delete(provider: Provider, anilistId: number): void {
    this.entries.delete(this.createKey(provider, anilistId));
  }

  public clear(): void {
    this.entries.clear();
  }

  public list(): ResolvedLedgerEntry[] {
    return [...this.entries.values()];
  }

  private createKey(provider: Provider, anilistId: number): string {
    return `${provider}:${anilistId}`;
  }
}
