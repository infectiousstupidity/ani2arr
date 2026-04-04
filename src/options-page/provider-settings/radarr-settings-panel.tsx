/** Radarr provider-settings panel for connection state and default add options. */
// src/options-page/provider-settings/radarr-settings-panel.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/queries';
import {
  validateProviderConnectionApiKey,
  validateProviderConnectionUrl,
} from '@/providers/settings/provider-connection.schema';
import type { SettingsActions } from '../hooks/use-settings-actions';
import { requestProviderHostPermission } from '@/providers/permissions/host-permissions';
import { logger } from '@/shared/utils/logger';
import { getAniListTitleLanguageLabel } from '@/shared/utils/anilist-title-preference';
import { useToast } from '@/shared/ui/feedback/toast-provider';
import { useProviderConnectionCheck } from '@/features/options/use-provider-connection-check';
import { useProviderConnectionStatus } from '@/features/options/use-provider-connection-status';
import {
  ProviderConnectionCard,
  ProviderConnectionStatusBadge,
  PreferredAniListTitleLanguageField,
} from './provider-connection-card';
import { RadarrDefaultsSection } from './radarr-defaults-section';
import { useSelectPortal } from './use-select-portal';
import type { ExtensionOptions } from '@/options';
import { useRadarrMetadata } from '@/providers/hooks/radarr.queries';

export interface RadarrSettingsPanelProps {
  actions: SettingsActions;
  savedSettings?: ExtensionOptions;
  isLoading?: boolean;
}

const RadarrSettingsPanel: React.FC<RadarrSettingsPanelProps> = ({
  actions,
  savedSettings,
  isLoading,
}) => {
  const methods = useFormContext<ExtensionOptions>();
  const queryClient = useQueryClient();
  const toast = useToast();

  const radarrUrl = useWatch({ control: methods.control, name: 'providers.radarr.url' }) ?? '';
  const radarrApiKey = useWatch({ control: methods.control, name: 'providers.radarr.apiKey' }) ?? '';
  const preferredAniListTitleLanguage =
    useWatch({ control: methods.control, name: 'providers.radarr.preferredAniListTitleLanguage' }) ?? 'english';

  const selectPortal = useSelectPortal();

  const radarrUrlInputRef = useRef<HTMLInputElement | null>(null);
  const [forceEditing, setForceEditing] = useState(false);
  const [confirmedScope, setConfirmedScope] = useState<string | null>(null);

  const hasSavedCredentials = Boolean(
    savedSettings?.providers.radarr.url && savedSettings?.providers.radarr.apiKey,
  );

  const persistedCredentials = useMemo(() => {
    if (!hasSavedCredentials || !savedSettings) return null;
    return {
      url: String(savedSettings.providers.radarr.url).trim(),
      apiKey: String(savedSettings.providers.radarr.apiKey).trim(),
    };
  }, [hasSavedCredentials, savedSettings]);

  const isEditingConnection = forceEditing || !hasSavedCredentials;

  const credentialValidation = useMemo(
    () => ({
      url: validateProviderConnectionUrl(String(radarrUrl)),
      apiKey: validateProviderConnectionApiKey(String(radarrApiKey)),
    }),
    [radarrApiKey, radarrUrl],
  );

  const hasValidCredentials = credentialValidation.url.ok && credentialValidation.apiKey.ok;
  const normalizedUrl = credentialValidation.url.ok ? credentialValidation.url.value : String(radarrUrl).trim();

  const formCredentials = useMemo(
    () =>
      hasValidCredentials
        ? { url: normalizedUrl, apiKey: String(radarrApiKey).trim() }
        : null,
    [hasValidCredentials, normalizedUrl, radarrApiKey],
  );

  const credentialScope = useMemo(
    () => (formCredentials ? `${formCredentials.url}|${formCredentials.apiKey}` : null),
    [formCredentials],
  );
  const persistedCredentialScope = useMemo(
    () =>
      persistedCredentials
        ? `${persistedCredentials.url}|${persistedCredentials.apiKey}`
        : null,
    [persistedCredentials],
  );

  const hasConfiguredConnection = Boolean(
    hasSavedCredentials || (credentialScope && confirmedScope === credentialScope),
  );

  useEffect(() => {
    if (!credentialScope) {
      setConfirmedScope(null);
      return;
    }
    if (confirmedScope && credentialScope !== confirmedScope) {
      setConfirmedScope(null);
    }
  }, [confirmedScope, credentialScope]);

  useEffect(() => {
    if (isLoading) return;
    if (hasConfiguredConnection) return;
    if (radarrUrl.trim().length > 0) return;
    radarrUrlInputRef.current?.focus();
  }, [hasConfiguredConnection, isLoading, radarrUrl]);

  const useConfirmedDraftCredentials = Boolean(formCredentials && confirmedScope === credentialScope);
  const usePersistedCredentials = Boolean(
    persistedCredentials &&
      (!isEditingConnection || credentialScope === persistedCredentialScope || credentialScope === null),
  );
  const metadataEnabled = usePersistedCredentials || useConfirmedDraftCredentials;
  let metadataCredentials = null;
  if (useConfirmedDraftCredentials) {
    metadataCredentials = formCredentials;
  } else if (usePersistedCredentials) {
    metadataCredentials = persistedCredentials;
  }

  const liveConnectionQuery = useProviderConnectionCheck({
    provider: 'radarr',
    enabled: metadataEnabled,
    credentials: metadataCredentials,
  });

  const metadataQuery = useRadarrMetadata({
    enabled: metadataEnabled,
    credentials: metadataCredentials,
  });

  const isConnectionChecking =
    actions.radarrTestConnectionState.isPending ||
    (metadataEnabled && liveConnectionQuery.isFetching);
  const connectionStatus = useProviderConnectionStatus({
    hasConfiguredCredentials: hasSavedCredentials,
    isChecking: isConnectionChecking,
    isConnected: liveConnectionQuery.isSuccess,
  });

  useEffect(() => {
    if (!metadataQuery.data) return;

    const { qualityProfiles = [], rootFolders = [] } = metadataQuery.data;
    const currentDefaults = methods.getValues('providers.radarr.defaults');

    let nextProfileId = currentDefaults.qualityProfileId;
    let nextRootPath = currentDefaults.rootFolderPath;
    let shouldUpdate = false;

    if (!nextProfileId && qualityProfiles.length > 0) {
      nextProfileId = qualityProfiles[0]?.id ?? '';
      shouldUpdate = true;
    }

    if (!nextRootPath && rootFolders.length > 0) {
      nextRootPath = rootFolders[0]?.path ?? '';
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      if (nextProfileId !== currentDefaults.qualityProfileId) {
        methods.setValue('providers.radarr.defaults.qualityProfileId', nextProfileId, { shouldDirty: true });
      }
      if (nextRootPath !== currentDefaults.rootFolderPath) {
        methods.setValue('providers.radarr.defaults.rootFolderPath', nextRootPath, { shouldDirty: true });
      }
    }
  }, [metadataQuery.data, methods]);

  const setRadarrUrl = useCallback(
    (value: string) => {
      methods.setValue('providers.radarr.url', value, { shouldDirty: true });
      actions.radarrTestConnectionState.reset();
    },
    [actions.radarrTestConnectionState, methods],
  );

  const setRadarrApiKey = useCallback(
    (value: string) => {
      methods.setValue('providers.radarr.apiKey', value, { shouldDirty: true });
      actions.radarrTestConnectionState.reset();
    },
    [actions.radarrTestConnectionState, methods],
  );

  const setPreferredAniListTitleLanguage = useCallback(
    (value: typeof preferredAniListTitleLanguage) => {
      methods.setValue('providers.radarr.preferredAniListTitleLanguage', value, { shouldDirty: true });
    },
    [methods],
  );

  const handleTestConnection = useCallback(async (): Promise<boolean> => {
    if (!formCredentials || !credentialScope) {
      return false;
    }

    const permission = await requestProviderHostPermission(formCredentials.url);
    if (!permission.ok) {
      logger.warn('Radarr permission request failed, aborting connection test.', permission.error);
      return false;
    }
    if (!permission.value.granted) {
      logger.warn('Radarr permission denied, aborting connection test.');
      return false;
    }

    try {
      await actions.radarrTestConnectionState.mutateAsync({
        provider: 'radarr',
        credentials: formCredentials,
      });
      const saved = await actions.saveProviderConnection('radarr');
      if (!saved) {
        return false;
      }

      setConfirmedScope(credentialScope);

      try {
        await Promise.all([
          liveConnectionQuery.refetch(),
          metadataQuery.refetch(),
        ]);
      } catch {
        queryClient.invalidateQueries({ queryKey: queryKeys.radarrMetadataRoot() });
        queryClient.invalidateQueries({ queryKey: queryKeys.radarrConnectionRoot() });
      }

      toast.showToast({
        title: 'Radarr connected',
        description: 'Connection details were saved. Save settings to keep any default add option changes.',
        variant: 'success',
      });
      return true;
    } catch (error) {
      logger.error('Radarr connection test failed', error);
      return false;
    }
  }, [actions, credentialScope, formCredentials, liveConnectionQuery, metadataQuery, queryClient, toast]);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.radarrMetadataRoot() });
  }, [queryClient]);

  const handleDisconnect = useCallback(async () => {
    const disconnected = await actions.disconnectProvider('radarr');
    if (!disconnected) {
      return;
    }

    setConfirmedScope(null);
    setForceEditing(true);
  }, [actions]);

  if (isLoading) {
    return <div className="text-center p-8 text-text-secondary">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="a2a-settings-panel p-5 md:p-6">
        <div className="a2a-settings-panel__header flex items-start justify-between gap-3 border-b pb-4">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Connection</h3>
            <p className="mt-1 text-xs text-text-secondary">
              Connect Radarr, then set the defaults ani2arr reuses for movie actions.
            </p>
          </div>
          <ProviderConnectionStatusBadge status={connectionStatus} />
        </div>
        <div className="mt-4">
          <ProviderConnectionCard
            providerLabel="Radarr"
            urlLabel="Radarr URL"
            urlPlaceholder="http://localhost:7878"
            apiKeyLabel="Radarr API key"
            urlHelp={
              <>
                Firefox needs an optional host permission for the exact Radarr origin you enter here.
                ani2arr requests access only for the origin you configure at runtime.
              </>
            }
            apiKeyHelp={
              <>
                The API key lets ani2arr authenticate with your Radarr server so it can test the
                connection, read metadata, and add or update movies. It is stored only in browser
                local storage and sent only to the Radarr origin you configure.
              </>
            }
            urlDescription="Only the exact origin you enter is requested at runtime. Saved credentials stay in browser local storage."
            urlInputRef={radarrUrlInputRef}
            isEditingConnection={isEditingConnection}
            isConnected={hasConfiguredConnection}
            url={String(radarrUrl)}
            apiKey={String(radarrApiKey)}
            onStartEditing={() => setForceEditing(true)}
            onConnectionConfirmed={() => setForceEditing(false)}
            onDisconnect={handleDisconnect}
            onTestConnection={handleTestConnection}
            setUrl={setRadarrUrl}
            setApiKey={setRadarrApiKey}
            testConnectionState={actions.radarrTestConnectionState}
            saveState={actions.saveState}
            isLoading={Boolean(isLoading)}
            summaryFields={[
              { label: 'Radarr URL', value: normalizedUrl || 'Not configured' },
              {
                label: 'Preferred AniList title language',
                value: getAniListTitleLanguageLabel(preferredAniListTitleLanguage),
              },
            ]}
          >
            <PreferredAniListTitleLanguageField
              preferredAniListTitleLanguage={preferredAniListTitleLanguage}
              setPreferredAniListTitleLanguage={setPreferredAniListTitleLanguage}
              selectPortal={selectPortal}
              isLoading={Boolean(isLoading)}
            />
          </ProviderConnectionCard>
        </div>
      </section>

      <RadarrDefaultsSection
        actions={actions}
        portalContainer={selectPortal}
        metadataEnabled={metadataEnabled}
        metadataQuery={metadataQuery}
        onRefresh={handleRefresh}
      />
    </div>
  );
};

export default React.memo(RadarrSettingsPanel);
