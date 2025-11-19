import { useCallback } from "react";
import { getAni2arrApi } from "@/rpc";
import {
  useSetMappingOverride,
  useClearMappingOverride,
} from "@/shared/hooks/use-api-queries";
import type { MappingTargetId } from "@/shared/types";
import type { ValidateTvdbOutput } from "@/rpc/schemas";

export interface UseMappingOverridesResult {
  setOverride(target: MappingTargetId): Promise<void>;
  clearOverride(): Promise<void>;
  validateTvdbId(tvdbId: number): Promise<ValidateTvdbOutput>;
  isSetting: boolean;
  isClearing: boolean;
}

export function useMappingOverrides(anilistId: number): UseMappingOverridesResult {
  const setMappingOverride = useSetMappingOverride();
  const clearMappingOverride = useClearMappingOverride();

  const setOverride = useCallback(
    async (target: MappingTargetId): Promise<void> => {
      if (target.idType !== "tvdb") return;
      const numericId = typeof target.id === "number" ? target.id : Number(target.id);
      if (!Number.isFinite(numericId) || numericId <= 0) return;
      await setMappingOverride.mutateAsync({ anilistId, tvdbId: numericId });
    },
    [anilistId, setMappingOverride],
  );

  const clearOverride = useCallback(async (): Promise<void> => {
    await clearMappingOverride.mutateAsync({ anilistId });
  }, [anilistId, clearMappingOverride]);

  const validateTvdbId = useCallback(async (tvdbId: number): Promise<ValidateTvdbOutput> => {
    const api = getAni2arrApi();
    return api.validateTvdbId({ tvdbId });
  }, []);

  return {
    setOverride,
    clearOverride,
    validateTvdbId,
    isSetting: setMappingOverride.isPending,
    isClearing: clearMappingOverride.isPending,
  };
}

