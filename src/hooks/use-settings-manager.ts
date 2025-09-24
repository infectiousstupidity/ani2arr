// src/hooks/use-settings-manager.ts
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useExtensionOptions, useSaveOptions, useTestConnection, useSonarrMetadata, queryKeys } from './use-api-queries';
import type { ExtensionOptions, SonarrFormState } from '@/types';
import { requestSonarrPermission } from '@/utils/validation';
import { logger } from '@/utils/logger';

// Helper to get a complete, default-filled initial state.
const getInitialOptions = (): ExtensionOptions => ({
  sonarrUrl: '',
  sonarrApiKey: '',
  defaults: {
    qualityProfileId: '',
    rootFolderPath: '',
    seriesType: 'anime',
    monitorOption: 'all',
    seasonFolder: true,
    searchForMissingEpisodes: true,
    tags: [],
  },
});

const mergeOptionsWithDefaults = (options: ExtensionOptions): ExtensionOptions => {
  const base = getInitialOptions();
  return {
    ...base,
    ...options,
    defaults: {
      ...base.defaults,
      ...options.defaults,
    },
  };
};

const defaultsEqual = (a: ExtensionOptions['defaults'], b: ExtensionOptions['defaults']): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const log = logger.create('SettingsManager');

export function useSettingsManager() {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<ExtensionOptions>(getInitialOptions());

  const { data: savedOptions, isLoading: isLoadingOptions } = useExtensionOptions();
  const { mutate: testConnection, ...testConnectionMutation } = useTestConnection();
  const { mutate: saveOptions, ...saveMutation } = useSaveOptions();

  const isConnected = testConnectionMutation.isSuccess;
  const isDirty = useMemo(() => {
    if (!formState || !savedOptions) return false;
    const isSonarrUrlDirty = formState.sonarrUrl !== savedOptions.sonarrUrl;
    const isSonarrApiKeyDirty = formState.sonarrApiKey !== savedOptions.sonarrApiKey;
    const isDefaultsDirty = (
      formState.defaults.qualityProfileId !== savedOptions.defaults.qualityProfileId ||
      formState.defaults.rootFolderPath !== savedOptions.defaults.rootFolderPath ||
      formState.defaults.seriesType !== savedOptions.defaults.seriesType ||
      formState.defaults.monitorOption !== savedOptions.defaults.monitorOption ||
      formState.defaults.seasonFolder !== savedOptions.defaults.seasonFolder ||
      formState.defaults.searchForMissingEpisodes !== savedOptions.defaults.searchForMissingEpisodes ||
      JSON.stringify(formState.defaults.tags) !== JSON.stringify(savedOptions.defaults.tags)
    );
    return isSonarrUrlDirty || isSonarrApiKeyDirty || isDefaultsDirty;
  }, [formState, savedOptions]);

  const lastSyncedOptionsRef = useRef<ExtensionOptions | null>(null);

  // Memoize credentials object to avoid unnecessary re-renders and query executions
  const sonarrCredentials = useMemo(
    () => ({ url: formState.sonarrUrl, apiKey: formState.sonarrApiKey }),
    [formState.sonarrUrl, formState.sonarrApiKey]
  );
  const sonarrMetadata = useSonarrMetadata(
    sonarrCredentials,
    { enabled: isConnected }
  );

  useEffect(() => {
    if (!savedOptions) return;

    const completeOptions = mergeOptionsWithDefaults(savedOptions);

    setFormState(prev => {
      if (
        prev.sonarrUrl === completeOptions.sonarrUrl &&
        prev.sonarrApiKey === completeOptions.sonarrApiKey &&
        defaultsEqual(prev.defaults, completeOptions.defaults)
      ) {
        return prev;
      }
      return completeOptions;
    });

    const previous = lastSyncedOptionsRef.current;
    const credentialsChanged =
      Boolean(completeOptions.sonarrUrl) &&
      Boolean(completeOptions.sonarrApiKey) &&
      (!previous ||
        previous.sonarrUrl !== completeOptions.sonarrUrl ||
        previous.sonarrApiKey !== completeOptions.sonarrApiKey);

    if (credentialsChanged) {
      testConnection({ url: completeOptions.sonarrUrl, apiKey: completeOptions.sonarrApiKey });
    }

    lastSyncedOptionsRef.current = completeOptions;
  }, [savedOptions, testConnection]);

  useEffect(() => {
    if (sonarrMetadata.data) {
      const { qualityProfiles, rootFolders } = sonarrMetadata.data;
      const currentDefaults = formState.defaults;

      // Only update if fields are empty and data is available
      const shouldUpdateProfile = !currentDefaults.qualityProfileId && qualityProfiles?.length > 0;
      const shouldUpdateFolder = !currentDefaults.rootFolderPath && rootFolders?.length > 0;

      if (shouldUpdateProfile || shouldUpdateFolder) {
        const newDefaults = { ...currentDefaults };

        if (shouldUpdateProfile) {
          const firstProfile = qualityProfiles[0];
          if (firstProfile) {
            newDefaults.qualityProfileId = firstProfile.id;
          }
        }

        if (shouldUpdateFolder) {
          const firstFolder = rootFolders[0];
          if (firstFolder) {
            newDefaults.rootFolderPath = firstFolder.path;
          }
        }

        // Only update if newDefaults actually differs from currentDefaults
        if (JSON.stringify(currentDefaults) !== JSON.stringify(newDefaults)) {
          setFormState(prev => ({ ...prev, defaults: newDefaults }));
        }
      }
    }
  }, [sonarrMetadata.data, formState.defaults]);
  
  const handleFieldChange = useCallback(<K extends keyof ExtensionOptions>(key: K, value: ExtensionOptions[K]) => {
    setFormState(prev => ({ ...prev, [key]: value }));
    if (key === 'sonarrUrl' || key === 'sonarrApiKey') {
      testConnectionMutation.reset();
    }
  }, [testConnectionMutation]);

  const handleDefaultsChange = useCallback(<K extends keyof SonarrFormState>(key: K, value: SonarrFormState[K]) => {
    setFormState(prev => ({ ...prev, defaults: { ...prev.defaults, [key]: value } }));
  }, []);

  const handleTestConnection = useCallback(async () => {
    if (!formState.sonarrUrl || !formState.sonarrApiKey) return;
    const permission = await requestSonarrPermission(formState.sonarrUrl);
    if (permission.granted) {
      testConnection({ url: formState.sonarrUrl, apiKey: formState.sonarrApiKey });
    } else {
      log.warn('Permission denied by user.');
    }
  }, [formState.sonarrUrl, formState.sonarrApiKey, testConnection]);

  const handleSave = useCallback(() => {
    if (isDirty) {
      saveOptions(formState);
    }
  }, [formState, isDirty, saveOptions]);
  
  const handleRefresh = useCallback(() => {
    if (isConnected) {
      queryClient.invalidateQueries({ queryKey: queryKeys.sonarrMetadata({ url: formState.sonarrUrl, apiKey: formState.sonarrApiKey }) });
    }
  },[isConnected, queryClient, formState.sonarrUrl, formState.sonarrApiKey]);

  const resetConnection = useCallback(() => {
    testConnectionMutation.reset();
  }, [testConnectionMutation]);

  return {
    formState,
    sonarrMetadata,
    isLoading: isLoadingOptions,
    isConnected,
    isDirty,
    testConnectionState: testConnectionMutation,
    saveState: saveMutation,
    handleFieldChange,
    handleDefaultsChange,
    handleTestConnection,
    handleSave,
    handleRefresh,
    resetConnection,
  };
}