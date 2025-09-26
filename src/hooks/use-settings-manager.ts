import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useExtensionOptions,
  useSaveOptions,
  useTestConnection,
  useSonarrMetadata,
  queryKeys,
} from './use-api-queries';
import type { ExtensionOptions, SonarrFormState } from '@/types';
import { requestSonarrPermission, validateUrl, validateApiKey } from '@/utils/validation';
import { logger } from '@/utils/logger';

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
  const { mutateAsync: testConnection, ...testConnectionMutation } = useTestConnection();
  const { mutate: saveOptions, ...saveMutation } = useSaveOptions();

  const isConnected = testConnectionMutation.isSuccess;

  const isDirty = useMemo(() => {
    if (!formState || !savedOptions) return false;
    const completeSavedOptions = mergeOptionsWithDefaults(savedOptions);
    return JSON.stringify(formState) !== JSON.stringify(completeSavedOptions);
  }, [formState, savedOptions]);

  const lastSyncedOptionsRef = useRef<ExtensionOptions | null>(null);

  const sonarrCredentials = useMemo(
    () => ({ url: formState.sonarrUrl, apiKey: formState.sonarrApiKey }),
    [formState.sonarrUrl, formState.sonarrApiKey],
  );

  const sonarrMetadata = useSonarrMetadata(sonarrCredentials, { enabled: isConnected });

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
      !!(completeOptions.sonarrUrl && completeOptions.sonarrApiKey) &&
      (!previous ||
        previous.sonarrUrl !== completeOptions.sonarrUrl ||
        previous.sonarrApiKey !== completeOptions.sonarrApiKey);

    if (credentialsChanged) {
      testConnection({ url: completeOptions.sonarrUrl, apiKey: completeOptions.sonarrApiKey }).catch(() => {});
    }

    lastSyncedOptionsRef.current = completeOptions;
  }, [savedOptions, testConnection]);

  useEffect(() => {
    if (!sonarrMetadata.data) return;

    const { qualityProfiles, rootFolders } = sonarrMetadata.data;
    const currentDefaults = formState.defaults;

    const shouldUpdateProfile = !currentDefaults.qualityProfileId && qualityProfiles?.length > 0;
    const shouldUpdateFolder = !currentDefaults.rootFolderPath && rootFolders?.length > 0;

    if (shouldUpdateProfile || shouldUpdateFolder) {
      setFormState(prev => {
        const newDefaults = { ...prev.defaults };
        if (shouldUpdateProfile) {
          newDefaults.qualityProfileId = qualityProfiles[0]?.id ?? '';
        }
        if (shouldUpdateFolder) {
          newDefaults.rootFolderPath = rootFolders[0]?.path ?? '';
        }
        return { ...prev, defaults: newDefaults };
      });
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
    const { sonarrUrl, sonarrApiKey } = formState;
    if (!validateUrl(sonarrUrl).isValid || !validateApiKey(sonarrApiKey).isValid) {
      log.warn('Validation failed, skipping connection test.');
      return;
    }
    const permission = await requestSonarrPermission(sonarrUrl);
    if (permission.granted) {
      await testConnection({ url: sonarrUrl, apiKey: sonarrApiKey });
    } else {
      log.warn('Permission denied by user.');
    }
  }, [formState, testConnection]);

  const handleSave = useCallback(async () => {
    if (!isDirty || saveMutation.isPending) return;

    const { sonarrUrl, sonarrApiKey } = formState;
    if (!validateUrl(sonarrUrl).isValid || !validateApiKey(sonarrApiKey).isValid) {
      log.error('Cannot save, invalid Sonarr URL or API key.');
      return;
    }
    
    try {
      const permission = await requestSonarrPermission(sonarrUrl);
      if (!permission.granted) {
        log.warn('Permission denied, aborting save.');
        return;
      }
      
      // Test connection before saving to ensure credentials are valid
      await testConnection({ url: sonarrUrl, apiKey: sonarrApiKey });

      // Only save if the test connection succeeds
      saveOptions(formState);

    } catch (error) {
      log.error('Connection test failed. Settings not saved.', error);
    }
  }, [formState, isDirty, saveOptions, testConnection, saveMutation.isPending]);

  const handleRefresh = useCallback(() => {
    if (isConnected) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sonarrMetadata({ url: formState.sonarrUrl, apiKey: formState.sonarrApiKey }),
      });
    }
  }, [isConnected, queryClient, formState.sonarrUrl, formState.sonarrApiKey]);

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