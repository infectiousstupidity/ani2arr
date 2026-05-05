/** Radarr provider-settings defaults section backed by shared add-options fields. */
// src/options-page/provider-settings/radarr-defaults-section.tsx

import React from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { RotateCcw } from 'lucide-react';

import { RadarrAddOptionsFields } from '@/components/provider-add-options/radarr-add-options-fields';
import type { SettingsActions } from '../hooks/use-settings-actions';
import type { RadarrFormState } from '@/providers/settings/provider-settings.schema';
import Button from '@/shared/ui/primitives/button';
import type { ExtensionOptions } from '@/options';

import { SaveSettingsBar } from './save-settings-bar';
import type { useRadarrFormOptions } from '@/providers/hooks/radarr.queries';

export const RadarrDefaultsSection: React.FC<{
  actions: SettingsActions;
  portalContainer: HTMLElement | null;
  formOptionsEnabled: boolean;
  formOptionsQuery: ReturnType<typeof useRadarrFormOptions>;
  onRefresh: () => void;
}> = ({
  actions,
  portalContainer,
  formOptionsEnabled,
  formOptionsQuery,
  onRefresh,
}) => {
  const methods = useFormContext<ExtensionOptions>();
  const defaults = useWatch({
    control: methods.control,
    name: 'providers.radarr.defaults',
  });

  const setDefaultField = <K extends keyof ExtensionOptions['providers']['radarr']['defaults']>(
    field: K,
    value: RadarrFormState[K],
  ): void => {
    const path = `providers.radarr.defaults.${field}` as const;

    methods.setValue(
      path,
      value as never,
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const renderContent = () => {
    if (!formOptionsEnabled) {
      return (
        <div className="rounded-lg border border-dashed border-border-primary/70 bg-bg-tertiary/40 p-4 text-sm text-text-secondary">
          Enter a valid Radarr URL and API key to load available folders, profiles, and tags.
        </div>
      );
    }

    if (formOptionsQuery.isFetching && !formOptionsQuery.data) {
      return <div className="text-center p-8 text-text-secondary">Loading Radarr data...</div>;
    }

    if (formOptionsQuery.isError) {
      return (
        <div className="rounded-lg border border-dashed border-border-primary/70 bg-bg-tertiary/40 p-4 text-sm text-text-secondary">
          Failed to load data from Radarr. Check permissions and try again.
        </div>
      );
    }

    if (!formOptionsQuery.data) return null;

    return (
      <RadarrAddOptionsFields
        values={defaults}
        formOptions={formOptionsQuery.data}
        onChange={setDefaultField}
        disabled={actions.isBusy}
        portalContainer={portalContainer ?? null}
        layout="grid"
      />
    );
  };

  return (
    <section className="a2a-settings-panel p-5 md:p-6">
      <div className="a2a-settings-panel__header flex items-start justify-between gap-3 border-b pb-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Default add options</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Configure defaults reused by movie overlays and the media modal.
          </p>
        </div>
        <Button
          onClick={onRefresh}
          isLoading={formOptionsQuery.isRefetching}
          variant="ghost"
          size="icon"
          tooltip="Refresh data from Radarr"
          tooltipContainer={portalContainer ?? undefined}
          aria-label="Refresh data from Radarr"
          aria-busy={formOptionsQuery.isRefetching}
          disabled={!formOptionsEnabled || actions.isBusy}
        >
          <RotateCcw />
        </Button>
      </div>

      <div className="mt-4">{renderContent()}</div>

      <SaveSettingsBar
        actions={actions}
        className="mt-6 border-t border-border-primary pt-4"
      />
    </section>
  );
};
