// src/shared/hooks/use-settings-actions.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { useFormContext } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, useSaveOptions, useTestConnection } from '@/shared/api';
import { buildSonarrPermissionPattern, requestSonarrPermission, validateApiKey, validateUrl } from '@/shared/sonarr/validation';
import { logger } from '@/shared/utils/logger';
import type { Settings, SettingsFormValues } from '@/shared/schemas/settings';
import { createDefaultSettings } from '@/shared/schemas/settings';
import { parseSettings } from '@/shared/utils/storage/storage';
import type { ExtensionOptions } from '@/shared/types';

interface UseSettingsActionsParams {
  savedSettings?: Settings;
}

export function useSettingsActions(params: UseSettingsActionsParams) {
  const { savedSettings } = params;
  const methods = useFormContext<SettingsFormValues>();
  const queryClient = useQueryClient();
  const saveOptions = useSaveOptions();
  const testConnection = useTestConnection();
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedSettingsRef = useRef<Settings | undefined>(undefined);

  useEffect(() => {
    savedSettingsRef.current = savedSettings ? parseSettings(savedSettings) : undefined;
  }, [savedSettings]);

  useEffect(() => {
    const subscription = methods.watch(() => {
      // Only clear saveError when it's currently set to avoid unnecessary state updates
      setSaveError((current) => (current == null ? current : null));
    });
    return () => subscription.unsubscribe();
  }, [methods]);

  const invalidateSettingsQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.options() });
    queryClient.invalidateQueries({ queryKey: queryKeys.publicOptions() });
    queryClient.invalidateQueries({ queryKey: queryKeys.sonarrMetadata() });
  }, [queryClient]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (saveOptions.isPending || testConnection.isPending) {
      return false;
    }

    setSaveError(null);

    const isValid = await methods.trigger();
    if (!isValid) return false;

    const rawValues = methods.getValues();
    const nextSettings = parseSettings(rawValues);
    const previousSettings = savedSettingsRef.current ?? createDefaultSettings();

    if (!methods.formState.isDirty) {
      return false;
    }

    // Ensure properties are treated as strings (defensive cast)
    const rawSonarrUrl = String(nextSettings.sonarrUrl ?? '');
    const rawSonarrApiKey = String(nextSettings.sonarrApiKey ?? '');
    const urlValidation = validateUrl(rawSonarrUrl);
    const apiKeyValidation = validateApiKey(rawSonarrApiKey);

    if (!urlValidation.isValid || !apiKeyValidation.isValid) {
      setSaveError('Please enter a valid Sonarr URL and API key.');
      return false;
    }

    const normalizedSettings: Settings = {
      ...nextSettings,
      sonarrUrl: (urlValidation.normalizedUrl ?? rawSonarrUrl) as string,
      sonarrApiKey: rawSonarrApiKey.trim(),
    };

    const urlChanged = normalizedSettings.sonarrUrl !== (previousSettings?.sonarrUrl ?? '');

    const newPermissionPatternResult = buildSonarrPermissionPattern(String(normalizedSettings.sonarrUrl));
    if (!newPermissionPatternResult.ok) {
      logger.error('Failed to determine host permission for Sonarr URL.', newPermissionPatternResult.error);
      setSaveError('Failed to update host permissions. Please try again.');
      return false;
    }
    const newPermissionPattern = newPermissionPatternResult.value;

    const previousPermissionPatternResult =
      previousSettings?.sonarrUrl && String(previousSettings.sonarrUrl).length > 0
        ? buildSonarrPermissionPattern(String(previousSettings.sonarrUrl))
        : null;
    const previousPermissionPattern =
      previousPermissionPatternResult && previousPermissionPatternResult.ok
        ? previousPermissionPatternResult.value
        : null;

    if (previousPermissionPatternResult && !previousPermissionPatternResult.ok) {
      logger.warn('Previous Sonarr URL was invalid; skipping permission cleanup.', previousPermissionPatternResult.error);
    }

    let grantedNewHostPermission = false;
    let stage: 'permission' | 'test' | 'save' | 'cleanup' | null = null;

    try {
      if (urlChanged) {
        stage = 'permission';
        const permission = await requestSonarrPermission(String(normalizedSettings.sonarrUrl));
        if (!permission.granted) {
          setSaveError('Host permission was not granted.');
          return false;
        }
        grantedNewHostPermission = true;
      }

      stage = 'test';
      testConnection.reset();
      await testConnection.mutateAsync({
        url: String(normalizedSettings.sonarrUrl),
        apiKey: String(normalizedSettings.sonarrApiKey),
      });

      stage = 'save';
      await saveOptions.mutateAsync(normalizedSettings as ExtensionOptions);
      methods.reset(normalizedSettings as SettingsFormValues);

      if (urlChanged && previousPermissionPattern) {
        stage = 'cleanup';
        try {
          const removed = await browser.permissions.remove({ origins: [previousPermissionPattern] });
          if (!removed) {
            throw new Error('Permission removal rejected without throwing.');
          }
        } catch (error) {
          logger.error('Error removing host permission for previous Sonarr URL.', error);
          setSaveError('Failed to update host permissions. Please try again.');

          await saveOptions.mutateAsync(previousSettings as ExtensionOptions);
          methods.reset(previousSettings as SettingsFormValues);

          if (grantedNewHostPermission) {
            try {
              await browser.permissions.remove({ origins: [newPermissionPattern] });
            } catch (rollbackError) {
              logger.warn('Failed to roll back new host permission after removal failure.', rollbackError);
            }
          }

          invalidateSettingsQueries();
          return false;
        }
      }

      invalidateSettingsQueries();
      return true;
    } catch (error) {
      logger.error('useSettingsActions.handleSave caught error', error);
      if (stage === 'save') {
        setSaveError('Failed to save settings. Please try again.');
      } else {
        setSaveError('Connection test failed. Please check your Sonarr URL and API key.');
      }

      if (grantedNewHostPermission && newPermissionPattern) {
        try {
          await browser.permissions.remove({ origins: [newPermissionPattern] });
        } catch (rollbackError) {
          logger.warn('Failed to roll back new host permission after save error.', rollbackError);
        }
      }
      return false;
    }
  }, [saveOptions, testConnection, methods, invalidateSettingsQueries]);

  const handleReset = useCallback(async (): Promise<void> => {
    setSaveError(null);
    const defaults = createDefaultSettings();
    const currentSettings = parseSettings(savedSettingsRef.current ?? methods.getValues());
    const currentUrl = currentSettings.sonarrUrl;

    try {
      await saveOptions.mutateAsync(defaults as ExtensionOptions);
      methods.reset(defaults as SettingsFormValues);

      if (currentUrl) {
        const permissionPatternResult = buildSonarrPermissionPattern(String(currentUrl));
        if (permissionPatternResult.ok) {
          try {
            await browser.permissions.remove({ origins: [permissionPatternResult.value] });
          } catch (permError) {
            logger.warn('Failed to remove Sonarr host permission during reset.', permError);
          }
        } else {
          logger.warn('Failed to determine host permission for reset; skipping permission removal.', permissionPatternResult.error);
        }
      }
    } finally {
      invalidateSettingsQueries();
    }
  }, [saveOptions, methods, invalidateSettingsQueries]);

  return {
    handleSave,
    handleReset,
    saveError,
    saveState: saveOptions,
    testConnectionState: testConnection,
  };
}

export type SettingsActions = ReturnType<typeof useSettingsActions>;

export default useSettingsActions;
