/** Options-page save, connect, disconnect, and reset flows for provider settings. */
// src/entrypoints/options/hooks/use-settings-actions.ts

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { useFormContext } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  useSaveOptions,
} from '@/shared/queries';
import { useTestProviderConnection } from '@/features/options/use-provider-connection-check';
import {
  validateProviderConnectionApiKey,
  validateProviderConnectionUrl,
} from '@/shared/schemas/provider-connection.schema';
import {
  getProviderHostPermissionPattern,
  removeProviderHostPermission,
  requestProviderHostPermission,
} from '@/runtime/permissions/provider-host-permissions';
import { logger } from '@/shared/utils/logger';
import type { Settings, SettingsFormValues } from '@/shared/schemas/settings';
import { createDefaultSettings } from '@/shared/schemas/settings';
import { parseSettings } from '@/storage';
import type { ExtensionOptions } from '@/shared/types';

interface UseSettingsActionsParams {
  savedSettings?: Settings;
}

type ProviderKey = 'sonarr' | 'radarr';

type PreparedProviderState = {
  url: string;
  apiKey: string;
  configured: boolean;
  permissionPattern: string | null;
};

const RESET_EXTENSION_STATE_MESSAGE_TYPE = 'a2a:reset-extension-state' as const;

export function useSettingsActions(params: UseSettingsActionsParams) {
  const { savedSettings } = params;
  const methods = useFormContext<SettingsFormValues>();
  const queryClient = useQueryClient();
  const saveOptions = useSaveOptions();
  const sonarrTestConnection = useTestProviderConnection();
  const radarrTestConnection = useTestProviderConnection();
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedSettingsRef = useRef<Settings | undefined>(undefined);

  useEffect(() => {
    savedSettingsRef.current = savedSettings ? parseSettings(savedSettings) : undefined;
  }, [savedSettings]);

  useEffect(() => {
    const subscription = methods.watch(() => {
      setSaveError(current => (current == null ? current : null));
    });
    return () => subscription.unsubscribe();
  }, [methods]);

  const invalidateSettingsQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.options() });
    queryClient.invalidateQueries({ queryKey: queryKeys.publicOptions() });
    queryClient.invalidateQueries({ queryKey: queryKeys.sonarrMetadataRoot() });
    queryClient.invalidateQueries({ queryKey: queryKeys.sonarrConnectionRoot() });
    queryClient.invalidateQueries({ queryKey: queryKeys.radarrMetadataRoot() });
    queryClient.invalidateQueries({ queryKey: queryKeys.radarrConnectionRoot() });
    queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverridesRoot() });
    queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusRoot('sonarr') });
    queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusRoot('radarr') });
  }, [queryClient]);

  const providerConfigs = useMemo(
    () =>
      ({
        sonarr: {
          label: 'Sonarr',
          buildPermissionPattern: getProviderHostPermissionPattern,
          requestPermission: requestProviderHostPermission,
          testConnectionState: sonarrTestConnection,
        },
        radarr: {
          label: 'Radarr',
          buildPermissionPattern: getProviderHostPermissionPattern,
          requestPermission: requestProviderHostPermission,
          testConnectionState: radarrTestConnection,
        },
      }) as const,
    [radarrTestConnection, sonarrTestConnection],
  );

  const prepareProvider = useCallback(
    (settings: Settings, provider: ProviderKey): PreparedProviderState => {
      const config = providerConfigs[provider];
      const rawUrl = String(settings.providers[provider].url ?? '').trim();
      const rawApiKey = String(settings.providers[provider].apiKey ?? '').trim();

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

      const urlValidation = validateProviderConnectionUrl(rawUrl);
      const apiKeyValidation = validateProviderConnectionApiKey(rawApiKey);

      if (!urlValidation.ok || !apiKeyValidation.ok) {
        throw new Error(`Please enter a valid ${config.label} URL and API key.`);
      }

      const normalizedUrl = urlValidation.value;
      const permissionPatternResult = config.buildPermissionPattern(normalizedUrl);
      if (!permissionPatternResult.ok) {
        logger.error(
          `Failed to determine host permission for ${config.label} URL.`,
          permissionPatternResult.error,
        );
        throw new Error(`Failed to update ${config.label} host permissions. Please try again.`);
      }

      return {
        url: normalizedUrl,
        apiKey: rawApiKey,
        configured: true,
        permissionPattern: permissionPatternResult.value,
      };
    },
    [providerConfigs],
  );

  const saveProviderConnection = useCallback(
    async (provider: ProviderKey): Promise<boolean> => {
      if (saveOptions.isPending || sonarrTestConnection.isPending || radarrTestConnection.isPending) {
        return false;
      }

      setSaveError(null);

      const rawValues = methods.getValues();
      const nextSettings = parseSettings(rawValues);
      const previousSettings = savedSettingsRef.current ?? createDefaultSettings();
      const config = providerConfigs[provider];

      let preparedCurrent: PreparedProviderState;
      let preparedPrevious: PreparedProviderState;

      try {
        preparedCurrent = prepareProvider(nextSettings, provider);
        preparedPrevious = prepareProvider(previousSettings, provider);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Please review the configured provider settings.');
        return false;
      }

      if (!preparedCurrent.configured) {
        setSaveError(`Please enter a valid ${config.label} URL and API key.`);
        return false;
      }

      const currentProviderSettings = nextSettings.providers[provider];
      const previousProviderSettings = previousSettings.providers[provider];
      const credentialsChanged =
        preparedCurrent.url !== preparedPrevious.url ||
        preparedCurrent.apiKey !== preparedPrevious.apiKey ||
        currentProviderSettings.providerTitleLanguage !== previousProviderSettings.providerTitleLanguage;

      if (!credentialsChanged) {
        return true;
      }

      const normalizedSettings: Settings = {
        ...previousSettings,
        providers: {
          ...previousSettings.providers,
          [provider]: {
            ...currentProviderSettings,
            ...previousProviderSettings,
            url: preparedCurrent.url,
            apiKey: preparedCurrent.apiKey,
            titleLanguage: currentProviderSettings.providerTitleLanguage,
          },
        },
      };

      try {
        await saveOptions.mutateAsync(normalizedSettings as ExtensionOptions);
        savedSettingsRef.current = normalizedSettings;

        methods.resetField(`providers.${provider}.url`, {
          defaultValue: preparedCurrent.url,
        });
        methods.resetField(`providers.${provider}.apiKey`, {
          defaultValue: preparedCurrent.apiKey,
        });
        methods.resetField(`providers.${provider}.providerTitleLanguage`, {
          defaultValue: currentProviderSettings.providerTitleLanguage,
        });

        if (
          preparedPrevious.permissionPattern &&
          preparedPrevious.permissionPattern !== preparedCurrent.permissionPattern
        ) {
          const removal = await removeProviderHostPermission(preparedPrevious.url);
          if (!removal.ok) {
            logger.warn(
              `Failed to remove previous ${config.label} host permission after provider save.`,
              removal.error,
            );
          } else if (!removal.value.removed) {
            logger.warn(`Previous ${config.label} host permission removal was rejected after provider save.`);
          }
        }

        queryClient.invalidateQueries({
          queryKey: provider === 'sonarr' ? queryKeys.sonarrMetadataRoot() : queryKeys.radarrMetadataRoot(),
        });
        queryClient.invalidateQueries({
          queryKey: provider === 'sonarr' ? queryKeys.sonarrConnectionRoot() : queryKeys.radarrConnectionRoot(),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusRoot(provider) });

        return true;
      } catch (error) {
        logger.error(`Failed to save ${config.label} connection details.`, error);
        setSaveError(`Failed to save ${config.label} connection details. Please try again.`);
        return false;
      }
    },
    [
      methods,
      prepareProvider,
      providerConfigs,
      queryClient,
      radarrTestConnection.isPending,
      saveOptions,
      sonarrTestConnection.isPending,
    ],
  );

  // TODO: Currently this clears both providers' mappings when disconnecting one. Refactor it so these are stored and cleared separately. 
  const disconnectProvider = useCallback(
    async (provider: ProviderKey): Promise<boolean> => {
      if (saveOptions.isPending || sonarrTestConnection.isPending || radarrTestConnection.isPending) {
        return false;
      }

      setSaveError(null);

      const previousSettings = savedSettingsRef.current ?? createDefaultSettings();
      const previousProviderSettings = previousSettings.providers[provider];
      const previousUrl = String(previousProviderSettings.url ?? '').trim();
      const config = providerConfigs[provider];

      const permissionPatternResult = previousUrl
        ? config.buildPermissionPattern(previousUrl)
        : null;
      const previousPermissionPattern =
        permissionPatternResult && permissionPatternResult.ok
          ? permissionPatternResult.value
          : null;

      if (permissionPatternResult && !permissionPatternResult.ok) {
        logger.warn(
          `Previous ${config.label} URL was invalid; skipping permission cleanup.`,
          permissionPatternResult.error,
        );
      }

      const normalizedSettings: Settings = {
        ...previousSettings,
        providers: {
          ...previousSettings.providers,
          [provider]: {
            ...previousProviderSettings,
            url: '',
            apiKey: '',
          },
        },
      };

      try {
        config.testConnectionState.reset();

        await saveOptions.mutateAsync(normalizedSettings as ExtensionOptions);
        savedSettingsRef.current = normalizedSettings;

        methods.resetField(`providers.${provider}.url`, {
          defaultValue: '',
        });
        methods.resetField(`providers.${provider}.apiKey`, {
          defaultValue: '',
        });

        if (previousPermissionPattern) {
          const removal = await removeProviderHostPermission(previousUrl);
          if (!removal.ok) {
            logger.warn(
              `Failed to remove ${config.label} host permission during disconnect.`,
              removal.error,
            );
          } else if (!removal.value.removed) {
            logger.warn(`${config.label} host permission removal was rejected during disconnect.`);
          }
        }

        queryClient.removeQueries({
          queryKey: provider === 'sonarr' ? queryKeys.sonarrMetadataRoot() : queryKeys.radarrMetadataRoot(),
        });
        queryClient.removeQueries({
          queryKey: provider === 'sonarr' ? queryKeys.sonarrConnectionRoot() : queryKeys.radarrConnectionRoot(),
        });
        queryClient.removeQueries({ queryKey: queryKeys.seriesStatusRoot(provider) });

        invalidateSettingsQueries();
        return true;
      } catch (error) {
        logger.error(`Failed to disconnect ${config.label}.`, error);
        setSaveError(`Failed to disconnect ${config.label}. Please try again.`);
        invalidateSettingsQueries();
        return false;
      }
    },
    [
      invalidateSettingsQueries,
      methods,
      providerConfigs,
      queryClient,
      radarrTestConnection.isPending,
      saveOptions,
      sonarrTestConnection.isPending,
    ],
  );

  const handleSave = useCallback(
    async (): Promise<boolean> => {
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

      let preparedProviders: Record<ProviderKey, PreparedProviderState>;

      try {
        preparedProviders = {
          sonarr: prepareProvider(nextSettings, 'sonarr'),
          radarr: prepareProvider(nextSettings, 'radarr'),
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
          logger.warn(
            `Previous ${config.label} URL was invalid; skipping permission cleanup.`,
            previousPermissionPatternResult.error,
          );
        }

        return {
          provider,
          label: config.label,
          current,
          previousUrl,
          credentialsChanged: current.url !== previousUrl || current.apiKey !== previousApiKey,
          hostChanged: current.permissionPattern !== previousPermissionPattern,
          previousPermissionPattern,
          requestPermission: config.requestPermission,
          testConnectionState: config.testConnectionState,
        };
      });

      const grantedPermissions: Array<{ provider: ProviderKey; url: string }> = [];
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
          if (!permission.ok) {
            setSaveError(permission.error);
            return false;
          }
          if (!permission.value.granted) {
            setSaveError(`${state.label} host permission was not granted.`);
            return false;
          }
          grantedPermissions.push({ provider: state.provider, url: state.current.url });
        }

        for (const state of providerStates) {
          if (!state.current.configured || !state.credentialsChanged) {
            continue;
          }

          stage = 'test';
          await state.testConnectionState.mutateAsync({
            provider: state.provider,
            credentials: {
              url: state.current.url,
              apiKey: state.current.apiKey,
            },
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
          const removal = await removeProviderHostPermission(state.previousUrl);
          if (!removal.ok || !removal.value.removed) {
            logger.error(
              `Error removing host permission for previous ${state.label} URL.`,
              removal.ok ? 'Permission removal rejected without throwing.' : removal.error,
            );
            setSaveError(`Failed to update ${state.label} host permissions. Please try again.`);

            await saveOptions.mutateAsync(previousSettings as ExtensionOptions);
            methods.reset(previousSettings as SettingsFormValues);

            for (const granted of grantedPermissions) {
              const rollback = await removeProviderHostPermission(granted.url);
              if (!rollback.ok) {
                logger.warn(
                  `Failed to roll back ${granted.provider} host permission after removal failure.`,
                  rollback.error,
                );
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
          const rollback = await removeProviderHostPermission(granted.url);
          if (!rollback.ok) {
            logger.warn(
              `Failed to roll back ${granted.provider} host permission after save error.`,
              rollback.error,
            );
          }
        }
        return false;
      }
    },
    [
      invalidateSettingsQueries,
      methods,
      prepareProvider,
      providerConfigs,
      radarrTestConnection,
      saveOptions,
      sonarrTestConnection,
    ],
  );

  const handleReset = useCallback(async (): Promise<void> => {
    setSaveError(null);
    const defaults = createDefaultSettings();

    try {
      await browser.runtime.sendMessage({
        _a2a: true,
        type: RESET_EXTENSION_STATE_MESSAGE_TYPE,
        timestamp: Date.now(),
      });
      methods.reset(defaults as SettingsFormValues);
    } finally {
      invalidateSettingsQueries();
    }
  }, [methods, invalidateSettingsQueries]);

  return {
    handleSave,
    saveProviderConnection,
    disconnectProvider,
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
