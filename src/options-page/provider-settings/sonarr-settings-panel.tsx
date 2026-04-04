/** Sonarr provider-settings panel for connection state and default add options. */
// src/options-page/provider-settings/sonarr-settings-panel.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/shared/queries';
import type { SettingsActions } from '../hooks/use-settings-actions';
import { useProviderConnectionCheck } from '@/features/options/use-provider-connection-check';
import { useProviderConnectionStatus } from '@/features/options/use-provider-connection-status';
import {
  validateProviderConnectionApiKey,
  validateProviderConnectionUrl,
} from '@/providers/settings/provider-connection.schema';
import { requestProviderHostPermission } from '@/providers/permissions/host-permissions';
import { logger } from '@/shared/utils/logger';
import { getAniListTitleLanguageLabel } from '@/shared/utils/anilist-title-preference';
import { useToast } from '@/shared/ui/feedback/toast-provider';

import {
  ProviderConnectionCard,
  ProviderConnectionStatusBadge,
  PreferredAniListTitleLanguageField,
} from './provider-connection-card';
import type { SonarrAddOptionsFieldsLayout } from '@/components/provider-add-options/sonarr-add-options-fields';
import { SonarrDefaultsSection } from './sonarr-defaults-section';
import { useSelectPortal } from './use-select-portal';
import type { ExtensionOptions } from '@/options';
import { useSonarrMetadata } from '@/providers/hooks/sonarr.queries';

export interface SonarrSettingsPanelProps {
  actions: SettingsActions;
  savedSettings?: ExtensionOptions;
  layout?: SonarrAddOptionsFieldsLayout;
  isLoading?: boolean;
}

const SonarrSettingsPanel: React.FC<SonarrSettingsPanelProps> = ({
  actions,
  savedSettings,
  layout,
  isLoading,
}) => {
  const methods = useFormContext<ExtensionOptions>();
  const queryClient = useQueryClient();
  const toast = useToast();

  const sonarrUrl = useWatch({ control: methods.control, name: 'providers.sonarr.url' }) ?? '';
  const sonarrApiKey = useWatch({ control: methods.control, name: 'providers.sonarr.apiKey' }) ?? '';
  const preferredAniListTitleLanguage =
    useWatch({ control: methods.control, name: 'providers.sonarr.preferredAniListTitleLanguage' }) ?? 'english';

  const selectPortal = useSelectPortal();

  const sonarrUrlInputRef = useRef<HTMLInputElement | null>(null);
  const [forceEditing, setForceEditing] = useState(false);
  const [confirmedScope, setConfirmedScope] = useState<string | null>(null);

  const hasSavedCredentials = Boolean(
    savedSettings?.providers.sonarr.url && savedSettings?.providers.sonarr.apiKey,
  );

  const persistedCredentials = useMemo(() => {
    if (!hasSavedCredentials || !savedSettings) return null;
    return {
      url: String(savedSettings.providers.sonarr.url).trim(),
      apiKey: String(savedSettings.providers.sonarr.apiKey).trim(),
    };
  }, [hasSavedCredentials, savedSettings]);

  const isEditingConnection = forceEditing || !hasSavedCredentials;

  const credentialValidation = useMemo(
    () => ({
      url: validateProviderConnectionUrl(String(sonarrUrl)),
      apiKey: validateProviderConnectionApiKey(String(sonarrApiKey)),
    }),
    [sonarrApiKey, sonarrUrl],
  );

  const hasValidCredentials =
    credentialValidation.url.ok && credentialValidation.apiKey.ok;

  const normalizedUrl =
    credentialValidation.url.ok ? credentialValidation.url.value : String(sonarrUrl).trim();

  const formCredentials = useMemo(
    () =>
      hasValidCredentials
        ? { url: normalizedUrl, apiKey: String(sonarrApiKey).trim() }
        : null,
    [hasValidCredentials, normalizedUrl, sonarrApiKey],
  );

  const credentialScope = useMemo(
    () =>
      formCredentials
        ? `${formCredentials.url}|${formCredentials.apiKey}`
        : null,
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
    hasSavedCredentials ||
      (credentialScope && confirmedScope === credentialScope),
  );

  useEffect(() => {
    if (!credentialScope) {
      setConfirmedScope(null);
      return;
    }
    if (confirmedScope && credentialScope !== confirmedScope) {
      setConfirmedScope(null);
    }
  }, [credentialScope, confirmedScope]);

  useEffect(() => {
    if (isLoading) return;
    if (hasConfiguredConnection) return;
    if (sonarrUrl.trim().length > 0) return;
    sonarrUrlInputRef.current?.focus();
  }, [hasConfiguredConnection, isLoading, sonarrUrl]);

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
    provider: 'sonarr',
    enabled: metadataEnabled,
    credentials: metadataCredentials,
  });

  const metadataQuery = useSonarrMetadata({
    enabled: metadataEnabled,
    credentials: metadataCredentials,
  });

  const isConnectionChecking =
    actions.sonarrTestConnectionState.isPending ||
    (metadataEnabled && liveConnectionQuery.isFetching);
  const connectionStatus = useProviderConnectionStatus({
    hasConfiguredCredentials: hasSavedCredentials,
    isChecking: isConnectionChecking,
    isConnected: liveConnectionQuery.isSuccess,
  });

  useEffect(() => {
    if (!metadataQuery.data) return;

    const { qualityProfiles = [], rootFolders = [] } = metadataQuery.data;
    const currentDefaults = methods.getValues('providers.sonarr.defaults');

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
        methods.setValue('providers.sonarr.defaults.qualityProfileId', nextProfileId, { shouldDirty: true });
      }
      if (nextRootPath !== currentDefaults.rootFolderPath) {
        methods.setValue('providers.sonarr.defaults.rootFolderPath', nextRootPath, { shouldDirty: true });
      }
    }
  }, [metadataQuery.data, methods]);

  const setSonarrUrl = useCallback(
    (value: string) => {
      methods.setValue('providers.sonarr.url', value, { shouldDirty: true });
      actions.sonarrTestConnectionState.reset();
    },
    [actions.sonarrTestConnectionState, methods],
  );

  const setSonarrApiKey = useCallback(
    (value: string) => {
      methods.setValue('providers.sonarr.apiKey', value, { shouldDirty: true });
      actions.sonarrTestConnectionState.reset();
    },
    [actions.sonarrTestConnectionState, methods],
  );

  const setPreferredAniListTitleLanguage = useCallback(
    (value: typeof preferredAniListTitleLanguage) => {
      methods.setValue('providers.sonarr.preferredAniListTitleLanguage', value, { shouldDirty: true });
    },
    [methods],
  );

  const handleTestConnection = useCallback(async (): Promise<boolean> => {
    if (!formCredentials || !credentialScope) {
      return false;
    }

    const permission = await requestProviderHostPermission(formCredentials.url);
    if (!permission.ok) {
      logger.warn('Permission request failed, aborting connection test.', permission.error);
      return false;
    }
    if (!permission.value.granted) {
      logger.warn('Permission denied, aborting connection test.');
      return false;
    }

    try {
      await actions.sonarrTestConnectionState.mutateAsync({
        provider: 'sonarr',
        credentials: formCredentials,
      });
      const saved = await actions.saveProviderConnection('sonarr');
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
        queryClient.invalidateQueries({ queryKey: queryKeys.sonarrMetadataRoot() });
        queryClient.invalidateQueries({ queryKey: queryKeys.sonarrConnectionRoot() });
      }

      toast.showToast({
        title: 'Sonarr connected',
        description: 'Connection details were saved. Save settings to keep any default add option changes.',
        variant: 'success',
      });
      return true;
    } catch (error) {
      logger.error('Connection test failed', error);
      return false;
    }
  }, [actions, credentialScope, formCredentials, liveConnectionQuery, metadataQuery, queryClient, toast]);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.sonarrMetadataRoot(),
    });
  }, [queryClient]);

  const handleDisconnect = useCallback(async () => {
    const disconnected = await actions.disconnectProvider('sonarr');
    if (!disconnected) {
      return;
    }

    setConfirmedScope(null);
    setForceEditing(true);
  }, [actions]);

  if (isLoading) {
    return (
      <div className="text-center p-8 text-text-secondary">Loading settings...</div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="a2a-settings-panel p-5 md:p-6">
        <div className="a2a-settings-panel__header flex items-start justify-between gap-3 border-b pb-4">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Connection</h3>
            <p className="mt-1 text-xs text-text-secondary">
              Connect Sonarr, then set the defaults ani2arr reuses for series actions.
            </p>
          </div>
          <ProviderConnectionStatusBadge status={connectionStatus} />
        </div>
        <div className="mt-4">
          <ProviderConnectionCard
            providerLabel="Sonarr"
            urlLabel="Sonarr URL"
            urlPlaceholder="http://localhost:8989"
            apiKeyLabel="Sonarr API key"
            urlHelp={
              <>
                Firefox needs an optional host permission for the exact Sonarr origin you enter here.
                ani2arr declares broad optional host patterns so it can request access to your
                specific self-hosted server at runtime.
              </>
            }
            apiKeyHelp={
              <>
                The API key lets ani2arr authenticate with your Sonarr server so it can test the
                connection, read metadata, and add or update series. It is stored only in browser
                local storage and sent only to the Sonarr origin you configure.
              </>
            }
            urlDescription="Only the exact origin you enter is requested at runtime. Saved credentials stay in browser local storage."
            urlInputRef={sonarrUrlInputRef}
            isEditingConnection={isEditingConnection}
            isConnected={hasConfiguredConnection}
            url={String(sonarrUrl)}
            apiKey={String(sonarrApiKey)}
            onStartEditing={() => setForceEditing(true)}
            onConnectionConfirmed={() => setForceEditing(false)}
            onDisconnect={handleDisconnect}
            onTestConnection={handleTestConnection}
            setUrl={setSonarrUrl}
            setApiKey={setSonarrApiKey}
            testConnectionState={actions.sonarrTestConnectionState}
            saveState={actions.saveState}
            isLoading={Boolean(isLoading)}
            summaryFields={[
              { label: 'Sonarr URL', value: normalizedUrl || 'Not configured' },
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

      <SonarrDefaultsSection
        actions={actions}
        portalContainer={selectPortal}
        metadataEnabled={metadataEnabled}
        metadataQuery={metadataQuery}
        onRefresh={handleRefresh}
        layout={layout}
      />
    </div>
  );
};

export default React.memo(SonarrSettingsPanel);
