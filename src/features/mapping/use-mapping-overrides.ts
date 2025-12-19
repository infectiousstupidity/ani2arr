import { useCallback } from 'react';
import type { MappingExternalId } from '@/shared/types';
import { useClearMappingOverride, useSetMappingOverride } from '@/shared/queries';

export function useMappingOverrides(anilistId: number) {
  const setOverrideMutation = useSetMappingOverride();
  const clearOverrideMutation = useClearMappingOverride();

  const setOverride = useCallback(
    async (target: MappingExternalId, options?: { force?: boolean }) => {
      if (target.kind !== 'tvdb') {
        return;
      }
      await setOverrideMutation.mutateAsync({
        anilistId,
        tvdbId: target.id,
        ...(options?.force ? { force: true } : {}),
      });
    },
    [anilistId, setOverrideMutation],
  );

  const clearOverride = useCallback(async () => {
    await clearOverrideMutation.mutateAsync({ anilistId });
  }, [anilistId, clearOverrideMutation]);

  return {
    setOverride,
    clearOverride,
  } as const;
}
