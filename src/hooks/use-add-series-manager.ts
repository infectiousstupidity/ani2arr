// src/hooks/use-add-series-manager.ts
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useExtensionOptions, useSonarrMetadata, useAddSeries, useSaveOptions } from './use-api-queries';
import type { SonarrFormState } from '@/types';

export function useAddSeriesManager(anilistId: number, title: string, isOpen: boolean) {
  const { data: options, isLoading: isLoadingOptions } = useExtensionOptions();

  const [formState, setFormState] = useState<SonarrFormState>(options?.defaults || {
    qualityProfileId: '',
    rootFolderPath: '',
    seriesType: 'anime',
    monitorOption: 'all',
    seasonFolder: true,
    searchForMissingEpisodes: true,
    tags: [],
  });

  // API Hooks
  const sonarrMetadata = useSonarrMetadata(
    options ? { url: options.sonarrUrl, apiKey: options.sonarrApiKey } : null,
    { enabled: !!options }
  );
  const addSeriesMutation = useAddSeries();
  const { mutate: saveOptions, ...saveOptionsMutation } = useSaveOptions();

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

  // Handlers
  const handleFormChange = useCallback(<K extends keyof SonarrFormState>(field: K, value: SonarrFormState[K]) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleAddSeries = useCallback(() => {
    addSeriesMutation.mutate({
      ...formState,
      anilistId,
      title,
    });
  }, [formState, anilistId, title, addSeriesMutation]);

  const handleSaveDefaults = useCallback(() => {
    if (!formState || !options || !isDirty) return;
    saveOptions({
      ...options,
      defaults: formState,
    });
  }, [formState, options, isDirty, saveOptions]);

  return {
    formState,
    sonarrMetadata,
    isLoading,
    isDirty,
    addSeriesState: addSeriesMutation,
    saveDefaultsState: saveOptionsMutation,
    handleFormChange,
    handleAddSeries,
    handleSaveDefaults,
  };
}