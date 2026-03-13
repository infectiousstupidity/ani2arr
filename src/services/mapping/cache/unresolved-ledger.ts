import type { MappingProvider } from '@/shared/types';

export type UnresolvedMappingSource = 'unresolved';

export interface UnresolvedLedgerEntry {
  anilistId: number;
  provider: MappingProvider;
  source: UnresolvedMappingSource;
  updatedAt: number;
  title?: string;
}

export class UnresolvedLedger {
  private readonly entries = new Map<string, UnresolvedLedgerEntry>();

  public record(provider: MappingProvider, anilistId: number, title?: string): boolean {
    const key = this.createKey(provider, anilistId);
    const previous = this.entries.get(key);
    const next: UnresolvedLedgerEntry = {
      anilistId,
      provider,
      source: 'unresolved',
      updatedAt: Date.now(),
      ...(title ? { title } : {}),
    };
    this.entries.set(key, next);
    return !previous || previous.title !== next.title || previous.updatedAt !== next.updatedAt;
  }

  public delete(provider: MappingProvider, anilistId: number): boolean {
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
    return Array.from(this.entries.values());
  }

  private createKey(provider: MappingProvider, anilistId: number): string {
    return `${provider}:${anilistId}`;
  }
}
