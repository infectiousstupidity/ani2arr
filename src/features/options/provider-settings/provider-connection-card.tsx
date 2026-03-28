/** Provider-settings connection card and title-language controls for Arr providers. */
// src/features/options/provider-settings/provider-connection-card.tsx

import type React from 'react';
import { useState } from 'react';
import type { ProviderTitleLanguage } from '@/shared/types';
import {
  getProviderConnectionStatusMeta,
  type ProviderConnectionStatus,
} from '@/features/options/provider-connection-status';
import { cn } from '@/shared/utils/cn';
import { InputField, SelectField } from '@/shared/ui/form/form';
import Button from '@/shared/ui/primitives/button';
import { useConfirm } from '@/shared/hooks/common/use-confirm';
import { useToast } from '@/shared/ui/feedback/toast-provider';
import { logger } from '@/shared/utils/logger';

export const TITLE_LANGUAGE_OPTIONS: Array<{ value: ProviderTitleLanguage; label: string }> = [
  { value: 'english', label: 'English (default)' },
  { value: 'romaji', label: 'Romaji' },
  { value: 'native', label: 'Native' },
];

export const TITLE_LANGUAGE_DESCRIPTION =
  'ani2arr uses this to choose the preferred AniList title for display and as the primary title hint when matching and adding media.';

export const ProviderConnectionStatusBadge: React.FC<{ status: ProviderConnectionStatus }> = ({
  status,
}) => {
  const statusMeta = getProviderConnectionStatusMeta(status);

  return (
    <span
      className={cn(
        'a2a-provider-status a2a-provider-status-badge rounded-full px-3 py-1 text-[11px] font-semibold',
        statusMeta.variantClassName,
      )}
    >
      {statusMeta.shortLabel}
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
  summaryFields?: Array<{ label: string; value: React.ReactNode }>;
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
  summaryFields = [],
}) => {
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const getConnectButtonText = () => {
    if (testConnectionState.isError) return 'Retry';
    return 'Connect and save';
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
      description:
        'This clears the saved URL and API key and removes host access. You will need to reconnect to use this provider again.',
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

  if (isConnected && !isEditingConnection) {
    const columnClassName =
      summaryFields.length >= 3 ? 'md:grid-cols-3' : summaryFields.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-1';

    return (
      <div className="space-y-4">
        <div className={`grid gap-3 ${columnClassName}`}>
          {summaryFields.map((field) => (
            <div
              key={field.label}
              className="a2a-settings-panel__inset rounded-2xl px-4 py-4"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                {field.label}
              </div>
              <div className="mt-1 text-sm text-text-primary break-all">
                {field.value}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-border-primary pt-3 sm:flex-row sm:items-center sm:justify-end">
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
              Edit details
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
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleConnectSubmit} className="space-y-4">
      <InputField
        label={urlLabel}
        labelHelp={urlHelp}
        ref={urlInputRef}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={urlPlaceholder}
        disabled={Boolean(isLoading)}
        description={urlDescription}
      />

      <InputField
        label={apiKeyLabel}
        labelHelp={apiKeyHelp}
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={`${providerLabel} API key`}
        disabled={Boolean(isLoading)}
      />

      {children}

      <div className="flex flex-col gap-3 border-t border-border-primary pt-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex w-full justify-end gap-2 sm:w-auto">
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
        </div>
      </div>
    </form>
  );
};

export const ProviderTitleLanguageField: React.FC<{
  providerTitleLanguage: ProviderTitleLanguage;
  setProviderTitleLanguage: (value: ProviderTitleLanguage) => void;
  selectPortal: HTMLElement | null;
  isLoading?: boolean;
}> = ({ providerTitleLanguage, setProviderTitleLanguage, selectPortal, isLoading }) => (
  <SelectField
    label="Preferred title language"
    value={providerTitleLanguage}
    onValueChange={(v) => setProviderTitleLanguage(v as ProviderTitleLanguage)}
    options={TITLE_LANGUAGE_OPTIONS}
    container={selectPortal}
    disabled={Boolean(isLoading)}
    description={TITLE_LANGUAGE_DESCRIPTION}
  />
);

export const SonarrTitleLanguageField = ProviderTitleLanguageField;
