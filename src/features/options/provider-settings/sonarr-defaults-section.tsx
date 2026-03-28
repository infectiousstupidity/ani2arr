/** Sonarr provider-settings defaults section backed by shared add-options fields. */
// src/features/options/provider-settings/sonarr-defaults-section.tsx

import React from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { RotateCcw } from 'lucide-react';

import {
  SonarrAddOptionsFields,
  type SonarrAddOptionsFieldsLayout,
} from '@/components/provider-add-options/sonarr-add-options-fields';
import type { SettingsActions } from '@/features/options/use-settings-actions';
import type { SonarrFormState } from '@/shared/providers/sonarr/types';
import type { useSonarrMetadata } from '@/shared/queries';
import type { SettingsFormValues } from '@/shared/schemas/settings';
import Button from '@/shared/ui/primitives/button';

import { SaveSettingsBar } from './save-settings-bar';

type SonarrDefaultsField = keyof SettingsFormValues['providers']['sonarr']['defaults'];

type SonarrDefaultsSectionProps = {
  actions: SettingsActions;
  portalContainer: HTMLElement | null;
  metadataEnabled: boolean;
  metadataQuery: ReturnType<typeof useSonarrMetadata>;
  onRefresh: () => void;
  layout?: SonarrAddOptionsFieldsLayout | undefined;
};

export const SonarrDefaultsSection: React.FC<SonarrDefaultsSectionProps> = ({
  actions,
  portalContainer,
  metadataEnabled,
  metadataQuery,
  onRefresh,
  layout = 'stacked',
}) => {
  const methods = useFormContext<SettingsFormValues>();
  const defaults = useWatch({
    control: methods.control,
    name: 'providers.sonarr.defaults',
  });

  const setDefaultField = <K extends SonarrDefaultsField>(
    field: K,
    value: SonarrFormState[K],
  ): void => {
    const path = `providers.sonarr.defaults.${field}` as const;

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
          Enter a valid Sonarr URL and API key to load available folders, profiles, and tags.
        </div>
      );
    }

    if (metadataQuery.isFetching && !metadataQuery.data) {
      return <div className="text-center p-8 text-text-secondary">Loading Sonarr data...</div>;
    }

    if (metadataQuery.isError) {
      return (
        <div className="rounded-lg border border-dashed border-border-primary/70 bg-bg-tertiary/40 p-4 text-sm text-text-secondary">
          Failed to load data from Sonarr. Check permissions and try again.
        </div>
      );
    }

    if (!metadataQuery.data) return null;

    return (
      <SonarrAddOptionsFields
        values={defaults}
        metadata={metadataQuery.data}
        onChange={setDefaultField}
        disabled={actions.saveState.isPending}
        portalContainer={portalContainer ?? null}
        layout={layout}
      />
    );
  };

  return (
    <section className="a2a-settings-panel p-5 md:p-6">
      <div className="a2a-settings-panel__header flex items-start justify-between gap-3 border-b pb-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Default add options</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Configure defaults reused by overlays and the media modal.
          </p>
        </div>
        <Button
          onClick={onRefresh}
          isLoading={metadataQuery.isRefetching}
          variant="ghost"
          size="icon"
          tooltip="Refresh data from Sonarr"
          portalContainer={portalContainer ?? undefined}
          aria-label="Refresh data from Sonarr"
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
