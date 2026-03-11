import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { browser } from 'wxt/browser';
import { ExternalLink } from 'lucide-react';
import { useExtensionOptions, useSaveOptions } from '@/shared/queries';
import type { Settings } from '@/shared/schemas/settings';
import type { BadgeVisibility, ExtensionOptions } from '@/shared/types';
import './style.css';

const queryClient = new QueryClient();

const badgeOptions: Array<{ value: BadgeVisibility; label: string }> = [
  { value: 'always', label: 'Always' },
  { value: 'hover', label: 'On hover' },
  { value: 'hidden', label: 'Hidden' },
];

const QuickSettings: React.FC = () => {
  const optionsQuery = useExtensionOptions();
  const saveOptions = useSaveOptions();
  const [saveError, setSaveError] = useState<string | null>(null);

  const settings = optionsQuery.data;
  const isSonarrConfigured = Boolean(settings?.sonarrUrl && settings?.sonarrApiKey);
  const isLoading = optionsQuery.isLoading;
  const isSaving = saveOptions.isPending;
  const isBusy = isLoading || isSaving;

  const updateSettings = async (updater: (current: Settings) => Settings) => {
    if (!settings || isSaving) return;
    setSaveError(null);
    try {
      await saveOptions.mutateAsync(updater(settings) as ExtensionOptions);
    } catch (error) {
      setSaveError((error as Error)?.message ?? 'Failed to save settings.');
    }
  };

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

  return (
    <div className="p-4 text-text-primary">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/icons/48.png" alt="ani2arr logo" className="h-8 w-8 rounded-md" />
          <div>
            <p className="text-sm font-semibold leading-none">ani2arr</p>
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
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                isLoading ? 'bg-slate-400' : isSonarrConfigured ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
              aria-hidden
            />
            <span className="text-sm">
              {isLoading ? 'Checking...' : isSonarrConfigured ? 'Connected' : 'Not connected'}
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
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-500" aria-hidden />
            <span className="text-sm text-text-secondary">Soon</span>
          </div>
        </div>
      </section>

      {isSonarrConfigured ? (
        <section className="space-y-3 rounded-xl border border-border-primary bg-bg-secondary/70 p-3">
          <div className="space-y-3 rounded-lg border border-border-primary/70 bg-bg-tertiary/40 p-3">
            <div>
              <p className="text-sm font-semibold">Card actions (browse pages)</p>
              <p className="text-xs text-text-secondary">
                Controls action buttons on AniList/AniChart browse and search cards.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-bg-tertiary/60 px-3 py-2">
              <div>
                <p className="text-sm">Enable card actions</p>
                <p className="text-xs text-text-secondary">Show action controls on browse/search cards.</p>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={settings?.ui.browseOverlayEnabled ?? false}
                disabled={isBusy || !settings}
                onChange={(event) => {
                  const nextValue = event.currentTarget.checked;
                  void updateSettings(current => ({
                    ...current,
                    ui: { ...current.ui, browseOverlayEnabled: nextValue },
                  }));
                }}
              />
            </div>

            <div className="rounded-lg bg-bg-tertiary/60 px-3 py-2">
              <p className="text-sm">Card action visibility</p>
              <p className="text-xs text-text-secondary">Choose when card actions appear.</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {badgeOptions.map(option => {
                  const selected = settings?.ui.badgeVisibility === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={isBusy || !settings}
                      onClick={() => {
                        void updateSettings(current => ({
                          ...current,
                          ui: { ...current.ui, badgeVisibility: option.value },
                        }));
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

          <div className="flex items-center justify-between rounded-lg bg-bg-tertiary/60 px-3 py-2">
            <div>
              <p className="text-sm">Anime page actions</p>
              <p className="text-xs text-text-secondary">
                Show actions above AniList&apos;s native <em>Add to List</em> button.
              </p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={settings?.ui.headerInjectionEnabled ?? false}
              disabled={isBusy || !settings}
              onChange={(event) => {
                const nextValue = event.currentTarget.checked;
                void updateSettings(current => ({
                  ...current,
                  ui: { ...current.ui, headerInjectionEnabled: nextValue },
                }));
              }}
            />
          </div>
        </section>
      ) : (
        <section className="space-y-3 rounded-xl border border-border-primary bg-bg-secondary/70 p-3">
          <div>
            <p className="text-sm font-semibold">Sonarr is not configured</p>
            <p className="text-xs text-text-secondary">
              Configure Sonarr in the full settings page to enable card and anime page actions.
            </p>
          </div>

          <button
            type="button"
            onClick={() => openOptionsSectionInTab('sonarr')}
            className="inline-flex w-full items-center justify-center rounded-md bg-accent-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            Configure Sonarr
          </button>
        </section>
      )}

      <div className="mt-2 min-h-5 text-xs text-text-secondary" role="status" aria-live="polite">
        {isLoading ? 'Loading settings...' : isSaving ? 'Saving...' : saveError ? saveError : null}
      </div>
    </div>
  );
};

const rootElement = document.getElementById('popup-root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <QuickSettings />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
