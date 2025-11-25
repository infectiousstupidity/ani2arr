// src/features/media-modal/tabs/mapping-tab/hooks/use-mapping-overrides.ts
import { useCallback } from "react";
import type { MappingTargetId } from "@/shared/types";
import { useClearMappingOverride, useSetMappingOverride } from "@/shared/hooks/use-api-queries";

export function useMappingOverrides(anilistId: number) {
  const setOverrideMutation = useSetMappingOverride();
  const clearOverrideMutation = useClearMappingOverride();

  const setOverride = useCallback(
    async (target: MappingTargetId, options?: { force?: boolean }) => {
      if (target.idType !== "tvdb" || typeof target.id !== "number") {
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
