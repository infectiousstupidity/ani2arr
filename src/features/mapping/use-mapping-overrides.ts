/** Mapping override mutation hook for saving and clearing manual provider IDs. */
// src/features/mapping/use-mapping-overrides.ts

import { useCallback } from 'react';
import type { Provider } from '@/providers';
import { useClearMappingOverride, useSetMappingOverride } from '@/shared/queries';

export function useMappingOverrides(anilistId: number, provider: Provider) {
  const setOverrideMutation = useSetMappingOverride();
  const clearOverrideMutation = useClearMappingOverride();

  const setOverride = useCallback(
    async (providerId: number, options?: { force?: boolean }) => {
      await setOverrideMutation.mutateAsync({
        anilistId,
        provider,
        providerId,
        ...(options?.force ? { force: true } : {}),
      });
    },
    [anilistId, provider, setOverrideMutation],
  );

  const clearOverride = useCallback(async () => {
    await clearOverrideMutation.mutateAsync({ anilistId, provider });
  }, [anilistId, clearOverrideMutation, provider]);

  return {
    setOverride,
    clearOverride,
  } as const;
}
