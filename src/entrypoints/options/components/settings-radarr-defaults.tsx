/** Renders Radarr default add settings using shared provider form controls and tag selection UI. */
// src/entrypoints/options/components/settings-radarr-defaults.tsx

import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { RotateCcw } from 'lucide-react';
import { ProviderTagField } from '@/components/provider-tags/provider-tag-field';
import type { SettingsFormValues } from '@/shared/schemas/settings';
import type { SettingsActions } from '@/entrypoints/options/hooks/use-settings-actions';
import type { useRadarrMetadata } from '@/shared/queries';
import type { RadarrMinimumAvailability, RadarrQualityProfile } from '@/shared/types';
import { SelectField, SwitchField } from '@/shared/ui/form/form';
import { RootFolderField } from '@/ui/provider-forms/fields/root-folder-field';
import Button from '@/shared/ui/primitives/button';
import { SaveSettingsBar } from './settings-save-bar';

const MINIMUM_AVAILABILITY_OPTIONS: Array<{
  value: RadarrMinimumAvailability;
  label: string;
  description: string;
}> = [
  { value: 'announced', label: 'Announced', description: 'Allow adds before a theatrical or digital date exists.' },
  { value: 'inCinemas', label: 'In Cinemas', description: 'Wait until the movie has a theatrical release.' },
  { value: 'released', label: 'Released', description: 'Wait until the movie is officially released.' },
  { value: 'preDB', label: 'PreDB', description: 'Allow pre-release scene or predb availability.' },
];

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
  const { control, watch, setValue } = useFormContext<SettingsFormValues>();

  const tagsValue = watch('providers.radarr.defaults.tags');
  const freeformTagsValue = watch('providers.radarr.defaults.freeformTags');

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

    const qualityProfileOptions = metadataQuery.data.qualityProfiles.map((profile: RadarrQualityProfile) => ({
      value: String(profile.id),
      label: profile.name,
    }));

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Controller
          control={control}
          name="providers.radarr.defaults.rootFolderPath"
          render={({ field }) => (
            <RootFolderField
              disabled={actions.saveState.isPending}
              value={field.value}
              rootFolders={metadataQuery.data.rootFolders}
              onChange={field.onChange}
              portalContainer={portalContainer}
              computedSlug={null}
              displayRootWithSlug={false}
              fullWidthClass="md:col-span-2"
            />
          )}
        />

        <Controller
          control={control}
          name="providers.radarr.defaults.qualityProfileId"
          render={({ field }) => (
            <SelectField
              label="Quality Profile"
              disabled={actions.saveState.isPending}
              value={String(field.value)}
              onValueChange={value => field.onChange(Number(value))}
              options={qualityProfileOptions}
              placeholder="Select a profile..."
              container={portalContainer}
            />
          )}
        />

        <Controller
          control={control}
          name="providers.radarr.defaults.minimumAvailability"
          render={({ field }) => (
            <SelectField
              label="Minimum Availability"
              disabled={actions.saveState.isPending}
              value={field.value}
              onValueChange={field.onChange}
              options={MINIMUM_AVAILABILITY_OPTIONS}
              container={portalContainer}
            />
          )}
        />

        <ProviderTagField
          availableTags={metadataQuery.data.tags}
          disabled={actions.saveState.isPending}
          selectedTagIds={tagsValue}
          selectedFreeformTags={freeformTagsValue}
          onTagIdsChange={tagIds => setValue('providers.radarr.defaults.tags', tagIds, { shouldDirty: true })}
          onFreeformTagsChange={freeformTags =>
            setValue('providers.radarr.defaults.freeformTags', freeformTags, { shouldDirty: true })
          }
        />

        <div className="pt-1 md:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="providers.radarr.defaults.monitored"
              render={({ field }) => (
                <SwitchField
                  label="Monitored"
                  disabled={actions.saveState.isPending}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  labelHelp="Keep the movie monitored in Radarr so future upgrades remain eligible."
                  labelHelpContainer={portalContainer}
                />
              )}
            />

            <Controller
              control={control}
              name="providers.radarr.defaults.searchForMovie"
              render={({ field }) => (
                <SwitchField
                  label="Search on Add"
                  disabled={actions.saveState.isPending}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  labelHelp="Trigger a Radarr search immediately after the movie is added."
                  labelHelpContainer={portalContainer}
                />
              )}
            />
          </div>
        </div>
      </div>
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
