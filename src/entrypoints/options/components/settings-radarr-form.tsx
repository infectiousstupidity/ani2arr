import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { browser } from 'wxt/browser';
import { useRadarrMetadata, queryKeys } from '@/shared/queries';
import type { Settings, SettingsFormValues } from '@/shared/schemas/settings';
import type { SettingsActions } from '@/entrypoints/options/hooks/use-settings-actions';
import { buildRadarrPermissionPattern, requestRadarrPermission, validateApiKey, validateUrl } from '@/shared/radarr/validation';
import { logger } from '@/shared/utils/logger';
import { ConnectionStatusBadge, ProviderConnectionCard } from './settings-connection-card';
import { RadarrDefaultsSection } from './settings-radarr-defaults';
import { SaveSettingsBar } from './settings-form';
import { useSelectPortal } from './use-select-portal';

export interface RadarrSettingsFormProps {
  actions: SettingsActions;
  savedSettings?: Settings;
  isLoading?: boolean;
}

function RadarrSettingsFormInner({
  actions,
  savedSettings,
  isLoading,
}: RadarrSettingsFormProps): React.JSX.Element {
  const methods = useFormContext<SettingsFormValues>();
  const queryClient = useQueryClient();

  const radarrUrl = useWatch({ control: methods.control, name: 'providers.radarr.url' }) ?? '';
  const radarrApiKey = useWatch({ control: methods.control, name: 'providers.radarr.apiKey' }) ?? '';

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
      url: validateUrl(String(radarrUrl)),
      apiKey: validateApiKey(String(radarrApiKey)),
    }),
    [radarrApiKey, radarrUrl],
  );

  const hasValidCredentials = credentialValidation.url.isValid && credentialValidation.apiKey.isValid;
  const normalizedUrl = credentialValidation.url.normalizedUrl ?? String(radarrUrl).trim();

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

  const isConnected = Boolean(hasSavedCredentials || (credentialScope && confirmedScope === credentialScope));

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
    if (isConnected) return;
    if (radarrUrl.trim().length > 0) return;
    radarrUrlInputRef.current?.focus();
  }, [isConnected, isLoading, radarrUrl]);

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

  const metadataQuery = useRadarrMetadata({
    enabled: metadataEnabled,
    credentials: metadataCredentials,
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

  const handleTestConnection = useCallback(async (): Promise<boolean> => {
    if (!formCredentials || !credentialScope) {
      return false;
    }

    const permission = await requestRadarrPermission(formCredentials.url);
    if (!permission.granted) {
      logger.warn('Radarr permission denied, aborting connection test.');
      return false;
    }

    try {
      await actions.radarrTestConnectionState.mutateAsync(formCredentials);
      setConfirmedScope(credentialScope);

      try {
        await metadataQuery.refetch();
      } catch {
        queryClient.invalidateQueries({ queryKey: queryKeys.radarrMetadataRoot() });
      }
      return true;
    } catch (error) {
      logger.error('Radarr connection test failed', error);
      return false;
    }
  }, [actions.radarrTestConnectionState, credentialScope, formCredentials, metadataQuery, queryClient]);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.radarrMetadataRoot() });
  }, [queryClient]);

  const handleDisconnect = useCallback(async () => {
    const currentUrl = radarrUrl?.trim();
    const current = methods.getValues();
    const cleared: Settings = {
      ...current,
      providers: {
        ...current.providers,
        radarr: {
          ...current.providers.radarr,
          url: '',
          apiKey: '',
        },
      },
    };

    await actions.saveState.mutateAsync(cleared);
    methods.reset(cleared);
    actions.radarrTestConnectionState.reset();

    if (currentUrl) {
      const permissionPatternResult = buildRadarrPermissionPattern(currentUrl);
      if (permissionPatternResult.ok) {
        try {
          await browser.permissions.remove({
            origins: [permissionPatternResult.value],
          });
        } catch (permError) {
          logger.warn('Failed to remove Radarr host permission during disconnect.', permError);
        }
      }
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.radarrMetadataRoot() });
  }, [
    actions.radarrTestConnectionState,
    actions.saveState,
    methods,
    queryClient,
    radarrUrl,
  ]);

  if (isLoading) {
    return <div className="text-center p-8 text-text-secondary">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border-primary bg-bg-secondary/80 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-border-primary pb-3">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Connection</h3>
            <p className="mt-1 text-xs text-text-secondary">
              Radarr URL and API key for movie lookups, adds, and updates.
            </p>
          </div>
          <ConnectionStatusBadge
            isConnected={isConnected}
            isTesting={actions.radarrTestConnectionState.isPending}
          />
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
            isConnected={isConnected}
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
          />
        </div>
      </section>

      <RadarrDefaultsSection
        actions={actions}
        portalContainer={selectPortal}
        metadataEnabled={metadataEnabled}
        metadataQuery={metadataQuery}
        onRefresh={handleRefresh}
      />

      <SaveSettingsBar actions={actions} isLoading={Boolean(isLoading)} />
    </div>
  );
}

function RadarrSettingsForm(props: RadarrSettingsFormProps): React.JSX.Element {
  return <RadarrSettingsFormInner {...props} />;
}

export default React.memo(RadarrSettingsForm);
