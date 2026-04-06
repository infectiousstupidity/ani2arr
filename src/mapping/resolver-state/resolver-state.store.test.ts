/** Tests for mapping-derived resolver-state persistence and timestamp behavior. */
// src/mapping/resolver-state/resolver-state.store.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolverStateRecord } from '@/mapping/types';
import { ResolverStateStore } from './resolver-state.store';

describe('ResolverStateStore', () => {
  let store: ResolverStateStore;

  beforeEach(async () => {
    store = new ResolverStateStore();
    await store.clear();
  });

  it('keeps updatedAt stable when the unresolved state payload does not change', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const unresolvedState = {
      state: 'unresolved',
      title: 'Title',
    } as Omit<ResolverStateRecord, 'updatedAt'>;

    expect(
      await store.set(
        'sonarr',
        1,
        unresolvedState,
        { staleMs: 1000, hardMs: 2000 },
      ),
    ).toBe(true);
    const first = await store.get('sonarr', 1);

    vi.setSystemTime(new Date('2026-01-01T00:01:00.000Z'));

    expect(
      await store.set(
        'sonarr',
        1,
        unresolvedState,
        { staleMs: 1000, hardMs: 2000 },
      ),
    ).toBe(false);
    const second = await store.get('sonarr', 1);

    expect(first?.updatedAt).toBe(second?.updatedAt);
    vi.useRealTimers();
  });

  it('drops expired resolver-state entries from reads and listings', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const mappedState = {
      state: 'mapped',
      providerId: 99,
      source: 'auto',
    } as Omit<ResolverStateRecord, 'updatedAt'>;

    await store.set(
      'radarr',
      2,
      mappedState,
      { staleMs: 1000, hardMs: 2000 },
    );
    const persistSpy = vi.spyOn(
      Object.getPrototypeOf(store) as { persist(this: ResolverStateStore): Promise<void> },
      'persist',
    );
    persistSpy.mockClear();

    vi.setSystemTime(new Date('2026-01-01T00:00:03.000Z'));

    expect(await store.get('radarr', 2)).toBeNull();
    expect(await store.get('radarr', 2)).toBeNull();
    expect(persistSpy).not.toHaveBeenCalled();
    expect(await store.list()).toEqual([]);
    expect(persistSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
