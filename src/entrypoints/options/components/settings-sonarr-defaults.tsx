import React, { useMemo, useId, useCallback } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, RotateCcw } from 'lucide-react';

import type { SettingsFormValues } from '@/shared/schemas/settings';
import type { SettingsActions } from '@/entrypoints/options/hooks/use-settings-actions';
import type { useSonarrMetadata } from '@/shared/api';
import type { SonarrQualityProfile, SonarrRootFolder } from '@/shared/types';

import { FormField, Label, SelectField, SwitchField } from '@/shared/ui/form/form';
import MultiTagInput from '@/shared/ui/form/multi-tag-input';
import Button from '@/shared/ui/primitives/button';
import {
  MONITOR_OPTIONS_WITH_DESCRIPTIONS,
  SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS,
} from '@/shared/utils/constants';
import type { SonarrFormLayout } from '@/shared/ui/sonarr-form';

type SonarrDefaultsSectionProps = {
  actions: SettingsActions;
  portalContainer: HTMLElement | null;
  metadataEnabled: boolean;
  metadataQuery: ReturnType<typeof useSonarrMetadata>;
  onRefresh: () => void;
  // Allow undefined to match exactOptionalPropertyTypes if enabled in tsconfig
  layout?: SonarrFormLayout | undefined; 
};

// --- Helper Functions ---
function formatRootPath(rootPath: string): string {
  return rootPath.endsWith('/') || rootPath.endsWith('\\')
    ? rootPath.slice(0, -1)
    : rootPath;
}

function formatFreeSpace(bytes?: number | null): string | null {
  if (bytes == null || Number.isNaN(bytes)) return null;
  const tebibyte = 1024 ** 4;
  const gibibyte = 1024 ** 3;
  if (bytes >= tebibyte) {
    return `${(bytes / tebibyte).toFixed(1)} TiB free`;
  }
  if (bytes >= gibibyte) {
    return `${(bytes / gibibyte).toFixed(1)} GiB free`;
  }
  return `${bytes.toLocaleString()} B free`;
}

export const SonarrDefaultsSection: React.FC<SonarrDefaultsSectionProps> = ({
  actions,
  portalContainer,
  metadataEnabled,
  metadataQuery,
  onRefresh,
  layout = 'stacked',
}) => {
  const { control, watch, setValue } = useFormContext<SettingsFormValues>();

  const isGridLayout = layout === 'grid';
  const fullWidthClass = isGridLayout ? 'md:col-span-2' : undefined;
  const layoutClassName = isGridLayout
    ? 'grid gap-4 md:grid-cols-2'
    : 'flex flex-col gap-4';

  const rootFolderFieldId = useId();
  const selectPortal = portalContainer ?? null;

  // --- Tag Logic Mapping ---
  
  const tagsValue = watch('defaults.tags');
  const freeformTagsValue = watch('defaults.freeformTags');
  
  // Memoize the map derivation. Safe access metadataQuery.data?.tags inside to prevent stale closure or dependency warnings.
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

  const { idToLabel, labelToId } = tagMaps;

  const currentLabels = useMemo(() => {
    const existing = (tagsValue ?? [])
      .map((id) => idToLabel.get(id))
      .filter((l): l is string => !!l);
    const freeform = (freeformTagsValue ?? []).filter((l) => !!l.trim());
    return Array.from(new Set([...existing, ...freeform]));
  }, [tagsValue, freeformTagsValue, idToLabel]);

  const handleTagsChange = useCallback(
    (newLabels: string[]) => {
      const tagIds: number[] = [];
      const freeform: string[] = [];
      const seen = new Set<string>();

      for (const label of newLabels) {
        if (!label || seen.has(label)) continue;
        seen.add(label);
        const id = labelToId.get(label);
        if (id !== undefined) {
          tagIds.push(id);
        } else {
          freeform.push(label);
        }
      }
      setValue('defaults.tags', tagIds, { shouldDirty: true });
      setValue('defaults.freeformTags', freeform, { shouldDirty: true });
    },
    [labelToId, setValue]
  );

  // --- Render Content ---

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

    const { rootFolders, qualityProfiles } = metadataQuery.data;

    const qualityProfileOptions = qualityProfiles.map((p: SonarrQualityProfile) => ({
      value: String(p.id),
      label: p.name,
    }));

    return (
      <div className={layoutClassName}>
        {/* Root Folder - Custom Select for Free Space */}
        <div className={fullWidthClass}>
          <Controller
            control={control}
            name="defaults.rootFolderPath"
            render={({ field }) => {
              const selectedDisplay = field.value
                ? formatRootPath(field.value)
                : undefined;

              return (
                <div className="space-y-1">
                  <label
                    htmlFor={rootFolderFieldId}
                    className="text-xs font-medium text-text-secondary"
                  >
                    Root Folder
                  </label>
                  <SelectPrimitive.Root
                    disabled={actions.saveState.isPending}
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectPrimitive.Trigger
                      id={rootFolderFieldId}
                      className="flex h-9 w-full min-w-0 items-center justify-between rounded-md bg-bg-primary px-3 py-2 text-sm text-left text-text-primary placeholder:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
                    >
                      <span className="flex min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap">
                        <SelectPrimitive.Value placeholder="Select a folder...">
                          {selectedDisplay ? (
                            <span
                              className="block min-w-0 truncate text-left"
                              title={selectedDisplay}
                            >
                              {selectedDisplay}
                            </span>
                          ) : null}
                        </SelectPrimitive.Value>
                      </span>
                      <SelectPrimitive.Icon asChild>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </SelectPrimitive.Icon>
                    </SelectPrimitive.Trigger>

                    <SelectPrimitive.Portal
                      container={selectPortal as HTMLElement | ShadowRoot | null}
                    >
                      <SelectPrimitive.Content
                        className="relative z-50 min-w-(--radix-select-trigger-width) max-w-[90vw] overflow-hidden rounded-md border border-bg-primary bg-bg-secondary text-text-primary shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                        position="popper"
                      >
                        <SelectPrimitive.Viewport className="w-full p-1">
                          {rootFolders.map((f: SonarrRootFolder) => {
                            const fullPath = formatRootPath(f.path);
                            const freeSpaceLabel = formatFreeSpace(f.freeSpace);
                            return (
                              <SelectPrimitive.Item
                                key={f.id}
                                value={f.path}
                                className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-bg-tertiary focus:text-text-primary data-[state=checked]:text-accent-primary"
                              >
                                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                  <SelectPrimitive.ItemIndicator>
                                    <Check className="h-4 w-4" />
                                  </SelectPrimitive.ItemIndicator>
                                </span>
                                <SelectPrimitive.ItemText asChild>
                                  <div className="flex w-full items-center justify-between gap-4">
                                    <span
                                      className="min-w-0 truncate text-left"
                                      title={fullPath}
                                    >
                                      {fullPath}
                                    </span>
                                    {freeSpaceLabel ? (
                                      <span className="shrink-0 whitespace-nowrap text-xs text-text-tertiary">
                                        {freeSpaceLabel}
                                      </span>
                                    ) : null}
                                  </div>
                                </SelectPrimitive.ItemText>
                              </SelectPrimitive.Item>
                            );
                          })}
                        </SelectPrimitive.Viewport>
                      </SelectPrimitive.Content>
                    </SelectPrimitive.Portal>
                  </SelectPrimitive.Root>
                </div>
              );
            }}
          />
        </div>

        {/* Monitor */}
        <Controller
          control={control}
          name="defaults.monitorOption"
          render={({ field }) => (
            <SelectField
              {...field}
              label="Monitor"
              disabled={actions.saveState.isPending}
              options={MONITOR_OPTIONS_WITH_DESCRIPTIONS}
              container={selectPortal}
            />
          )}
        />

        {/* Quality Profile */}
        <Controller
          control={control}
          name="defaults.qualityProfileId"
          render={({ field }) => (
            <SelectField
              label="Quality Profile"
              disabled={actions.saveState.isPending}
              value={String(field.value)}
              onValueChange={(v) => field.onChange(Number(v))}
              options={qualityProfileOptions}
              placeholder="Select a profile..."
              container={selectPortal}
            />
          )}
        />

        {/* Series Type */}
        <Controller
          control={control}
          name="defaults.seriesType"
          render={({ field }) => (
            <SelectField
              {...field}
              label="Series Type"
              disabled={actions.saveState.isPending}
              options={SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS}
              container={selectPortal}
            />
          )}
        />

        {/* Tags (keep same column as Series Type) */}
        <FormField>
          <div className="space-y-3">
            <Label>Tags</Label>
            <MultiTagInput
              value={currentLabels}
              onChange={handleTagsChange}
              placeholder="Add tags..."
              disabled={actions.saveState.isPending}
              existingTags={Array.from(tagMaps.labelToId.keys())}
            />
          </div>
        </FormField>

        {/* Toggles */}
        <div className={fullWidthClass ? `pt-1 ${fullWidthClass}` : 'pt-1'}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Controller
              control={control}
              name="defaults.seasonFolder"
              render={({ field }) => (
                <SwitchField
                  label="Season Folders"
                  disabled={actions.saveState.isPending}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  labelHelp="Organize episodes into per-season subfolders created automatically."
                  labelHelpContainer={selectPortal}
                />
              )}
            />
            <Controller
              control={control}
              name="defaults.searchForMissingEpisodes"
              render={({ field }) => (
                <SwitchField
                  label="Search on Add"
                  disabled={actions.saveState.isPending}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  labelHelp="Automatically trigger a search for any missing episodes once the series is added."
                  labelHelpContainer={selectPortal}
                />
              )}
            />
            <Controller
              control={control}
              name="defaults.searchForCutoffUnmet"
              render={({ field }) => (
                <SwitchField
                  label="Cutoff Unmet"
                  disabled={actions.saveState.isPending}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  labelHelp="Trigger searches for episodes that are below the quality cutoff to find better releases."
                  labelHelpContainer={selectPortal}
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
    </section>
  );
};
