// src/hooks/use-add-series-manager.ts
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  usePublicOptions,
  useSonarrMetadata,
  useAddSeries,
  useUpdateDefaultSettings,
} from './use-api-queries';
import type { MediaMetadataHint, SonarrFormState } from '@/shared/types';

export function useAddSeriesManager(
  anilistId: number,
  title: string,
  metadata: MediaMetadataHint | null,
  isOpen: boolean,
) {
  const { data: options, isLoading: isLoadingOptions } = usePublicOptions();

  const defaultFormState: SonarrFormState = {
    qualityProfileId: '',
    rootFolderPath: '',
    seriesType: 'anime',
    monitorOption: 'all',
    seasonFolder: true,
    searchForMissingEpisodes: true,
    tags: [],
    freeformTags: [],
  };

  const [formState, setFormState] = useState<SonarrFormState>(options?.defaults ?? defaultFormState);

  const sonarrReady = Boolean(options?.isConfigured);

  const sonarrMetadata = useSonarrMetadata({
    enabled: sonarrReady,
  });
  const addSeriesMutation = useAddSeries();
  const { mutate: saveDefaults, ...saveDefaultsMutation } = useUpdateDefaultSettings();

  useEffect(() => {
    if (isOpen && options?.defaults) {
      setFormState(options.defaults);
    }
  }, [isOpen, options?.defaults]);

  const isDirty = useMemo(() => {
    if (!formState || !options?.defaults) return false;
    return JSON.stringify(formState) !== JSON.stringify(options.defaults);
  }, [formState, options?.defaults]);

  const isLoading = isLoadingOptions || sonarrMetadata.isLoading;

  const handleFormChange = useCallback(<K extends keyof SonarrFormState>(field: K, value: SonarrFormState[K]) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleAddSeries = useCallback(() => {
    if (!sonarrReady) return;
    addSeriesMutation.mutate({
      anilistId,
      title,
      primaryTitleHint: title,
      metadata,
      form: formState,
    });
  }, [addSeriesMutation, anilistId, formState, metadata, sonarrReady, title]);

  const handleSaveDefaults = useCallback(() => {
    if (!formState || !options || !isDirty) return;
    saveDefaults({ ...formState });
  }, [formState, options, isDirty, saveDefaults]);

  return {
    formState,
    sonarrMetadata,
    isLoading,
    isDirty,
    sonarrReady,
    addSeriesState: addSeriesMutation,
    saveDefaultsState: saveDefaultsMutation,
    handleFormChange,
    handleAddSeries,
    handleSaveDefaults,
  };
}
