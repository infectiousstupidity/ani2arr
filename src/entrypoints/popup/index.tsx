/** Popup quick settings surface for provider status plus browse-card and anime-page toggles. */
// src/entrypoints/popup/index.tsx

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { browser } from 'wxt/browser';
import { ExternalLink } from 'lucide-react';
import { useProviderConnectionStatus } from '@/queries/provider-connection';
import { getProviderLabel } from '@/providers/provider-labels';
import { cn } from '@/shared/utils/cn';
import type {
  BadgeVisibility,
  ExtensionOptions,
} from '@/options';
import {
  getProviderCredentials,
  useExtensionOptions,
  useSaveOptions,
} from '@/options';
import { PROVIDERS, type Provider } from '@/providers';
import './style.css';

const queryClient = new QueryClient();
const extensionVersion = browser.runtime.getManifest()?.version ?? 'unknown';

const openFullSettings = () => {
  browser.runtime.openOptionsPage().catch(() => {});
};

const openOptionsSectionInTab = (section: 'sonarr' | 'radarr') => {
  const baseUrl = browser.runtime.getURL('/options.html');
  const url = `${baseUrl}#/options/${section}`;

  browser.tabs.create({ url }).catch(() => {
    browser.runtime.openOptionsPage().catch(() => {});
  });
};

const badgeOptions: Array<{ value: BadgeVisibility; label: string }> = [
  { value: 'always', label: 'Always' },
  { value: 'hover', label: 'On hover' },
];

export const QuickSettings: React.FC = () => {
  const optionsQuery = useExtensionOptions();
  const saveOptions = useSaveOptions();
  const [saveError, setSaveError] = useState<string | null>(null);

  const settings = optionsQuery.data;
  const sonarrStatus = useProviderConnectionStatus(
    'sonarr',
    getProviderCredentials(settings, 'sonarr'),
  );
  const radarrStatus = useProviderConnectionStatus(
    'radarr',
    getProviderCredentials(settings, 'radarr'),
  );
  const hasAnyProviderConfigured =
    sonarrStatus.isProviderConfigured || radarrStatus.isProviderConfigured;
  const isLoading = optionsQuery.isLoading;
  const isSaving = saveOptions.isPending;
  const isBusy = isLoading || isSaving;
  let statusMessage = saveError;
  if (isLoading) {
    statusMessage = 'Loading settings...';
  } else if (isSaving) {
    statusMessage = 'Saving...';
  }

  const updateSettings = async (updater: (current: ExtensionOptions) => ExtensionOptions) => {
    if (!settings || isSaving) return;

    setSaveError(null);

    try {
      await saveOptions.mutateAsync(updater(settings));
    } catch (error) {
      setSaveError((error as Error)?.message ?? 'Failed to save settings.');
    }
  };

  const updateBrowseProvider = async (
    provider: Provider,
    patch: Partial<ExtensionOptions['ui']['browseCards'][Provider]>,
  ) => {
    await updateSettings((current) => ({
      ...current,
      ui: {
        ...current.ui,
        browseCards: {
          ...current.ui.browseCards,
          [provider]: {
            ...current.ui.browseCards[provider],
            ...patch,
          },
        },
      },
    }));
  };

  const updateAnimeProvider = async (provider: Provider, enabled: boolean) => {
    await updateSettings((current) => ({
      ...current,
      ui: {
        ...current.ui,
        animePages: {
          ...current.ui.animePages,
          [provider]: {
            ...current.ui.animePages[provider],
            enabled,
          },
        },
      },
    }));
  };

  return (
    <div className="p-4 text-text-primary">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/icons/48.png" alt="ani2arr logo" className="h-8 w-8 rounded-md" />
          <div>
            <div className="flex items-baseline gap-1.5 leading-none">
              <p className="text-sm font-semibold">ani2arr</p>
              <span className="text-[10px] font-medium tracking-wide text-text-secondary/80">
                v{extensionVersion}
              </span>
            </div>
            <p className="text-xs text-text-secondary">Quick settings</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openFullSettings}
          className="inline-flex items-center gap-1 rounded-md border border-border-primary px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
          aria-label="Open full settings page"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Full
        </button>
      </header>

      <section className="mb-3 grid grid-cols-2 gap-2">
        <div className="relative rounded-xl border border-border-primary bg-bg-secondary/70 px-3 py-2">
          <button
            type="button"
            onClick={() => openOptionsSectionInTab('sonarr')}
            className="absolute right-2 top-2 rounded p-1 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            aria-label="Open Sonarr options in a new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <p className="text-[11px] uppercase tracking-wide text-text-secondary">Sonarr</p>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span
              className={cn(
                'a2a-provider-status inline-flex items-center gap-2',
                sonarrStatus.variantClassName,
              )}
            >
              <span
                className="a2a-provider-status-dot inline-block h-2.5 w-2.5 rounded-full"
                aria-hidden
              />
              <span className="a2a-provider-status-text">{sonarrStatus.shortLabel}</span>
            </span>
          </div>
        </div>

        <div className="relative rounded-xl border border-border-primary bg-bg-secondary/50 px-3 py-2">
          <button
            type="button"
            onClick={() => openOptionsSectionInTab('radarr')}
            className="absolute right-2 top-2 rounded p-1 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            aria-label="Open Radarr options in a new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <p className="text-[11px] uppercase tracking-wide text-text-secondary">Radarr</p>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span
              className={cn(
                'a2a-provider-status inline-flex items-center gap-2',
                radarrStatus.variantClassName,
              )}
            >
              <span
                className="a2a-provider-status-dot inline-block h-2.5 w-2.5 rounded-full"
                aria-hidden
              />
              <span className="a2a-provider-status-text">{radarrStatus.shortLabel}</span>
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border-primary bg-bg-secondary/70 p-3">
        <div>
          <p className="text-sm font-semibold">Browse cards</p>
          <p className="text-xs text-text-secondary">
            Enabled controls whether browse-card UI is injected. Visibility applies only while enabled.
          </p>
        </div>

        {PROVIDERS.map((provider) => {
          const providerLabel = getProviderLabel(provider);
          const providerSettings = settings?.ui.browseCards[provider];

          return (
            <div
              key={provider}
              className="rounded-lg border border-border-primary/70 bg-bg-tertiary/40 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{providerLabel}</p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={providerSettings?.enabled ?? false}
                  disabled={isBusy || !settings}
                  onChange={(event) => {
                    void updateBrowseProvider(provider, {
                      enabled: event.currentTarget.checked,
                    });
                  }}
                />
              </div>

              <div className="mt-3">
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {badgeOptions.map((option) => {
                    const selected = providerSettings?.visibility === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={isBusy || !settings || !(providerSettings?.enabled ?? false)}
                        onClick={() => {
                          void updateBrowseProvider(provider, { visibility: option.value });
                        }}
                        className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${
                          selected
                            ? 'border-accent-primary bg-accent-primary/20 text-text-primary'
                            : 'border-border-primary text-text-secondary hover:bg-bg-secondary'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        <div>
          <p className="text-sm font-semibold">Anime pages</p>
          <p className="text-xs text-text-secondary">
            Button above AniList&apos;s native page buttons.
          </p>
        </div>

        {PROVIDERS.map((provider) => {
          const providerLabel = getProviderLabel(provider);
          const enabled = settings?.ui.animePages[provider].enabled ?? false;

          return (
            <div
              key={`${provider}-anime`}
              className="flex items-center justify-between rounded-lg bg-bg-tertiary/60 px-3 py-2"
            >
              <div>
                <p className="text-sm">{providerLabel}</p>
                <p className="text-xs text-text-secondary">
                  {provider === 'sonarr'
                    ? 'Show series actions on supported anime pages.'
                    : 'Show movie actions on supported anime pages.'}
                </p>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={enabled}
                disabled={isBusy || !settings}
                onChange={(event) => {
                  void updateAnimeProvider(provider, event.currentTarget.checked);
                }}
              />
            </div>
          );
        })}

        {hasAnyProviderConfigured ? null : (
          <div className="rounded-lg border border-border-primary/70 bg-bg-tertiary/40 px-3 py-2">
            <p className="text-sm font-semibold">No provider configured yet</p>
            <p className="mt-1 text-xs text-text-secondary">
              Configure Sonarr, Radarr, or both in the full settings page to enable add and
              update actions.
            </p>
          </div>
        )}
      </section>

      <div className="mt-2 min-h-5 text-xs text-text-secondary" role="status" aria-live="polite">
        {statusMessage}
      </div>
    </div>
  );
};

const rootElement = document.querySelector('#popup-root');

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <QuickSettings />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
