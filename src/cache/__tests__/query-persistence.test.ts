import { describe, expect, it } from 'vitest';
import type { Query } from '@tanstack/query-core';
import { shouldPersistQuery } from '../query-persistence';
import { queryKeys } from '@/hooks/use-api-queries';

const makeQuery = (overrides: Partial<Query> & { queryKey: Query['queryKey'] }): Query =>
  ({
    state: {} as Query['state'],
    meta: {},
    ...overrides,
  }) as Query;

describe('shouldPersistQuery', () => {
  it('skips persisting option queries based on key prefix', () => {
    const query = makeQuery({ queryKey: queryKeys.options() });
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('skips persisting queries marked with meta.persist = false', () => {
    const query = makeQuery({ queryKey: ['kitsunarr', 'seriesStatus'], meta: { persist: false } });
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('persists non-sensitive queries by default', () => {
    const query = makeQuery({ queryKey: ['kitsunarr', 'seriesStatus', 123] });
    expect(shouldPersistQuery(query)).toBe(true);
  });
});
