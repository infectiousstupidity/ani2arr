// src/hooks/use-add-series-manager.ts
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useExtensionOptions, useSonarrMetadata, useAddSeries, useSaveOptions } from './use-api-queries';
import type { SonarrFormState } from '@/types';

export function useAddSeriesManager(anilistId: number, title: string, isOpen: boolean) {
  const { data: options, isLoading: isLoadingOptions } = useExtensionOptions();

  // This is a temporary state for the modal's edits. It's okay to use useState here
  // because the changes are not meant to be globally persistent until "Save" is clicked.
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

  // This effect cleanly resets the form to the current global defaults every time the modal opens.
  // This is the correct way to "sync" state for a temporary-edit modal.
  useEffect(() => {
    if (isOpen && options?.defaults) {
      setFormState(options.defaults);
    }
  }, [isOpen, options?.defaults]);

  // Derived State
  // This correctly compares the modal's local state against the global, query-managed state.
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

  // This handler is now simple and robust. It just fires our optimistic mutation.
  // The mutation hook itself handles all the complex logic of updating and re-fetching.
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