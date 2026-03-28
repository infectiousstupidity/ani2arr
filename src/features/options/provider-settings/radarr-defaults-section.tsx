/** Radarr provider-settings defaults section backed by shared add-options fields. */
// src/features/options/provider-settings/radarr-defaults-section.tsx

import React from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { RotateCcw } from 'lucide-react';

import { RadarrAddOptionsFields } from '@/components/provider-add-options/radarr-add-options-fields';
import type { SettingsActions } from '@/features/options/use-settings-actions';
import type { RadarrFormState } from '@/shared/providers/radarr/types';
import type { useRadarrMetadata } from '@/shared/queries';
import type { SettingsFormValues } from '@/shared/schemas/settings';
import Button from '@/shared/ui/primitives/button';

import { SaveSettingsBar } from './save-settings-bar';

type RadarrDefaultsField = keyof SettingsFormValues['providers']['radarr']['defaults'];

type RadarrDefaultsSectionProps = {
  actions: SettingsActions;
  portalContainer: HTMLElement | null;
  metadataEnabled: boolean;
  metadataQuery: ReturnType<typeof useRadarrMetadata>;
  onRefresh: () => void;
};

export const RadarrDefaultsSection: React.FC<RadarrDefaultsSectionProps> = ({
  actions,
  portalContainer,
  metadataEnabled,
  metadataQuery,
  onRefresh,
}) => {
  const methods = useFormContext<SettingsFormValues>();
  const defaults = useWatch({
    control: methods.control,
    name: 'providers.radarr.defaults',
  });

  const setDefaultField = <K extends RadarrDefaultsField>(
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
    if (!metadataEnabled) {
      return (
        <div className="rounded-lg border border-dashed border-border-primary/70 bg-bg-tertiary/40 p-4 text-sm text-text-secondary">
          Enter a valid Radarr URL and API key to load available folders, profiles, and tags.
        </div>
      );
    }

    if (metadataQuery.isFetching && !metadataQuery.data) {
      return <div className="text-center p-8 text-text-secondary">Loading Radarr data...</div>;
    }

    if (metadataQuery.isError) {
      return (
        <div className="rounded-lg border border-dashed border-border-primary/70 bg-bg-tertiary/40 p-4 text-sm text-text-secondary">
          Failed to load data from Radarr. Check permissions and try again.
        </div>
      );
    }

    if (!metadataQuery.data) return null;

    return (
      <RadarrAddOptionsFields
        values={defaults}
        metadata={metadataQuery.data}
        onChange={setDefaultField}
        disabled={actions.saveState.isPending}
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
          isLoading={metadataQuery.isRefetching}
          variant="ghost"
          size="icon"
          tooltip="Refresh data from Radarr"
          portalContainer={portalContainer ?? undefined}
          aria-label="Refresh data from Radarr"
          aria-busy={metadataQuery.isRefetching}
          disabled={!metadataEnabled || actions.saveState.isPending}
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
