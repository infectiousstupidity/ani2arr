// src/shared/hooks/use-settings-actions.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { useFormContext } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  useSaveOptions,
  useTestConnection,
  useTestRadarrConnection,
} from '@/shared/queries';
import {
  buildSonarrPermissionPattern,
  requestSonarrPermission,
  validateApiKey as validateSonarrApiKey,
  validateUrl as validateSonarrUrl,
} from '@/shared/sonarr/validation';
import {
  buildRadarrPermissionPattern,
  requestRadarrPermission,
  validateApiKey as validateRadarrApiKey,
  validateUrl as validateRadarrUrl,
} from '@/shared/radarr/validation';
import { logger } from '@/shared/utils/logger';
import type { Settings, SettingsFormValues } from '@/shared/schemas/settings';
import { createDefaultSettings } from '@/shared/schemas/settings';
import { parseSettings } from '@/shared/options/storage';
import type { ExtensionOptions } from '@/shared/types';

interface UseSettingsActionsParams {
  savedSettings?: Settings;
}

type ProviderKey = 'sonarr' | 'radarr';

export function useSettingsActions(params: UseSettingsActionsParams) {
  const { savedSettings } = params;
  const methods = useFormContext<SettingsFormValues>();
  const queryClient = useQueryClient();
  const saveOptions = useSaveOptions();
  const sonarrTestConnection = useTestConnection();
  const radarrTestConnection = useTestRadarrConnection();
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
    queryClient.invalidateQueries({ queryKey: queryKeys.sonarrMetadataRoot() });
    queryClient.invalidateQueries({ queryKey: queryKeys.radarrMetadataRoot() });
  }, [queryClient]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (saveOptions.isPending || sonarrTestConnection.isPending || radarrTestConnection.isPending) {
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

    const providerConfigs = {
      sonarr: {
        label: 'Sonarr',
        validateUrl: validateSonarrUrl,
        validateApiKey: validateSonarrApiKey,
        buildPermissionPattern: buildSonarrPermissionPattern,
        requestPermission: requestSonarrPermission,
        testConnectionState: sonarrTestConnection,
      },
      radarr: {
        label: 'Radarr',
        validateUrl: validateRadarrUrl,
        validateApiKey: validateRadarrApiKey,
        buildPermissionPattern: buildRadarrPermissionPattern,
        requestPermission: requestRadarrPermission,
        testConnectionState: radarrTestConnection,
      },
    } as const;

    const prepareProvider = (provider: ProviderKey) => {
      const config = providerConfigs[provider];
      const rawUrl = String(nextSettings.providers[provider].url ?? '').trim();
      const rawApiKey = String(nextSettings.providers[provider].apiKey ?? '').trim();

      if (!rawUrl && !rawApiKey) {
        return {
          url: '',
          apiKey: '',
          configured: false,
          permissionPattern: null,
        };
      }

      if (!rawUrl || !rawApiKey) {
        throw new Error(`${config.label}: enter both URL and API key, or leave both blank.`);
      }

      const urlValidation = config.validateUrl(rawUrl);
      const apiKeyValidation = config.validateApiKey(rawApiKey);

      if (!urlValidation.isValid || !apiKeyValidation.isValid) {
        throw new Error(`Please enter a valid ${config.label} URL and API key.`);
      }

      const normalizedUrl = urlValidation.normalizedUrl ?? rawUrl;
      const permissionPatternResult = config.buildPermissionPattern(normalizedUrl);
      if (!permissionPatternResult.ok) {
        logger.error(`Failed to determine host permission for ${config.label} URL.`, permissionPatternResult.error);
        throw new Error(`Failed to update ${config.label} host permissions. Please try again.`);
      }

      return {
        url: normalizedUrl,
        apiKey: rawApiKey,
        configured: true,
        permissionPattern: permissionPatternResult.value,
      };
    };

    let preparedProviders: Record<
      ProviderKey,
      {
        url: string;
        apiKey: string;
        configured: boolean;
        permissionPattern: string | null;
      }
    >;

    try {
      preparedProviders = {
        sonarr: prepareProvider('sonarr'),
        radarr: prepareProvider('radarr'),
      };
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Please review the configured provider settings.');
      return false;
    }

    const normalizedSettings: Settings = {
      ...nextSettings,
      providers: {
        ...nextSettings.providers,
        sonarr: {
          ...nextSettings.providers.sonarr,
          url: preparedProviders.sonarr.url,
          apiKey: preparedProviders.sonarr.apiKey,
        },
        radarr: {
          ...nextSettings.providers.radarr,
          url: preparedProviders.radarr.url,
          apiKey: preparedProviders.radarr.apiKey,
        },
      },
    };

    const providerStates = (Object.keys(providerConfigs) as ProviderKey[]).map(provider => {
      const config = providerConfigs[provider];
      const current = preparedProviders[provider];
      const previousUrl = String(previousSettings.providers[provider].url ?? '').trim();
      const previousApiKey = String(previousSettings.providers[provider].apiKey ?? '').trim();
      const previousPermissionPatternResult = previousUrl ? config.buildPermissionPattern(previousUrl) : null;
      const previousPermissionPattern =
        previousPermissionPatternResult && previousPermissionPatternResult.ok
          ? previousPermissionPatternResult.value
          : null;

      if (previousPermissionPatternResult && !previousPermissionPatternResult.ok) {
        logger.warn(`Previous ${config.label} URL was invalid; skipping permission cleanup.`, previousPermissionPatternResult.error);
      }

      return {
        provider,
        label: config.label,
        current,
        credentialsChanged: current.url !== previousUrl || current.apiKey !== previousApiKey,
        hostChanged: current.permissionPattern !== previousPermissionPattern,
        previousPermissionPattern,
        requestPermission: config.requestPermission,
        testConnectionState: config.testConnectionState,
      };
    });

    const grantedPermissions: Array<{ provider: ProviderKey; pattern: string }> = [];
    let stage: 'permission' | 'test' | 'save' | 'cleanup' | null = null;

    try {
      sonarrTestConnection.reset();
      radarrTestConnection.reset();

      for (const state of providerStates) {
        if (!state.current.configured || !state.hostChanged || !state.current.permissionPattern) {
          continue;
        }

        stage = 'permission';
        const permission = await state.requestPermission(state.current.url);
        if (!permission.granted) {
          setSaveError(`${state.label} host permission was not granted.`);
          return false;
        }
        grantedPermissions.push({ provider: state.provider, pattern: state.current.permissionPattern });
      }

      for (const state of providerStates) {
        if (!state.current.configured || !state.credentialsChanged) {
          continue;
        }

        stage = 'test';
        await state.testConnectionState.mutateAsync({
          url: state.current.url,
          apiKey: state.current.apiKey,
        });
      }

      stage = 'save';
      await saveOptions.mutateAsync(normalizedSettings as ExtensionOptions);
      methods.reset(normalizedSettings as SettingsFormValues);

      for (const state of providerStates) {
        if (!state.previousPermissionPattern || state.previousPermissionPattern === state.current.permissionPattern) {
          continue;
        }

        stage = 'cleanup';
        try {
          const removed = await browser.permissions.remove({ origins: [state.previousPermissionPattern] });
          if (!removed) {
            throw new Error('Permission removal rejected without throwing.');
          }
        } catch (error) {
          logger.error(`Error removing host permission for previous ${state.label} URL.`, error);
          setSaveError(`Failed to update ${state.label} host permissions. Please try again.`);

          await saveOptions.mutateAsync(previousSettings as ExtensionOptions);
          methods.reset(previousSettings as SettingsFormValues);

          for (const granted of grantedPermissions) {
            try {
              await browser.permissions.remove({ origins: [granted.pattern] });
            } catch (rollbackError) {
              logger.warn(`Failed to roll back ${granted.provider} host permission after removal failure.`, rollbackError);
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
      } else if (stage === 'test') {
        setSaveError('Connection test failed. Please check your Arr URLs and API keys.');
      } else {
        setSaveError('Failed to update host permissions. Please try again.');
      }

      for (const granted of grantedPermissions) {
        try {
          await browser.permissions.remove({ origins: [granted.pattern] });
        } catch (rollbackError) {
          logger.warn(`Failed to roll back ${granted.provider} host permission after save error.`, rollbackError);
        }
      }
      return false;
    }
  }, [
    invalidateSettingsQueries,
    methods,
    radarrTestConnection,
    saveOptions,
    sonarrTestConnection,
  ]);

  const handleReset = useCallback(async (): Promise<void> => {
    setSaveError(null);
    const defaults = createDefaultSettings();
    const currentSettings = parseSettings(savedSettingsRef.current ?? methods.getValues());

    try {
      await saveOptions.mutateAsync(defaults as ExtensionOptions);
      methods.reset(defaults as SettingsFormValues);

      for (const provider of ['sonarr', 'radarr'] as ProviderKey[]) {
        const currentUrl = currentSettings.providers[provider].url;
        if (!currentUrl) {
          continue;
        }

        const permissionPatternResult =
          provider === 'sonarr'
            ? buildSonarrPermissionPattern(String(currentUrl))
            : buildRadarrPermissionPattern(String(currentUrl));

        if (permissionPatternResult.ok) {
          try {
            await browser.permissions.remove({ origins: [permissionPatternResult.value] });
          } catch (permError) {
            logger.warn(`Failed to remove ${provider} host permission during reset.`, permError);
          }
        } else {
          logger.warn(`Failed to determine ${provider} host permission for reset; skipping permission removal.`, permissionPatternResult.error);
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
    testConnectionState: sonarrTestConnection,
    sonarrTestConnectionState: sonarrTestConnection,
    radarrTestConnectionState: radarrTestConnection,
  };
}

export type SettingsActions = ReturnType<typeof useSettingsActions>;

export default useSettingsActions;
