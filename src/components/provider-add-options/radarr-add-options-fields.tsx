/** Reusable Radarr add-options fields shared by modal and settings flows. */
// src/components/provider-add-options/radarr-add-options-fields.tsx

import React from 'react';

import { ProviderTagField } from '@/components/provider-tags/provider-tag-field';
import { SelectField, SwitchField } from '@/shared/ui/form/form';
import type {
  ProviderMetadata,
} from '@/shared/types/providers';
import type {
  RadarrFormState,
  RadarrMinimumAvailability,
} from '@/shared/schemas/providers/radarr-settings.schema';
import { MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS } from '@/shared/schemas/providers/radarr-settings.schema';
import { cn } from '@/shared/utils/cn';

import { ProviderRootFolderSelect } from './provider-root-folder-select';

export interface RadarrAddOptionsFieldsProps {
  values: RadarrFormState;
  metadata: ProviderMetadata;
  onChange: <K extends keyof RadarrFormState>(field: K, value: RadarrFormState[K]) => void;
  disabled?: boolean | undefined;
  className?: string | undefined;
  portalContainer?: HTMLElement | ShadowRoot | null | undefined;
  initialFocusRef?: React.RefObject<HTMLButtonElement | null> | undefined;
  computedPath?: string | null | undefined;
  folderSlug?: string | null | undefined;
  displayRootWithSlug?: boolean | undefined;
  layout?: 'stacked' | 'grid' | undefined;
}

export function RadarrAddOptionsFields(
  props: RadarrAddOptionsFieldsProps,
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
    folderSlug,
    displayRootWithSlug = false,
    layout = 'stacked',
  } = props;

  const isGridLayout = layout === 'grid';
  const fullWidthClass = isGridLayout ? 'md:col-span-2' : undefined;
  const layoutClassName = isGridLayout
    ? 'grid gap-4 md:grid-cols-2'
    : 'flex flex-col gap-4';
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
        computedSlug={folderSlug ?? null}
        displayRootWithSlug={displayRootWithSlug}
        computedPath={computedPath}
      />

      <SelectField
        label="Quality Profile"
        disabled={disabled}
        value={String(values.qualityProfileId)}
        onChange={value => onChange('qualityProfileId', Number(value))}
        options={qualityProfileOptions}
        placeholder="Select a profile..."
        container={portalContainer ?? null}
      />

      <SelectField
        label="Minimum Availability"
        disabled={disabled}
        value={values.minimumAvailability}
        onChange={value => onChange('minimumAvailability', value as RadarrMinimumAvailability)}
        options={MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS}
        container={portalContainer ?? null}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SwitchField
            label="Monitored"
            disabled={disabled}
            checked={values.monitored}
            onCheckedChange={checked => onChange('monitored', checked)}
            labelHelp="Keep the movie monitored in Radarr so future upgrades remain eligible."
            labelHelpContainer={portalContainer ?? null}
          />
          <SwitchField
            label="Search on Add"
            disabled={disabled}
            checked={values.searchForMovie}
            onCheckedChange={checked => onChange('searchForMovie', checked)}
            labelHelp="Trigger a Radarr search immediately after the movie is added."
            labelHelpContainer={portalContainer ?? null}
          />
        </div>
      </div>
    </div>
  );
}
