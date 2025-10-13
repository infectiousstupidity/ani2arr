// src/hooks/use-settings-manager.ts
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
import {
  buildSonarrPermissionPattern,
  requestSonarrPermission,
  validateUrl,
  validateApiKey,
} from '@/utils/validation';
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
  const formRef = useRef<ExtensionOptions>(getInitialOptions());
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: savedOptions, isLoading: isLoadingOptions } = useExtensionOptions();
  const testConnectionMutation = useTestConnection();
  const { mutateAsync: testConnection } = testConnectionMutation;
  const saveMutation = useSaveOptions();
  const { mutateAsync: saveOptions } = saveMutation;

  const isConnected = testConnectionMutation.isSuccess;

  const isDirty = useMemo(() => {
    if (!formState || !savedOptions) return false;
    const completeSavedOptions = mergeOptionsWithDefaults(savedOptions);
    return JSON.stringify(formState) !== JSON.stringify(completeSavedOptions);
  }, [formState, savedOptions]);

  const lastSyncedOptionsRef = useRef<ExtensionOptions | null>(null);

  const sonarrMetadata = useSonarrMetadata({
    enabled: isConnected,
    credentials: isConnected ? { url: formState.sonarrUrl, apiKey: formState.sonarrApiKey } : null,
  });

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
      formRef.current = completeOptions;
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
    setFormState(prev => {
      const next = { ...prev, [key]: value };
      formRef.current = next;
      return next;
    });
    setSaveError(null);
    if (key === 'sonarrUrl' || key === 'sonarrApiKey') {
      testConnectionMutation.reset();
    }
  }, [testConnectionMutation]);

  const handleDefaultsChange = useCallback(<K extends keyof SonarrFormState>(key: K, value: SonarrFormState[K]) => {
    setFormState(prev => {
      const next = { ...prev, defaults: { ...prev.defaults, [key]: value } };
      formRef.current = next;
      return next;
    });
    setSaveError(null);
  }, []);

  const handleTestConnection = useCallback(async () => {
    const { sonarrUrl, sonarrApiKey } = formRef.current;
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
  }, [testConnection]);

  const handleSave = useCallback(async () => {
    if (!isDirty || saveMutation.isPending) return;

    setSaveError(null);

    const { sonarrUrl, sonarrApiKey } = formState;
    if (!validateUrl(sonarrUrl).isValid || !validateApiKey(sonarrApiKey).isValid) {
      log.error('Cannot save, invalid Sonarr URL or API key.');
      return;
    }

    const previousOptions = lastSyncedOptionsRef.current;
    const previousUrl = previousOptions?.sonarrUrl ?? null;
    const urlChanged = previousUrl ? previousUrl !== sonarrUrl : Boolean(sonarrUrl);
    const newPermissionPattern = buildSonarrPermissionPattern(sonarrUrl);
    if (!newPermissionPattern) {
      log.error('Failed to determine host permission for Sonarr URL.');
      setSaveError('Failed to update host permissions. Please try again.');
      return;
    }

    const previousPermissionPattern =
      previousUrl && previousUrl.length > 0 ? buildSonarrPermissionPattern(previousUrl) : null;

    if (previousUrl && !previousPermissionPattern) {
      log.error('Failed to determine host permission for previous Sonarr URL.');
      setSaveError('Failed to update host permissions. Please try again.');
      return;
    }

    const revertToPreviousOptions = async () => {
      if (!previousOptions) return;

      try {
        await saveOptions(previousOptions);
        lastSyncedOptionsRef.current = {
          ...previousOptions,
          defaults: { ...previousOptions.defaults },
        };
        setFormState({
          ...previousOptions,
          defaults: { ...previousOptions.defaults },
        });
      } catch (revertError) {
        log.error('Failed to restore previous settings after permission removal failure.', revertError);
      }
    };

    let grantedNewHostPermission = false;

    try {
      const permission = await requestSonarrPermission(sonarrUrl);
      if (!permission.granted) {
        log.warn('Permission denied, aborting save.');
        return;
      }

      grantedNewHostPermission = urlChanged;

      // Test connection before saving to ensure credentials are valid
      await testConnection({ url: sonarrUrl, apiKey: sonarrApiKey });

      // Only save if the test connection succeeds
      await saveOptions(formState);
      lastSyncedOptionsRef.current = {
        ...formState,
        defaults: { ...formState.defaults },
      };

      if (urlChanged && previousPermissionPattern) {
        try {
          const removed = await browser.permissions.remove({ origins: [previousPermissionPattern] });
          if (!removed) {
            throw new Error('Permission removal rejected without throwing.');
          }
        } catch (error) {
          log.error('Error removing host permission for previous Sonarr URL.', error);
          setSaveError('Failed to update host permissions. Please try again.');

          await revertToPreviousOptions();

          if (grantedNewHostPermission && newPermissionPattern) {
            try {
              await browser.permissions.remove({ origins: [newPermissionPattern] });
            } catch (rollbackError) {
              log.error('Failed to roll back new host permission after removal failure.', rollbackError);
            }
          }

          return;
        }
      }

      setSaveError(null);
    } catch (error) {
      log.error('Connection test failed. Settings not saved.', error);

      if (grantedNewHostPermission && newPermissionPattern) {
        try {
          await browser.permissions.remove({ origins: [newPermissionPattern] });
        } catch (rollbackError) {
          log.error('Failed to roll back new host permission after save error.', rollbackError);
        }
      }
    }
  }, [
    formState,
    isDirty,
    saveMutation.isPending,
    saveOptions,
    testConnection,
    setFormState,
  ]);

  const handleRefresh = useCallback(() => {
    if (isConnected) {
      const scope = `${formState.sonarrUrl}|${formState.sonarrApiKey}`;
      queryClient.invalidateQueries({
        queryKey: queryKeys.sonarrMetadata(scope),
      });
    }
  }, [formState.sonarrApiKey, formState.sonarrUrl, isConnected, queryClient]);

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
    saveError,
  };
}
