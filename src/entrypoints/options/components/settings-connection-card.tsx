import React, { useMemo, useState } from 'react';
import type { SettingsActions } from '@/entrypoints/options/hooks/use-settings-actions';
import type { TitleLanguage } from '@/shared/types';
import { InputField, SelectField } from '../../../shared/ui/form/form';
import Button from '../../../shared/ui/primitives/button';
import { useConfirm } from '@/shared/hooks/common/use-confirm';
import { useToast } from '@/shared/ui/feedback/toast-provider';
import { logger } from '@/shared/utils/logger';

const titleLanguageOptions: Array<{ value: TitleLanguage; label: string }> = [
  { value: 'english', label: 'English (default)' },
  { value: 'romaji', label: 'Romaji' },
  { value: 'native', label: 'Native' },
];

export const ConnectionStatusBadge: React.FC<{ isConnected: boolean; isTesting: boolean }> = ({
  isConnected,
  isTesting,
}) => {
  const status = useMemo(() => {
    if (isConnected) {
      return {
        label: 'Connected',
        className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
      };
    }
    if (isTesting) {
      return {
        label: 'Connecting',
        className: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
      };
    }
    return {
      label: 'Not connected',
      className: 'bg-slate-700/50 text-text-secondary border-border-primary',
    };
  }, [isConnected, isTesting]);

  return (
    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${status.className}`}>
      {status.label}
    </span>
  );
};

export type SonarrConnectionCardProps = {
  actions: SettingsActions;
  selectPortal: HTMLElement | null;
  sonarrUrlInputRef: React.RefObject<HTMLInputElement | null>;
  isEditingConnection: boolean;
  isConnected: boolean;
  sonarrUrl: string;
  sonarrApiKey: string;
  titleLanguage: TitleLanguage;
  onStartEditing: () => void;
  onConnectionConfirmed: () => void;
  onDisconnect: () => Promise<void>;
  onTestConnection: () => Promise<boolean>;
  setSonarrUrl: (value: string) => void;
  setSonarrApiKey: (value: string) => void;
  setTitleLanguage: (value: TitleLanguage) => void;
  isLoading?: boolean;
};

export const SonarrConnectionCard: React.FC<SonarrConnectionCardProps> = ({
  actions,
  selectPortal,
  sonarrUrlInputRef,
  isEditingConnection,
  isConnected,
  sonarrUrl,
  sonarrApiKey,
  titleLanguage,
  onStartEditing,
  onConnectionConfirmed,
  onDisconnect,
  onTestConnection,
  setSonarrUrl,
  setSonarrApiKey,
  setTitleLanguage,
  isLoading,
}) => {
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const getConnectButtonText = () => {
    if (actions.testConnectionState.isError) return 'Retry';
    return 'Connect';
  };

  const handleConnectSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if ((isConnected && !isEditingConnection) || actions.testConnectionState.isPending) {
      return;
    }

    const ok = await onTestConnection();
    if (ok) {
      onConnectionConfirmed();
    }
  };

  const handleDisconnect = async () => {
    const shouldDisconnect = await confirm({
      title: 'Disconnect Sonarr?',
      description: 'This will remove saved credentials and permissions.',
      confirmText: 'Disconnect',
      cancelText: 'Cancel',
    });
    if (!shouldDisconnect) return;
    setIsDisconnecting(true);
    try {
      await onDisconnect();
    } catch (err) {
      logger.error('Unexpected error during disconnect', err);
      toast.showToast({
        title: 'Disconnect failed',
        description: 'Failed to disconnect Sonarr. Please try again.',
        variant: 'error',
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <form onSubmit={handleConnectSubmit} className="space-y-4">
      <InputField
        label="Sonarr URL"
        labelHelp={
          <>
            Firefox needs an optional host permission for the exact Sonarr origin you enter here.
            ani2arr declares broad optional host patterns so it can request access to your
            specific self-hosted server at runtime.
          </>
        }
        ref={sonarrUrlInputRef}
        value={sonarrUrl}
        onChange={(e) => setSonarrUrl(e.target.value)}
        placeholder="http://localhost:8989"
        disabled={(isConnected && !isEditingConnection) || Boolean(isLoading)}
        description="Only the exact origin you enter is requested at runtime. Saved credentials stay in browser local storage."
      />

      <InputField
        label="Sonarr API key"
        labelHelp={
          <>
            The API key lets ani2arr authenticate with your Sonarr server so it can test the
            connection, read metadata, and add or update series. It is stored only in browser
            local storage and sent only to the Sonarr origin you configure.
          </>
        }
        type="password"
        value={sonarrApiKey}
        onChange={(e) => setSonarrApiKey(e.target.value)}
        placeholder="Sonarr API key"
        disabled={(isConnected && !isEditingConnection) || Boolean(isLoading)}
      />

      <SelectField
        label="Preferred title language"
        value={titleLanguage}
        onValueChange={(v) => setTitleLanguage(v as TitleLanguage)}
        options={titleLanguageOptions}
        container={selectPortal}
        disabled={Boolean(isLoading)}
      />

      <div className="flex flex-col gap-3 border-t border-border-primary pt-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex w-full justify-end gap-2 sm:w-auto">
          {isConnected && !isEditingConnection ? (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                onClick={() => {
                  actions.testConnectionState.reset();
                  onStartEditing();
                }}
                variant="secondary"
                size="sm"
                type="button"
                className="w-full sm:w-auto"
                disabled={Boolean(isLoading)}
              >
                Edit
              </Button>
              <Button
                onClick={handleDisconnect}
                variant="outline"
                size="sm"
                type="button"
                className="w-full sm:w-auto text-error border-error"
                isLoading={isDisconnecting}
                disabled={
                  actions.saveState.isPending ||
                  actions.testConnectionState.isPending ||
                  Boolean(isLoading)
                }
                aria-busy={isDisconnecting || actions.saveState.isPending}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              type="submit"
              isLoading={actions.testConnectionState.isPending}
              variant="secondary"
              loadingText="Connecting..."
              className="w-full sm:w-auto"
              aria-busy={actions.testConnectionState.isPending}
              disabled={Boolean(isLoading)}
            >
              {getConnectButtonText()}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
};
