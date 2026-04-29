/** Tests for mapping-derived auto-mapping persistence and timestamp behavior. */
// src/mapping/auto-mapping/auto-mapping.store.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAniListId } from '@/anilist';
import { parseTmdbId } from '@/providers';
import type { AutoMappingRecord } from './types';
import { AutoMappingStore } from './auto-mapping.store';

const aid = parseAniListId;
const tmdb = parseTmdbId;

describe('AutoMappingStore', () => {
  let store: AutoMappingStore;

  beforeEach(async () => {
    store = new AutoMappingStore();
    await store.clear();
  });

  it('keeps updatedAt stable when the unresolved state payload does not change', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const unresolvedState = {
      state: 'unresolved',
      recentEvaluation: {
        attemptedAt: 1,
        searchTerms: ['Title'],
        candidates: [],
      },
    } as Omit<AutoMappingRecord, 'updatedAt'>;

    expect(
      await store.set(
        'sonarr',
        aid(1),
        unresolvedState,
        { hardMs: 2000 },
      ),
    ).toBe(true);
    const first = await store.get('sonarr', aid(1));

    vi.setSystemTime(new Date('2026-01-01T00:01:00.000Z'));

    expect(
      await store.set(
        'sonarr',
        aid(1),
        unresolvedState,
        { hardMs: 2000 },
      ),
    ).toBe(false);
    const second = await store.get('sonarr', aid(1));

    expect(first?.updatedAt).toBe(second?.updatedAt);
    vi.useRealTimers();
  });

  it('drops expired auto-mapping entries from reads and listings', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const mappedState = {
      state: 'mapped',
      providerId: 99,
      acceptedEvidence: {
        source: 'auto',
        reason: 'fuzzy-match',
      },
    } as Omit<AutoMappingRecord, 'updatedAt'>;

    await store.set(
      'radarr',
      aid(2),
      mappedState,
      { hardMs: 2000 },
    );
    const persistSpy = vi.spyOn(
      Object.getPrototypeOf(store) as { persist(this: AutoMappingStore): Promise<void> },
      'persist',
    );
    persistSpy.mockClear();

    vi.setSystemTime(new Date('2026-01-01T00:00:03.000Z'));

    expect(await store.get('radarr', aid(2))).toBeNull();
    expect(await store.get('radarr', aid(2))).toBeNull();
    expect(persistSpy).not.toHaveBeenCalled();
    expect(await store.list()).toEqual([]);
    expect(persistSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('round-trips recent evaluation traces, including suppressed candidates', async () => {
    const unresolvedState = {
      state: 'unresolved',
      recentEvaluation: {
        attemptedAt: 123,
        searchTerms: ['Needle Movie'],
        candidates: [
          {
            providerId: tmdb(555),
            title: 'Needle Movie',
            source: 'auto',
            reason: 'borrowed-base-title-fallback',
            status: 'suppressed',
            summary: 'Borrowed base-title fallback suppressed',
            score: 0.82,
          },
        ],
      },
    } as Omit<AutoMappingRecord, 'updatedAt'>;

    await store.set('radarr', aid(44), unresolvedState, { hardMs: 2000 });

    expect(await store.get('radarr', aid(44))).toMatchObject(unresolvedState);
  });
});
