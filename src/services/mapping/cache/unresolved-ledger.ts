/** In-memory ledger of unresolved mappings for UI summaries and retry flows. */
// src/services/mapping/cache/unresolved-ledger.ts

import type { Provider } from '@/shared/types/providers';

export interface UnresolvedLedgerEntry {
  anilistId: number;
  provider: Provider;
  source: 'unresolved';
  updatedAt: number;
  title?: string;
}

export class UnresolvedLedger {
  private readonly entries = new Map<string, UnresolvedLedgerEntry>();

  public record(provider: Provider, anilistId: number, title?: string): boolean {
    const key = this.createKey(provider, anilistId);
    const previous = this.entries.get(key);
    const hasMeaningfulChange = !previous || previous.title !== title;
    const next: UnresolvedLedgerEntry = {
      anilistId,
      provider,
      source: 'unresolved',
      updatedAt: hasMeaningfulChange ? Date.now() : previous.updatedAt,
      ...(title ? { title } : {}),
    };
    this.entries.set(key, next);
    return hasMeaningfulChange;
  }

  public delete(provider: Provider, anilistId: number): boolean {
    return this.entries.delete(this.createKey(provider, anilistId));
  }

  public clear(): boolean {
    if (this.entries.size === 0) {
      return false;
    }
    this.entries.clear();
    return true;
  }

  public list(): UnresolvedLedgerEntry[] {
    return [...this.entries.values()];
  }

  private createKey(provider: Provider, anilistId: number): string {
    return `${provider}:${anilistId}`;
  }
}
