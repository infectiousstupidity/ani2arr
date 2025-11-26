// src/shared/components/settings-form.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  portalContainer: HTMLElement | null;
  layout?: SonarrFormLayout;
}> = ({ manager, sonarrDefaultsForm, portalContainer, layout }) => {
  const sonarrLayoutProps = layout !== undefined ? { layout } : {};

  return (
    <div className="space-y-4">
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
    </div>
  );
};


const ConnectionStatusBadge: React.FC<{ manager: SettingsManager }> = ({ manager }) => {
  const status = useMemo(() => {
    if (manager.isConnected) {
      return {
        label: 'Connected',
        className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
      };
    }
    if (manager.testConnectionState.isPending) {
      return {
        label: 'Connecting',
        className: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
      };
    }
    return {
      label: 'Not connected',
      className: 'bg-slate-700/50 text-text-secondary border-border-primary',
    };
  }, [manager.isConnected, manager.testConnectionState.isPending]);

  return (
    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${status.className}`}>
      {status.label}
    </span>
  );
};

const SonarrConnectionSection: React.FC<{
  manager: SettingsManager;
  selectPortal: HTMLElement | null;
  sonarrUrlInputRef: React.RefObject<HTMLInputElement | null>;
}> = ({ manager, selectPortal, sonarrUrlInputRef }) => (
  <section className="rounded-2xl border border-border-primary bg-bg-secondary/80 p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3 border-b border-border-primary pb-3">
      <div>
        <h3 className="text-base font-semibold text-text-primary">Connection</h3>
        <p className="mt-1 text-xs text-text-secondary">Sonarr URL, API key, and preferred title language.</p>
      </div>
      <ConnectionStatusBadge manager={manager} />
    </div>
    <div className="mt-4">
      <SonarrConnectionCard
        manager={manager}
        selectPortal={selectPortal}
        sonarrUrlInputRef={sonarrUrlInputRef}
      />
    </div>
  </section>
);

const SonarrDefaultsSection: React.FC<{
  manager: SettingsManager;
  sonarrDefaultsForm: UseFormReturn<SonarrFormState>;
  portalContainer: HTMLElement | null;
  layout?: SonarrFormLayout;
}> = ({ manager, sonarrDefaultsForm, portalContainer, layout }) => {
  const sonarrLayoutProps = layout !== undefined ? { layout } : {};

  return (
    <section className="rounded-2xl border border-border-primary bg-bg-secondary/70 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border-primary pb-3">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Default add options</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Configure defaults reused by overlays and the media modal.
          </p>
        </div>
        <Button
          onClick={manager.handleRefresh}
          isLoading={manager.sonarrMetadata.isRefetching}
          variant="ghost"
          size="icon"
          tooltip="Refresh data from Sonarr"
          portalContainer={portalContainer ?? undefined}
          aria-label="Refresh data from Sonarr"
          aria-busy={manager.sonarrMetadata.isRefetching}
          disabled={!manager.isConnected}
        >
          <RotateCcw />
        </Button>
      </div>

      <div className="mt-4">
        {manager.isConnected ? (
          <SonarrDefaultsCard
            manager={manager}
            sonarrDefaultsForm={sonarrDefaultsForm}
            portalContainer={portalContainer}
            {...sonarrLayoutProps}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border-primary/70 bg-bg-tertiary/40 p-4 text-sm text-text-secondary">
            Connect to Sonarr to load available folders, profiles, and tags.
          </div>
        )}
      </div>
    </section>
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
    <>
      <div className="space-y-6">
        <SonarrConnectionSection
          manager={manager}
          selectPortal={selectPortal}
          sonarrUrlInputRef={sonarrUrlInputRef}
        />

        <SonarrDefaultsSection
          manager={manager}
          sonarrDefaultsForm={sonarrDefaultsForm}
          portalContainer={selectPortal}
          {...(sonarrFormLayout !== undefined ? { layout: sonarrFormLayout } : {})}
        />

        <SaveSettingsBar manager={manager} />
      </div>

      <div id="a2a-select-portal-container" ref={handleSelectPortalRef} className="h-0 w-0 overflow-hidden" />
    </>
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
