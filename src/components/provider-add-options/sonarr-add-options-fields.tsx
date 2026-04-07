/** Reusable Sonarr add-options fields shared by modal and settings flows. */
// src/components/provider-add-options/sonarr-add-options-fields.tsx

import React from 'react';

import { ProviderTagField } from '@/components/provider-tags/provider-tag-field';
import {
  MONITOR_OPTIONS_WITH_DESCRIPTIONS,
  SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS,
  type SonarrFormState,
} from '@/providers/settings/sonarr-settings.schema';
import { SelectField, SwitchField } from '@/shared/ui/form/form';
import type {
  ProviderMetadata,
} from '@/providers';
import { cn } from '@/shared/utils/cn';
import { buildProviderFolderSlugFromTitle } from '@/providers/library/paths';

import { ProviderRootFolderSelect } from './provider-root-folder-select';

export type SonarrAddOptionsFieldsLayout = 'stacked' | 'grid';

export interface SonarrAddOptionsFieldsProps {
  values: SonarrFormState;
  metadata: ProviderMetadata;
  onChange: <K extends keyof SonarrFormState>(field: K, value: SonarrFormState[K]) => void;
  disabled?: boolean | undefined;
  className?: string | undefined;
  portalContainer?: HTMLElement | ShadowRoot | null | undefined;
  initialFocusRef?: React.RefObject<HTMLButtonElement | null> | undefined;
  computedPath?: string | null | undefined;
  pathHintTitle?: string | undefined;
  pathHintTvdbId?: number | null | undefined;
  includeSearchToggle?: boolean | undefined;
  displayRootWithSlug?: boolean | undefined;
  folderSlug?: string | null | undefined;
  layout?: SonarrAddOptionsFieldsLayout | undefined;
}

export function SonarrAddOptionsFields(
  props: SonarrAddOptionsFieldsProps,
): React.JSX.Element {
  const {
    values,
    metadata,
    onChange,
    disabled = false,
    className,
    portalContainer,
    initialFocusRef,
    computedPath,
    pathHintTitle,
    pathHintTvdbId,
    includeSearchToggle = true,
    displayRootWithSlug = false,
    folderSlug,
    layout = 'stacked',
  } = props;

  const isGridLayout = layout === 'grid';
  const fullWidthClass = isGridLayout ? 'md:col-span-2' : undefined;
  const layoutClassName = isGridLayout
    ? 'grid gap-4 md:grid-cols-2'
    : 'flex flex-col gap-4';
  const modalSelectTriggerClassName = 'border border-border-primary/60 bg-bg-tertiary text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]';
  const computedSlug =
    folderSlug && folderSlug.trim().length > 0
      ? folderSlug.trim()
      : buildProviderFolderSlugFromTitle(pathHintTitle, { tvdbId: pathHintTvdbId });
  const qualityProfileOptions = metadata.qualityProfiles.map(profile => ({
    value: String(profile.id),
    label: profile.name,
  }));

  return (
    <div className={cn(layoutClassName, className)}>
      <ProviderRootFolderSelect
        disabled={disabled}
        value={values.rootFolderPath}
        rootFolders={metadata.rootFolders}
        onChange={value => onChange('rootFolderPath', value)}
        portalContainer={portalContainer ?? null}
        initialFocusRef={initialFocusRef}
        className={fullWidthClass}
        triggerClassName={modalSelectTriggerClassName}
        computedSlug={computedSlug}
        displayRootWithSlug={displayRootWithSlug}
        computedPath={computedPath}
      />

      <SelectField
        label="Monitor"
        disabled={disabled}
        value={values.monitorOption}
        onChange={value => onChange('monitorOption', value as SonarrFormState['monitorOption'])}
        options={MONITOR_OPTIONS_WITH_DESCRIPTIONS}
        container={portalContainer ?? null}
        triggerClassName={modalSelectTriggerClassName}
      />

      <SelectField
        label="Quality Profile"
        disabled={disabled}
        value={String(values.qualityProfileId)}
        onChange={value => onChange('qualityProfileId', Number(value))}
        options={qualityProfileOptions}
        placeholder="Select a profile..."
        container={portalContainer ?? null}
        triggerClassName={modalSelectTriggerClassName}
      />

      <SelectField
        label="Series Type"
        disabled={disabled}
        value={values.seriesType}
        onChange={value => onChange('seriesType', value as SonarrFormState['seriesType'])}
        options={SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS}
        container={portalContainer ?? null}
        triggerClassName={modalSelectTriggerClassName}
      />

      <ProviderTagField
        availableTags={metadata.tags}
        disabled={disabled}
        selectedTagIds={values.tags}
        selectedFreeformTags={values.freeformTags}
        onTagIdsChange={tagIds => onChange('tags', tagIds)}
        onFreeformTagsChange={freeformTags => onChange('freeformTags', freeformTags)}
      />

      <div className={cn('pt-1', fullWidthClass)}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SwitchField
            label="Season Folders"
            disabled={disabled}
            checked={values.seasonFolder}
            onCheckedChange={checked => onChange('seasonFolder', checked)}
            labelHelp="Organize episodes into per-season subfolders created automatically."
            labelHelpDelay={600}
            labelHelpContainer={portalContainer ?? null}
            layout="inline"
            labelClassName="text-sm font-medium text-text-primary"
          />

          {includeSearchToggle ? (
            <>
              <SwitchField
                label="Search Missing"
                disabled={disabled}
                checked={values.searchForMissingEpisodes}
                onCheckedChange={checked => onChange('searchForMissingEpisodes', checked)}
                labelHelp="Automatically trigger a search for any missing episodes once the series is added."
                labelHelpDelay={600}
                labelHelpContainer={portalContainer ?? null}
                layout="inline"
                labelClassName="text-sm font-medium text-text-primary"
              />

              <SwitchField
                label="Search Cutoff"
                disabled={disabled}
                checked={values.searchForCutoffUnmetEpisodes}
                onCheckedChange={checked => onChange('searchForCutoffUnmetEpisodes', checked)}
                labelHelp="Ask Sonarr to search for episodes below the quality cutoff during add or update."
                labelHelpDelay={600}
                labelHelpContainer={portalContainer ?? null}
                layout="inline"
                labelClassName="text-sm font-medium text-text-primary"
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
