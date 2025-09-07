/**
 * SWR cache with soft/hard TTLs and optional ETag metadata.
 * Persists plain JSON (no Map). MV2/Firefox-safe.
 */

export interface CacheValue<T> {
  v: T;
  staleAt: number;          // after this, serve-but-revalidate
  expiresAt: number;        // after this, drop value
  etag?: string;            // optional HTTP ETag for If-None-Match
}

export interface ICache {
  has(key: string): Promise<boolean>;
  get<T>(key: string): Promise<T | null>;
  getWithMeta<T>(key: string): Promise<CacheValue<T> | null>;
  set<T>(key: string, value: T, staleTtlMs: number, hardTtlMs?: number, etag?: string): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export class CacheService implements ICache {
  private readonly ram = new Map<string, CacheValue<unknown>>();
  constructor(private readonly namespace = 'kitsunarr_cache') {}

  async has(key: string): Promise<boolean> {
    const e = await this.getEntry(key);
    return !!e && Date.now() < e.expiresAt;
  }

  async get<T>(key: string): Promise<T | null> {
    const e = await this.getEntry<T>(key);
    if (!e || Date.now() >= e.expiresAt) return null;
    return e.v;
  }

  async getWithMeta<T>(key: string): Promise<CacheValue<T> | null> {
    const e = await this.getEntry<T>(key);
    if (!e || Date.now() >= e.expiresAt) return null;
    return e;
  }

  async set<T>(key: string, value: T, staleTtlMs: number, hardTtlMs?: number, etag?: string): Promise<void> {
    const now = Date.now();
    const entry: CacheValue<T> = {
      v: value,
      staleAt: now + staleTtlMs,
      expiresAt: now + (hardTtlMs ?? staleTtlMs * 4),
      ...(etag ? { etag } : {}),
    };
    this.ram.set(key, entry);
    await browser.storage.local.set({ [this.k(key)]: entry });
  }

  async delete(key: string): Promise<void> {
    this.ram.delete(key);
    await browser.storage.local.remove(this.k(key));
  }

  async clear(): Promise<void> {
    this.ram.clear();
    const all = await browser.storage.local.get(null);
    const keys = Object.keys(all).filter(k => k.startsWith(`${this.namespace}:`));
    if (keys.length) await browser.storage.local.remove(keys);
  }

  // ---- internals ----
  private k(key: string) { return `${this.namespace}:${key}`; }

  private async getEntry<T>(key: string): Promise<CacheValue<T> | null> {
    let e = this.ram.get(key) as CacheValue<T> | undefined;
    if (!e) {
      const raw = await browser.storage.local.get(this.k(key));
      const val = raw[this.k(key)];
      if (val) { e = val as CacheValue<T>; this.ram.set(key, e); }
    }
    if (!e) return null;
    if (Date.now() >= e.expiresAt) { await this.delete(key); return null; }
    return e;
  }
}
