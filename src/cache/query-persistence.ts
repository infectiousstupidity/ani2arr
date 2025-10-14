import type { Query, QueryKey } from '@tanstack/query-core';
import { queryKeys } from '@/hooks/use-api-queries';

const sensitivePrefixes: readonly (readonly unknown[])[] = [queryKeys.options()];

const queryKeyStartsWith = (key: QueryKey, prefix: readonly unknown[]): boolean => {
  if (!Array.isArray(key)) return false;
  if (key.length < prefix.length) return false;
  return prefix.every((segment, index) => key[index] === segment);
};

export const shouldPersistQuery = (query: Query): boolean => {
  if (query.meta?.persist === false) return false;
  const key = query.queryKey;
  return !sensitivePrefixes.some(prefix => queryKeyStartsWith(key, prefix));
};

