// src/shared/components/settings-form.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';

import { useSonarrConnectionStatus, useSonarrMetadata, queryKeys } from '@/shared/queries';
import { useDisplayedConnectionStatus } from '@/shared/hooks/common/use-displayed-connection-status';
import type { ProviderConnectionStatus } from '@/shared/providers/common/connection-status';
import type { Settings, SettingsFormValues } from '@/shared/schemas/settings';
import type { SettingsActions } from '@/entrypoints/options/hooks/use-settings-actions';
import {
  requestSonarrPermission,
  validateApiKey,
  validateUrl,
} from '@/shared/providers/sonarr/validation';
import { logger } from '@/shared/utils/logger';
import { useToast } from '@/shared/ui/feedback/toast-provider';

import {
  ProviderConnectionCard,
  ProviderConnectionStatusBadge,
  SonarrTitleLanguageField,
} from './settings-connection-card';
import { SonarrDefaultsSection } from './settings-sonarr-defaults';
import type { SonarrFormLayout } from '@/ui/provider-forms/sonarr';
import { useSelectPortal } from './use-select-portal';

export interface SettingsFormProps {
  actions: SettingsActions;
  savedSettings?: Settings;
  sonarrFormLayout?: SonarrFormLayout;
  isLoading?: boolean;
}

function SettingsFormInner({
  actions,
  savedSettings,
  sonarrFormLayout,
  isLoading,
}: SettingsFormProps): React.JSX.Element {
  const methods = useFormContext<SettingsFormValues>();
  const queryClient = useQueryClient();
  const toast = useToast();

  // --- Form Watchers ---
  const sonarrUrl = useWatch({ control: methods.control, name: 'providers.sonarr.url' }) ?? '';
  const sonarrApiKey = useWatch({ control: methods.control, name: 'providers.sonarr.apiKey' }) ?? '';
  const providerTitleLanguage = useWatch({ control: methods.control, name: 'providers.sonarr.providerTitleLanguage' }) ?? 'english';

  // --- Portal ---
  const selectPortal = useSelectPortal();

  // --- State & Refs ---
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

  // --- Credential Validation ---
  const credentialValidation = useMemo(
    () => ({
      url: validateUrl(String(sonarrUrl)),
      apiKey: validateApiKey(String(sonarrApiKey)),
    }),
    [sonarrApiKey, sonarrUrl],
  );

  const hasValidCredentials =
    credentialValidation.url.isValid && credentialValidation.apiKey.isValid;

  const normalizedUrl =
    credentialValidation.url.normalizedUrl ?? String(sonarrUrl).trim();

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

  // Reset confirmed scope if credentials change
  useEffect(() => {
    if (!credentialScope) {
      setConfirmedScope(null);
      return;
    }
    if (confirmedScope && credentialScope !== confirmedScope) {
      setConfirmedScope(null);
    }
  }, [credentialScope, confirmedScope]);

  // Focus URL input on load if not connected
  useEffect(() => {
    if (isLoading) return;
    if (hasConfiguredConnection) return;
    if (sonarrUrl.trim().length > 0) return;
    sonarrUrlInputRef.current?.focus();
  }, [hasConfiguredConnection, isLoading, sonarrUrl]);

  // --- Metadata & Defaults ---
  const useConfirmedDraftCredentials = Boolean(formCredentials && confirmedScope === credentialScope);
  const usePersistedCredentials = Boolean(
    persistedCredentials &&
      (!isEditingConnection || credentialScope === persistedCredentialScope || credentialScope === null),
  );
  const metadataEnabled = usePersistedCredentials || useConfirmedDraftCredentials;

  const metadataCredentials = useConfirmedDraftCredentials
    ? formCredentials
    : usePersistedCredentials
      ? persistedCredentials
      : null;

  const liveConnectionQuery = useSonarrConnectionStatus({
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
  const rawConnectionStatus: ProviderConnectionStatus =
    isConnectionChecking
      ? 'connecting'
      : liveConnectionQuery.isSuccess
        ? 'connected'
        : hasSavedCredentials
          ? 'configured'
          : 'not-configured';
  const connectionStatus = useDisplayedConnectionStatus(rawConnectionStatus, {
    fallbackStatus: hasSavedCredentials ? 'configured' : 'not-configured',
  });

  // Auto-select defaults when metadata first loads
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

  // --- Handlers ---

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

  const setProviderTitleLanguage = useCallback(
    (value: typeof providerTitleLanguage) => {
      methods.setValue('providers.sonarr.providerTitleLanguage', value, { shouldDirty: true });
    },
    [methods],
  );

  const handleTestConnection = useCallback(async (): Promise<boolean> => {
    if (!formCredentials || !credentialScope) {
      return false;
    }

    const permission = await requestSonarrPermission(formCredentials.url);
    if (!permission.granted) {
      logger.warn('Permission denied, aborting connection test.');
      return false;
    }

    try {
      await actions.sonarrTestConnectionState.mutateAsync(formCredentials);
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
    <>
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
                  label: 'Preferred title language',
                  value:
                    providerTitleLanguage === 'romaji'
                      ? 'Romaji'
                      : providerTitleLanguage === 'native'
                        ? 'Native'
                        : 'English',
                },
              ]}
            >
              <SonarrTitleLanguageField
                providerTitleLanguage={providerTitleLanguage}
                setProviderTitleLanguage={setProviderTitleLanguage}
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
          layout={sonarrFormLayout}
        />
      </div>
    </>
  );
}

function SettingsForm(props: SettingsFormProps): React.JSX.Element {
  return <SettingsFormInner {...props} />;
}

export default React.memo(SettingsForm);
