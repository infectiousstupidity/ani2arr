// src/shared/components/settings-form.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { browser } from 'wxt/browser';

import { useSonarrMetadata, queryKeys } from '@/shared/api';
import type { Settings, SettingsFormValues } from '@/shared/schemas/settings';
import type { SettingsActions } from '@/entrypoints/options/hooks/use-settings-actions';
import {
  requestSonarrPermission,
  validateApiKey,
  validateUrl,
  buildSonarrPermissionPattern,
} from '@/shared/sonarr/validation';
import Button from '../../../shared/ui/primitives/button';
import { logger } from '@/shared/utils/logger';

import { SonarrConnectionCard, ConnectionStatusBadge } from './settings-connection-card';
import { SonarrDefaultsSection } from './settings-sonarr-defaults';
import type { SonarrFormLayout } from '../../../shared/ui/sonarr-form';

// --- Helper Hook for Portal Container ---
const usePortalContainer = () => {
  // Use lazy initialization to create/find the element only once on mount.
  // This satisfies the linter by avoiding an effect for initialization.
  const [element] = useState<HTMLElement | null>(() => {
    if (typeof document === 'undefined') return null;

    const PORTAL_ID = 'a2a-select-portal-container';
    const existing = document.getElementById(PORTAL_ID);
    if (existing) return existing;

    const el = document.createElement('div');
    el.id = PORTAL_ID;
    el.setAttribute('aria-hidden', 'true');
    // Ensure high z-index for extension popups/overlays
    el.style.position = 'relative';
    el.style.zIndex = '9999';
    // Mark so we only cleanup what we created
    el.setAttribute('data-a2a-created', 'true');

    document.body.appendChild(el);
    return el;
  });

  // Handle cleanup on unmount and reattach after StrictMode effect replays.
  useEffect(() => {
    if (!element) return undefined;

    if (!element.isConnected) {
      document.body.appendChild(element);
    }

    return () => {
      if (element.getAttribute('data-a2a-created') === 'true' && element.parentNode) {
        element.parentNode.removeChild(element);
      }
    };
  }, [element]);

  return element;
};

export interface SettingsFormProps {
  actions: SettingsActions;
  savedSettings?: Settings;
  sonarrFormLayout?: SonarrFormLayout;
  isLoading?: boolean;
}

export const SaveSettingsBar: React.FC<{
  actions: SettingsActions;
  isLoading?: boolean;
}> = ({ actions, isLoading }) => {
  const { formState } = useFormContext<Settings>();

  return (
    <>
      <div className="flex justify-center">
        <Button
          onClick={() => {
            void actions.handleSave();
          }}
          disabled={
            !formState.isDirty || actions.testConnectionState.isPending || isLoading
          }
          isLoading={actions.saveState.isPending}
          aria-busy={actions.saveState.isPending}
        >
          Save settings
        </Button>
      </div>
      {actions.saveError ? (
        <div
          className="text-center text-sm text-error"
          role="alert"
          aria-live="polite"
        >
          {actions.saveError}
        </div>
      ) : null}
    </>
  );
};

function SettingsFormInner({
  actions,
  savedSettings,
  sonarrFormLayout,
  isLoading,
}: SettingsFormProps): React.JSX.Element {
  const methods = useFormContext<SettingsFormValues>();
  const queryClient = useQueryClient();

  // --- Form Watchers ---
  const sonarrUrl = useWatch({ control: methods.control, name: 'sonarrUrl' }) ?? '';
  const sonarrApiKey = useWatch({ control: methods.control, name: 'sonarrApiKey' }) ?? '';
  const titleLanguage = useWatch({ control: methods.control, name: 'titleLanguage' }) ?? 'english';

  // --- Portal ---
  const selectPortal = usePortalContainer();

  // --- State & Refs ---
  const sonarrUrlInputRef = useRef<HTMLInputElement | null>(null);
  const [forceEditing, setForceEditing] = useState(false);
  const [confirmedScope, setConfirmedScope] = useState<string | null>(null);

  const hasSavedCredentials = Boolean(
    savedSettings?.sonarrUrl && savedSettings?.sonarrApiKey
  );

  const persistedCredentials = useMemo(() => {
    if (!hasSavedCredentials || !savedSettings) return null;
    return {
      url: String(savedSettings.sonarrUrl).trim(),
      apiKey: String(savedSettings.sonarrApiKey).trim()
    };
  }, [hasSavedCredentials, savedSettings]);

  const isEditingConnection = forceEditing || !hasSavedCredentials;

  // --- Credential Validation ---
  const credentialValidation = useMemo(
    () => ({
      url: validateUrl(String(sonarrUrl)),
      apiKey: validateApiKey(String(sonarrApiKey)),
    }),
    [sonarrApiKey, sonarrUrl]
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
    [hasValidCredentials, normalizedUrl, sonarrApiKey]
  );

  const credentialScope = useMemo(
    () =>
      formCredentials
        ? `${formCredentials.url}|${formCredentials.apiKey}`
        : null,
    [formCredentials]
  );

  const isConnected = Boolean(
    hasSavedCredentials ||
      (credentialScope && confirmedScope === credentialScope)
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
    if (isConnected) return;
    if (sonarrUrl.trim().length > 0) return;
    sonarrUrlInputRef.current?.focus();
  }, [isConnected, isLoading, sonarrUrl]);

  // --- Metadata & Defaults ---
  const metadataEnabled = Boolean(
    hasSavedCredentials || (formCredentials && confirmedScope === credentialScope)
  );

  const metadataCredentials = formCredentials ?? persistedCredentials ?? null;

  const metadataQuery = useSonarrMetadata({
    enabled: metadataEnabled,
    credentials: metadataCredentials,
  });

  // Auto-select defaults when metadata first loads
  useEffect(() => {
    if (!metadataQuery.data) return;

    const { qualityProfiles = [], rootFolders = [] } = metadataQuery.data;
    const currentDefaults = methods.getValues('defaults');

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
        methods.setValue('defaults.qualityProfileId', nextProfileId, { shouldDirty: true });
      }
      if (nextRootPath !== currentDefaults.rootFolderPath) {
        methods.setValue('defaults.rootFolderPath', nextRootPath, { shouldDirty: true });
      }
    }
  }, [metadataQuery.data, methods]);

  // --- Handlers ---

  const setSonarrUrl = useCallback(
    (value: string) => {
      methods.setValue('sonarrUrl', value, { shouldDirty: true });
      actions.testConnectionState.reset();
    },
    [actions.testConnectionState, methods]
  );

  const setSonarrApiKey = useCallback(
    (value: string) => {
      methods.setValue('sonarrApiKey', value, { shouldDirty: true });
      actions.testConnectionState.reset();
    },
    [actions.testConnectionState, methods]
  );

  const setTitleLanguage = useCallback(
    (value: typeof titleLanguage) => {
      methods.setValue('titleLanguage', value, { shouldDirty: true });
    },
    [methods]
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
      await actions.testConnectionState.mutateAsync(formCredentials);
      setConfirmedScope(credentialScope);
      
      try {
        await metadataQuery.refetch();
      } catch {
        queryClient.invalidateQueries({ queryKey: queryKeys.sonarrMetadata(credentialScope) });
      }
      return true;
    } catch (error) {
      logger.error('Connection test failed', error);
      return false;
    }
  }, [actions.testConnectionState, credentialScope, formCredentials, queryClient, metadataQuery]);

  const handleRefresh = useCallback(() => {
    if (!credentialScope) return;
    queryClient.invalidateQueries({
      queryKey: queryKeys.sonarrMetadata(credentialScope),
    });
  }, [credentialScope, queryClient]);

  const handleDisconnect = useCallback(async () => {
    const currentUrl = sonarrUrl?.trim();
    const current = methods.getValues();
    const cleared: Settings = {
      ...current,
      sonarrUrl: '',
      sonarrApiKey: '',
    };

    await actions.saveState.mutateAsync(cleared);
    methods.reset(cleared);
    actions.testConnectionState.reset();

    if (currentUrl) {
      const permissionPatternResult = buildSonarrPermissionPattern(currentUrl);
      if (permissionPatternResult.ok) {
        try {
          await browser.permissions.remove({
            origins: [permissionPatternResult.value],
          });
        } catch (permError) {
          logger.warn('Failed to remove Sonarr host permission during disconnect.', permError);
        }
      }
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.sonarrMetadata() });
  }, [
    actions.saveState,
    actions.testConnectionState,
    methods,
    queryClient,
    sonarrUrl,
  ]);

  if (isLoading) {
    return (
      <div className="text-center p-8 text-text-secondary">Loading settings...</div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <section className="rounded-2xl border border-border-primary bg-bg-secondary/80 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-border-primary pb-3">
            <div>
              <h3 className="text-base font-semibold text-text-primary">Connection</h3>
              <p className="mt-1 text-xs text-text-secondary">
                Sonarr URL, API key, and preferred title language.
              </p>
            </div>
            <ConnectionStatusBadge
              isConnected={isConnected}
              isTesting={actions.testConnectionState.isPending}
            />
          </div>
          <div className="mt-4">
            <SonarrConnectionCard
              actions={actions}
              selectPortal={selectPortal}
              sonarrUrlInputRef={sonarrUrlInputRef}
              isEditingConnection={isEditingConnection}
              isConnected={isConnected}
              sonarrUrl={String(sonarrUrl)}
              sonarrApiKey={String(sonarrApiKey)}
              titleLanguage={titleLanguage}
              onStartEditing={() => setForceEditing(true)}
              onConnectionConfirmed={() => setForceEditing(false)}
              onDisconnect={handleDisconnect}
              onTestConnection={handleTestConnection}
              setSonarrUrl={setSonarrUrl}
              setSonarrApiKey={setSonarrApiKey}
              setTitleLanguage={setTitleLanguage}
              isLoading={Boolean(isLoading)}
            />
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

        <SaveSettingsBar actions={actions} isLoading={Boolean(isLoading)} />
      </div>
    </>
  );
}

function SettingsForm(props: SettingsFormProps): React.JSX.Element {
  return <SettingsFormInner {...props} />;
}

export default React.memo(SettingsForm);
