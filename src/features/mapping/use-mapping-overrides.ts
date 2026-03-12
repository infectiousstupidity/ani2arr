import { useCallback } from 'react';
import type { MappingExternalId, MappingProvider } from '@/shared/types';
import { useClearMappingOverride, useSetMappingOverride } from '@/shared/queries';

export function useMappingOverrides(anilistId: number, provider: MappingProvider) {
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
