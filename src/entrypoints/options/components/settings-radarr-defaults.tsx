import React, { useCallback, useMemo } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { RotateCcw } from 'lucide-react';
import type { SettingsFormValues } from '@/shared/schemas/settings';
import type { SettingsActions } from '@/entrypoints/options/hooks/use-settings-actions';
import type { useRadarrMetadata } from '@/shared/queries';
import type { RadarrMinimumAvailability, RadarrQualityProfile, RadarrTag } from '@/shared/types';
import { SelectField, SwitchField } from '@/shared/ui/form/form';
import Button from '@/shared/ui/primitives/button';
import { RootFolderField } from '@/shared/ui/sonarr-form/components/root-folder-field';
import { TagsField } from '@/shared/ui/sonarr-form/components/tags-field';

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

  const tagMaps = useMemo(() => {
    const idToLabel = new Map<number, string>();
    const labelToId = new Map<string, number>();

    const availableTags = metadataQuery.data?.tags ?? [];
    for (const tag of availableTags) {
      if (tag.label && tag.label.trim().length > 0) {
        const trimmed = tag.label.trim();
        idToLabel.set(tag.id, trimmed);
        labelToId.set(trimmed, tag.id);
      }
    }

    return { idToLabel, labelToId };
  }, [metadataQuery.data?.tags]);

  const currentLabels = useMemo(() => {
    const existing = (tagsValue ?? [])
      .map(tagId => tagMaps.idToLabel.get(tagId))
      .filter((label): label is string => typeof label === 'string' && label.length > 0);
    const freeform = (freeformTagsValue ?? []).filter(
      (label): label is string => typeof label === 'string' && label.trim().length > 0,
    );
    return Array.from(new Set([...existing, ...freeform]));
  }, [freeformTagsValue, tagMaps.idToLabel, tagsValue]);

  const handleTagsChange = useCallback(
    (labels: string[]) => {
      const uniqueLabels: string[] = [];
      const seen = new Set<string>();

      for (const label of labels) {
        if (!label || seen.has(label)) continue;
        seen.add(label);
        uniqueLabels.push(label);
      }

      const tagIds: number[] = [];
      const freeform: string[] = [];
      for (const label of uniqueLabels) {
        const tagId = tagMaps.labelToId.get(label);
        if (typeof tagId === 'number') {
          tagIds.push(tagId);
        } else {
          freeform.push(label);
        }
      }

      setValue('providers.radarr.defaults.tags', tagIds, { shouldDirty: true });
      setValue('providers.radarr.defaults.freeformTags', freeform, { shouldDirty: true });
    },
    [setValue, tagMaps.labelToId],
  );

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

    const existingTagLabels = metadataQuery.data.tags
      .map((tag: RadarrTag) => tag.label)
      .filter((label): label is string => typeof label === 'string' && label.trim().length > 0);

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

        <TagsField
          disabled={actions.saveState.isPending}
          value={currentLabels}
          onChange={handleTagsChange}
          existingTags={existingTagLabels}
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
    <section className="rounded-2xl border border-border-primary bg-bg-secondary/70 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border-primary pb-3">
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
    </section>
  );
};
