import React, { useMemo, useState } from 'react';
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

export type ProviderConnectionStatus = 'connected' | 'configured' | 'connecting' | 'not-configured';

export const ProviderConnectionStatusBadge: React.FC<{ status: ProviderConnectionStatus }> = ({
  status,
}) => {
  const appearance = useMemo(() => {
    switch (status) {
      case 'connected':
        return {
          label: 'Connected',
          className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
        };
      case 'configured':
        return {
          label: 'Configured',
          className: 'bg-sky-500/10 text-sky-300 border-sky-500/40',
        };
      case 'connecting':
        return {
          label: 'Connecting',
          className: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
        };
      default:
        return {
          label: 'Not configured',
          className: 'bg-slate-700/50 text-text-secondary border-border-primary',
        };
    }
  }, [status]);

  return (
    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${appearance.className}`}>
      {appearance.label}
    </span>
  );
};

type ConnectionMutationState = {
  isError: boolean;
  isPending: boolean;
  reset: () => void;
};

type SaveMutationState = {
  isPending: boolean;
};

export type ProviderConnectionCardProps = {
  providerLabel: string;
  urlLabel: string;
  urlPlaceholder: string;
  apiKeyLabel: string;
  urlHelp: React.ReactNode;
  apiKeyHelp: React.ReactNode;
  urlDescription?: React.ReactNode;
  urlInputRef: React.RefObject<HTMLInputElement | null>;
  isEditingConnection: boolean;
  isConnected: boolean;
  url: string;
  apiKey: string;
  onStartEditing: () => void;
  onConnectionConfirmed: () => void;
  onDisconnect: () => Promise<void>;
  onTestConnection: () => Promise<boolean>;
  setUrl: (value: string) => void;
  setApiKey: (value: string) => void;
  testConnectionState: ConnectionMutationState;
  saveState: SaveMutationState;
  isLoading?: boolean;
  children?: React.ReactNode;
};

export const ProviderConnectionCard: React.FC<ProviderConnectionCardProps> = ({
  providerLabel,
  urlLabel,
  urlPlaceholder,
  apiKeyLabel,
  urlHelp,
  apiKeyHelp,
  urlDescription,
  urlInputRef,
  isEditingConnection,
  isConnected,
  url,
  apiKey,
  onStartEditing,
  onConnectionConfirmed,
  onDisconnect,
  onTestConnection,
  setUrl,
  setApiKey,
  testConnectionState,
  saveState,
  isLoading,
  children,
}) => {
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const getConnectButtonText = () => {
    if (testConnectionState.isError) return 'Retry';
    return 'Connect';
  };

  const handleConnectSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if ((isConnected && !isEditingConnection) || testConnectionState.isPending) {
      return;
    }

    const ok = await onTestConnection();
    if (ok) {
      onConnectionConfirmed();
    }
  };

  const handleDisconnect = async () => {
    const shouldDisconnect = await confirm({
      title: `Disconnect ${providerLabel}?`,
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
        description: `Failed to disconnect ${providerLabel}. Please try again.`,
        variant: 'error',
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <form onSubmit={handleConnectSubmit} className="space-y-4">
      <InputField
        label={urlLabel}
        labelHelp={urlHelp}
        ref={urlInputRef}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={urlPlaceholder}
        disabled={(isConnected && !isEditingConnection) || Boolean(isLoading)}
        description={urlDescription}
      />

      <InputField
        label={apiKeyLabel}
        labelHelp={apiKeyHelp}
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={`${providerLabel} API key`}
        disabled={(isConnected && !isEditingConnection) || Boolean(isLoading)}
      />

      {children}

      <div className="flex flex-col gap-3 border-t border-border-primary pt-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex w-full justify-end gap-2 sm:w-auto">
          {isConnected && !isEditingConnection ? (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                onClick={() => {
                  testConnectionState.reset();
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
                  saveState.isPending ||
                  testConnectionState.isPending ||
                  Boolean(isLoading)
                }
                aria-busy={isDisconnecting || saveState.isPending}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              type="submit"
              isLoading={testConnectionState.isPending}
              variant="primary"
              loadingText="Connecting..."
              className="w-full sm:w-auto"
              aria-busy={testConnectionState.isPending}
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

export const SonarrTitleLanguageField: React.FC<{
  titleLanguage: TitleLanguage;
  setTitleLanguage: (value: TitleLanguage) => void;
  selectPortal: HTMLElement | null;
  isLoading?: boolean;
}> = ({ titleLanguage, setTitleLanguage, selectPortal, isLoading }) => (
  <SelectField
    label="Preferred title language"
    value={titleLanguage}
    onValueChange={(v) => setTitleLanguage(v as TitleLanguage)}
    options={titleLanguageOptions}
    container={selectPortal}
    disabled={Boolean(isLoading)}
  />
);
