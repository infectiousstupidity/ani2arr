// src/entrypoints/options/components/ui-section.tsx
import React from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import TooltipWrapper from '@/shared/components/tooltip';
import type { BadgeVisibility } from '@/shared/types';
import type { SettingsFormValues } from '@/shared/schemas/settings';
import { defaultUiOptions } from '@/shared/schemas/settings';

const BadgeToggle: React.FC<{
  value: BadgeVisibility;
  onChange: (value: BadgeVisibility) => void;
}> = ({ value, onChange }) => {
  const options: Array<{ value: BadgeVisibility; label: string; description: string }> = [
    { value: 'always', label: 'Always', description: 'Badges are always visible on cards.' },
    { value: 'hover', label: 'On hover', description: 'Badges appear when you hover a card.' },
    { value: 'hidden', label: 'Hidden', description: 'Do not show status badges.' },
  ];
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
            value === option.value
              ? 'border-accent-primary/70 bg-accent-primary/20 text-text-primary'
              : 'border-border-primary bg-bg-tertiary/60 text-text-secondary hover:border-accent-primary/60'
          }`}
        >
          <span className="text-[13px] font-semibold">{option.label}</span>
          <span className="mt-1 text-[11px] text-text-secondary">{option.description}</span>
        </button>
      ))}
    </div>
  );
};

const UiSection: React.FC = () => {
  const methods = useFormContext<SettingsFormValues>();
  const ui = (useWatch<SettingsFormValues>({ control: methods.control, name: 'ui' as const }) ??
    defaultUiOptions()) as SettingsFormValues['ui'];
  const setUiValue = <K extends keyof SettingsFormValues['ui']>(key: K, value: SettingsFormValues['ui'][K]) => {
    methods.setValue(
      'ui',
      { ...ui, [key]: value } as SettingsFormValues['ui'],
      { shouldDirty: true },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">UI &amp; injection</h2>
        <p className="text-sm text-text-secondary">
          Control AniList overlays, badges, and modal behaviour.
        </p>
      </div>

      <div className="rounded-2xl border border-border-primary bg-bg-secondary/70">
        <div className="px-4 py-3 border-b border-border-primary">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Browse overlays</h3>
              <p className="mt-1 text-xs text-text-secondary">
                Status badges and actions on AniList browse/search cards.
              </p>
            </div>
            <TooltipWrapper content="Applies to browse/search overlays injected into AniList and AniChart grids.">
              <span className="text-[11px] text-text-secondary">Content scripts</span>
            </TooltipWrapper>
          </div>
        </div>
        <div className="space-y-4 px-4 py-4">
          <div className="flex items-center justify-between gap-4 rounded-xl bg-bg-tertiary/60 px-3 py-2">
            <div>
              <p className="text-sm text-text-primary">Enable overlays</p>
              <p className="text-xs text-text-secondary">
                Turn off to hide ani2arr buttons and badges on browse grids.
              </p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={ui.browseOverlayEnabled}
              onChange={(e) => setUiValue('browseOverlayEnabled', e.target.checked)}
            />
          </div>
          <fieldset className="space-y-2" disabled={!ui.browseOverlayEnabled}>
            <legend className="text-xs font-medium text-text-secondary">Badge visibility</legend>
            <BadgeToggle
              value={ui.badgeVisibility}
              onChange={(value) => setUiValue('badgeVisibility', value)}
            />
          </fieldset>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border-primary bg-bg-secondary/70">
          <div className="px-4 py-3 border-b border-border-primary">
            <h3 className="text-sm font-semibold text-text-primary">Anime pages</h3>
            <p className="mt-1 text-xs text-text-secondary">
              Inject status and actions above the native AniList anime page buttons.
            </p>
          </div>
          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-4 rounded-xl bg-bg-tertiary/60 px-3 py-2">
              <div>
                <p className="text-sm text-text-primary">Enable header injection</p>
                <p className="text-xs text-text-secondary">
                  Show library status and actions in the anime page header.
                </p>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={ui.headerInjectionEnabled}
                onChange={(e) => setUiValue('headerInjectionEnabled', e.target.checked)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UiSection;
