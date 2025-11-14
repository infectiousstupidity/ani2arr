// src/shared/components/settings-form.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { useSettingsManager } from '@/shared/hooks/use-settings-manager';
import { Input, FormField, FormItem, FormLabel, FormControl } from './form';
import Button from './button';
import SonarrForm from './sonarr-form';
import { CircleCheck, CircleX, RotateCcw } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { SonarrFormState } from '@/shared/types';

function SettingsForm(): React.JSX.Element {
  const manager = useSettingsManager();
  const [selectPortal, setSelectPortal] = useState<HTMLElement | null>(null);
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
    const subscription = sonarrDefaultsForm.watch(values => {
      (Object.keys(values) as (keyof SonarrFormState)[]).forEach(key => {
        const value = values[key];
        manager.handleDefaultsChange(key, value);
      });
    });

    return () => subscription.unsubscribe();
  }, [manager, sonarrDefaultsForm]);

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


  if (manager.isLoading) {
    return <div className="text-center p-8 text-text-secondary">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleConnectSubmit} className="space-y-4 p-4 border border-border-primary rounded-lg">
        <h2 className="text-lg font-semibold border-b border-border-primary pb-2">Sonarr Connection</h2>
        <FormField>
          <FormItem>
            <FormLabel>Sonarr URL</FormLabel>
            <FormControl>
              <Input
                value={manager.formState.sonarrUrl}
                onChange={e => manager.handleFieldChange('sonarrUrl', e.target.value)}
                placeholder="http://localhost:8989"
                disabled={manager.isConnected}
              />
            </FormControl>
          </FormItem>
        </FormField>
        <FormField>
          <FormItem>
            <FormLabel>Sonarr API Key</FormLabel>
            <FormControl>
              <Input
                type="password"
                value={manager.formState.sonarrApiKey}
                onChange={e => manager.handleFieldChange('sonarrApiKey', e.target.value)}
                placeholder="Sonarr API key"
                disabled={manager.isConnected}
              />
            </FormControl>
          </FormItem>
        </FormField>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="text-sm flex items-center gap-1 h-9"
            aria-live="polite"
            role="status"
          >
            {manager.testConnectionState.isSuccess && (
              <>
                <CircleCheck className="text-success" />
                <span>Connected</span>
              </>
            )}
            {manager.testConnectionState.isError && (
              <>
                <CircleX className="text-error" />
                <span>Failed</span>
              </>
            )}
          </div>

          <div className="flex w-full justify-end sm:w-auto">
            {manager.testConnectionState.isSuccess ? (
              <Button
                onClick={manager.resetConnection}
                variant="secondary"
                size="sm"
                type="button"
                className="w-full sm:w-auto"
              >
                Edit
              </Button>
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

      {manager.isConnected && (
        <div className="space-y-4 p-4 border border-border-primary rounded-lg">
          <div className="flex justify-between items-center border-b border-border-primary pb-2">
            <h2 className="text-lg font-semibold">Default Options</h2>
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
                portalContainer={selectPortal}
              />
            </div>
          ) : null}

          <div id="a2a-select-portal-container" ref={handleSelectPortalRef} />
        </div>
      )}

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
    </div>
  );
}

export default React.memo(SettingsForm);
