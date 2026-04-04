/** Options-page controls for browse-card and anime-page UI enablement and visibility settings. */
// src/options-page/sections/ui-section.tsx

import React from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { defaultUiOptions, type BadgeVisibility, type ExtensionOptions } from '@/options';
import type { Provider } from '@/providers';

const VISIBILITY_OPTIONS: Array<{ value: BadgeVisibility; label: string; description: string }> = [
  { value: 'always', label: 'Always', description: 'Show actions and status badges on every supported card.' },
  { value: 'hover', label: 'On hover', description: 'Keep the card cleaner until the pointer is over it.' },
];

const ProviderVisibilityControl: React.FC<{
  provider: Provider;
  title: string;
  description: string;
  enabled: boolean;
  visibility: BadgeVisibility;
  onToggle: (checked: boolean) => void;
  onVisibilityChange: (value: BadgeVisibility) => void;
}> = ({ provider, title, description, enabled, visibility, onToggle, onVisibilityChange }) => (
  <div className="a2a-settings-panel__inset rounded-2xl p-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
        <p className="mt-1 text-xs text-text-secondary">{description}</p>
      </div>
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <span>Enabled</span>
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={enabled}
          onChange={(event) => onToggle(event.currentTarget.checked)}
          aria-label={`Enable ${provider} browse cards`}
        />
      </label>
    </div>

    <fieldset className="mt-4 space-y-2" disabled={!enabled}>
      <legend className="text-xs font-medium text-text-secondary">Visibility when enabled</legend>
      <p className="text-xs text-text-secondary">
        Enabled controls whether ani2arr injects browse-card UI for this provider. Visibility only changes how an enabled card is shown.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {VISIBILITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onVisibilityChange(option.value)}
            className={`flex flex-col items-start rounded-xl border px-3 py-3 text-left transition-colors ${
              visibility === option.value
                ? 'border-accent-primary/70 bg-accent-primary/15 text-text-primary'
                : 'border-border-primary bg-bg-primary/40 text-text-secondary hover:border-accent-primary/60'
            }`}
          >
            <span className="text-sm font-semibold">{option.label}</span>
            <span className="mt-1 text-xs text-text-secondary">{option.description}</span>
          </button>
        ))}
      </div>
    </fieldset>
  </div>
);

const ProviderAnimePageControl: React.FC<{
  provider: Provider;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (checked: boolean) => void;
}> = ({ provider, title, description, enabled, onToggle }) => (
  <div className="a2a-settings-panel__inset rounded-2xl px-4 py-4">
    <div className="flex items-center justify-between gap-4">
      <div>
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
        <p className="mt-1 text-xs text-text-secondary">{description}</p>
      </div>
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={enabled}
        onChange={(event) => onToggle(event.currentTarget.checked)}
        aria-label={`Enable ${provider} anime page actions`}
      />
    </div>
  </div>
);

const UiSection: React.FC = () => {
  const methods = useFormContext<ExtensionOptions>();
  const ui =
    (useWatch({ control: methods.control, name: 'ui' as const }) as ExtensionOptions['ui'] | undefined) ??
    defaultUiOptions();

  const setUi = (nextUi: ExtensionOptions['ui']) => {
    methods.setValue('ui', nextUi, { shouldDirty: true });
  };

  const updateBrowseProvider = (
    provider: Provider,
    patch: Partial<ExtensionOptions['ui']['browseCards'][Provider]>,
  ) => {
    setUi({
      ...ui,
      browseCards: {
        ...ui.browseCards,
        [provider]: {
          ...ui.browseCards[provider],
          ...patch,
        },
      },
    });
  };

  const updateAnimeProvider = (
    provider: Provider,
    patch: Partial<ExtensionOptions['ui']['animePages'][Provider]>,
  ) => {
    setUi({
      ...ui,
      animePages: {
        ...ui.animePages,
        [provider]: {
          ...ui.animePages[provider],
          ...patch,
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">UI &amp; actions</h2>
        <p className="text-sm text-text-secondary">
          Choose where ani2arr actions appear for Sonarr and Radarr without changing the rest of the extension.
        </p>
      </div>

      <section className="a2a-settings-panel">
        <div className="a2a-settings-panel__header border-b px-5 py-4">
          <h3 className="text-sm font-semibold text-text-primary">Browse cards</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Enable browse and search card injection per provider, then choose whether enabled cards stay visible or only appear on hover.
          </p>
        </div>
        <div className="space-y-4 px-5 py-5">
          <ProviderVisibilityControl
            provider="sonarr"
            title="Sonarr browse cards"
            description="Applies to TV, OVA, ONA, and other Sonarr-supported cards on AniList and AniChart."
            enabled={ui.browseCards.sonarr.enabled}
            visibility={ui.browseCards.sonarr.visibility}
            onToggle={(checked) => updateBrowseProvider('sonarr', { enabled: checked })}
            onVisibilityChange={(value) => updateBrowseProvider('sonarr', { visibility: value })}
          />
          <ProviderVisibilityControl
            provider="radarr"
            title="Radarr browse cards"
            description="Applies to movie cards on AniList and AniChart."
            enabled={ui.browseCards.radarr.enabled}
            visibility={ui.browseCards.radarr.visibility}
            onToggle={(checked) => updateBrowseProvider('radarr', { enabled: checked })}
            onVisibilityChange={(value) => updateBrowseProvider('radarr', { visibility: value })}
          />
        </div>
      </section>

      <section className="a2a-settings-panel">
        <div className="a2a-settings-panel__header border-b px-5 py-4">
          <h3 className="text-sm font-semibold text-text-primary">Anime pages</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Control the action bar above AniList&apos;s native page buttons for each provider.
          </p>
        </div>
        <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
          <ProviderAnimePageControl
            provider="sonarr"
            title="Sonarr anime page actions"
            description="Show Sonarr status and actions on supported series pages."
            enabled={ui.animePages.sonarr.enabled}
            onToggle={(checked) => updateAnimeProvider('sonarr', { enabled: checked })}
          />
          <ProviderAnimePageControl
            provider="radarr"
            title="Radarr anime page actions"
            description="Show Radarr status and actions on movie pages."
            enabled={ui.animePages.radarr.enabled}
            onToggle={(checked) => updateAnimeProvider('radarr', { enabled: checked })}
          />
        </div>
      </section>
    </div>
  );
};

export default UiSection;
