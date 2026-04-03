/** Mapping override mutation hook for saving and clearing manual provider IDs. */
// src/features/mapping/use-mapping-overrides.ts

import { useCallback } from 'react';
import type { Provider } from '@/integrations/providers';
import type { MappingExternalId } from '@/services/mapping/types';
import { useClearMappingOverride, useSetMappingOverride } from '@/shared/queries';

export function useMappingOverrides(anilistId: number, provider: Provider) {
  const setOverrideMutation = useSetMappingOverride();
  const clearOverrideMutation = useClearMappingOverride();

  const setOverride = useCallback(
    async (target: MappingExternalId, options?: { force?: boolean }) => {
      await setOverrideMutation.mutateAsync({
        anilistId,
        provider,
        externalId: target,
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
