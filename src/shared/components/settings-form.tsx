// src/shared/components/settings-form.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { RotateCcw } from 'lucide-react';

import { logger } from '@/shared/utils/logger';
import { useSettingsManager } from '@/shared/hooks/use-settings-manager';
import { useConfirm } from '@/shared/hooks/use-confirm';
import { useToast } from '@/shared/components/toast-provider';
import type { SonarrFormState, TitleLanguage } from '@/shared/types';

import { InputField, SelectField } from './form';
import Button from './button';
import SonarrForm, { type SonarrFormLayout } from './sonarr-form';

const titleLanguageOptions: Array<{ value: TitleLanguage; label: string }> = [
  { value: 'english', label: 'English (default)' },
  { value: 'romaji', label: 'Romaji' },
  { value: 'native', label: 'Native' },
];

export interface SettingsFormProps {
  manager: SettingsManager;
  showSaveBar?: boolean;
  showConnection?: boolean;
  showDefaults?: boolean;
  sonarrFormLayout?: SonarrFormLayout;
}

export type SettingsManager = ReturnType<typeof useSettingsManager>;

const SonarrConnectionCard: React.FC<{
  manager: SettingsManager;
  selectPortal: HTMLElement | null;
  sonarrUrlInputRef: React.RefObject<HTMLInputElement | null>;
}> = ({ manager, selectPortal, sonarrUrlInputRef }) => {
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const getConnectButtonText = () => {
    if (manager.testConnectionState.isError) return 'Retry';
    return 'Connect';
  };

  const handleConnectSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (manager.isConnected || manager.testConnectionState.isPending) {
      return;
    }

    manager.handleTestConnection();
  };

  return (
    <form onSubmit={handleConnectSubmit} className="space-y-4">
      <InputField
        label="Sonarr URL"
        ref={sonarrUrlInputRef}
        value={manager.formState.sonarrUrl}
        onChange={(e) => manager.handleFieldChange('sonarrUrl', e.target.value)}
        placeholder="http://localhost:8989"
        disabled={manager.isConnected}
      />

      <InputField
        label="Sonarr API key"
        type="password"
        value={manager.formState.sonarrApiKey}
        onChange={(e) => manager.handleFieldChange('sonarrApiKey', e.target.value)}
        placeholder="Sonarr API key"
        disabled={manager.isConnected}
      />

      <SelectField
        label="Preferred title language"
        value={manager.formState.titleLanguage}
        onValueChange={(v) => manager.handleFieldChange('titleLanguage', v as TitleLanguage)}
        options={titleLanguageOptions}
        container={selectPortal}
      />

      <div className="flex flex-col gap-3 border-t border-border-primary pt-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex w-full justify-end gap-2 sm:w-auto">
          {manager.testConnectionState.isSuccess ? (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                onClick={manager.resetConnection}
                variant="secondary"
                size="sm"
                type="button"
                className="w-full sm:w-auto"
              >
                Edit
              </Button>
              <Button
                onClick={async () => {
                  const shouldDisconnect = await confirm({
                    title: 'Disconnect Sonarr?',
                    description: 'This will remove saved credentials and permissions.',
                    confirmText: 'Disconnect',
                    cancelText: 'Cancel',
                  });
                  if (!shouldDisconnect) return;
                  setIsDisconnecting(true);
                  try {
                    await manager.handleDisconnect();
                  } catch (err) {
                    logger.error('Unexpected error during disconnect', err);
                    if (!manager.saveError) {
                      toast.showToast({
                        title: 'Disconnect failed',
                        description: 'Failed to disconnect Sonarr. Please try again.',
                        variant: 'error',
                      });
                    }
                  } finally {
                    setIsDisconnecting(false);
                  }
                }}
                variant="outline"
                size="sm"
                type="button"
                className="w-full sm:w-auto text-error border-error"
                isLoading={isDisconnecting}
                disabled={manager.saveState.isPending || manager.testConnectionState.isPending}
                aria-busy={isDisconnecting || manager.saveState.isPending}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              type="submit"
              isLoading={manager.testConnectionState.isPending}
              variant="secondary"
              loadingText="Connecting..."
              className="w-full sm:w-auto"
              aria-busy={manager.testConnectionState.isPending}
            >
              {getConnectButtonText()}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
};

const SonarrDefaultsCard: React.FC<{
  manager: SettingsManager;
  sonarrDefaultsForm: UseFormReturn<SonarrFormState>;
  portalContainer: HTMLElement | undefined;
  onPortalRef: (node: HTMLDivElement | null) => void;
  layout?: SonarrFormLayout;
}> = ({ manager, sonarrDefaultsForm, portalContainer, onPortalRef, layout }) => {
  const sonarrLayoutProps = layout !== undefined ? { layout } : {};

  return (
  <div className="space-y-4 p-4 border border-border-primary rounded-lg">
    <div className="flex justify-between items-center border-b border-border-primary pb-2">
      <Button
        onClick={manager.handleRefresh}
        isLoading={manager.sonarrMetadata.isRefetching}
        variant="ghost"
        size="icon"
        tooltip="Refresh data from Sonarr"
        portalContainer={portalContainer}
        aria-label="Refresh data from Sonarr"
        aria-busy={manager.sonarrMetadata.isRefetching}
      >
        <RotateCcw />
      </Button>
    </div>

    {manager.sonarrMetadata.isFetching ? (
      <div className="text-center p-8 text-text-secondary">Loading Sonarr data...</div>
    ) : manager.sonarrMetadata.data ? (
      <div className="space-y-6">
        <SonarrForm
          form={sonarrDefaultsForm}
          metadata={manager.sonarrMetadata.data}
          disabled={manager.saveState.isPending}
          portalContainer={portalContainer ?? null}
          {...sonarrLayoutProps}
        />
      </div>
    ) : null}

    <div id="a2a-select-portal-container" ref={onPortalRef} />
  </div>
  );
};

export const SaveSettingsBar: React.FC<{ manager: SettingsManager }> = ({ manager }) => (
  <>
    <div className="flex justify-center">
      <Button
        onClick={manager.handleSave}
        disabled={!manager.isDirty || manager.testConnectionState.isPending}
        isLoading={manager.saveState.isPending}
        aria-busy={manager.saveState.isPending}
      >
        Save settings
      </Button>
    </div>
    {manager.saveError ? (
      <div className="text-center text-sm text-error" role="alert" aria-live="polite">
        {manager.saveError}
      </div>
    ) : null}
  </>
);

function SettingsFormInner({
  manager,
  showSaveBar = true,
  showConnection = true,
  showDefaults = true,
  sonarrFormLayout,
}: SettingsFormProps): React.JSX.Element {
  const [selectPortal, setSelectPortal] = useState<HTMLElement | null>(null);
  const sonarrUrlInputRef = useRef<HTMLInputElement | null>(null);
  const sonarrDefaultsForm = useForm<SonarrFormState>({
    defaultValues: manager.formState.defaults,
    mode: 'onChange',
  });

  const handleSelectPortalRef = useCallback((node: HTMLDivElement | null) => {
    setSelectPortal(node);
  }, []);

  const portalContainer = selectPortal ?? undefined;

  useEffect(() => {
    sonarrDefaultsForm.reset(manager.formState.defaults);
  }, [manager.formState.defaults, manager.isLoading, sonarrDefaultsForm]);

  useEffect(() => {
    if (manager.isLoading) return;
    if (manager.isConnected) return;
    const sonarrUrl = manager.formState.sonarrUrl ?? '';
    if (sonarrUrl.trim().length > 0) return;
    sonarrUrlInputRef.current?.focus();
  }, [manager.formState.sonarrUrl, manager.isConnected, manager.isLoading]);

  useEffect(() => {
    const subscription = sonarrDefaultsForm.watch(values => {
      (Object.keys(values) as (keyof SonarrFormState)[]).forEach(key => {
        const value = values[key];
        if (value === undefined) {
          return;
        }
        if (Array.isArray(value)) {
          const cleaned = value.filter((item): item is number => typeof item === 'number');
          manager.handleDefaultsChange(key, cleaned);
        } else {
          manager.handleDefaultsChange(key, value);
        }
      });
    });

    return () => subscription.unsubscribe();
  }, [manager, sonarrDefaultsForm]);

  if (manager.isLoading) {
    return <div className="text-center p-8 text-text-secondary">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      {showConnection ? (
        <SonarrConnectionCard
          manager={manager}
          selectPortal={portalContainer ?? null}
          sonarrUrlInputRef={sonarrUrlInputRef}
        />
      ) : null}

      {showDefaults && manager.isConnected ? (
        <SonarrDefaultsCard
          manager={manager}
          sonarrDefaultsForm={sonarrDefaultsForm}
          portalContainer={portalContainer}
          onPortalRef={handleSelectPortalRef}
          {...(sonarrFormLayout !== undefined ? { layout: sonarrFormLayout } : {})}
        />
      ) : null}

      {showSaveBar ? <SaveSettingsBar manager={manager} /> : null}
    </div>
  );
}

export function SettingsFormWithManager(props: SettingsFormProps): React.JSX.Element {
  return <SettingsFormInner {...props} />;
}

function SettingsForm(): React.JSX.Element {
  const manager = useSettingsManager();
  return <SettingsFormInner manager={manager} />;
}

export default React.memo(SettingsForm);
