/** Reusable Radarr edit fields for existing-movie flows. */
// src/components/provider-add-options/radarr-edit-options-fields.tsx

import React from 'react';

import { ProviderTagField } from '@/components/provider-tags/provider-tag-field';
import { parseProviderQualityProfileId, type ProviderFormOptions } from '@/providers';
import {
  type RadarrFormState,
  type RadarrMinimumAvailability,
} from '@/providers/radarr/form-state';
import { SelectField, SwitchField } from '@/shared/ui/form/form';
import { cn } from '@/shared/utils/cn';

import { ProviderRootFolderSelect, type ProviderRootFolderPathPreview } from './provider-root-folder-select';
import { MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS } from './radarr-options';

export interface RadarrEditOptionsFieldsProps {
  values: RadarrFormState;
  formOptions: ProviderFormOptions;
  onChange: <K extends keyof RadarrFormState>(field: K, value: RadarrFormState[K]) => void;
  disabled?: boolean | undefined;
  className?: string | undefined;
  portalContainer?: HTMLElement | ShadowRoot | null | undefined;
  initialFocusRef?: React.RefObject<HTMLButtonElement | null> | undefined;
  pathPreview?: ProviderRootFolderPathPreview | undefined;
  layout?: 'stacked' | 'grid' | undefined;
}

export function RadarrEditOptionsFields(
  props: RadarrEditOptionsFieldsProps,
): React.JSX.Element {
  const {
    values,
    formOptions,
    onChange,
    disabled = false,
    className,
    portalContainer,
    initialFocusRef,
    pathPreview,
    layout = 'stacked',
  } = props;

  const isGridLayout = layout === 'grid';
  const fullWidthClass = isGridLayout ? 'md:col-span-2' : undefined;
  const layoutClassName = isGridLayout
    ? 'grid gap-4 md:grid-cols-2'
    : 'flex flex-col gap-4';
  const modalSelectTriggerClassName = 'border border-border-primary/60 bg-bg-tertiary text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]';
  const qualityProfileOptions = formOptions.qualityProfiles.map(profile => ({
    value: String(profile.id),
    label: profile.name,
  }));

  return (
    <div className={cn(layoutClassName, className)}>
      <ProviderRootFolderSelect
        disabled={disabled}
        value={values.rootFolderPath ?? ''}
        rootFolders={formOptions.rootFolders}
        onChange={value => onChange('rootFolderPath', value)}
        portalContainer={portalContainer ?? null}
        initialFocusRef={initialFocusRef}
        className={fullWidthClass}
        triggerClassName={modalSelectTriggerClassName}
        pathPreview={pathPreview}
      />

      <SelectField
        label="Quality Profile"
        disabled={disabled}
        value={values.qualityProfileId === undefined ? '' : String(values.qualityProfileId)}
        onChange={value => {
          const num = Number(value);
          onChange('qualityProfileId', !value || Number.isNaN(num) ? undefined : parseProviderQualityProfileId(num));
        }}
        options={qualityProfileOptions}
        placeholder="Select a profile..."
        container={portalContainer ?? null}
        triggerClassName={modalSelectTriggerClassName}
      />

      <SelectField
        label="Minimum Availability"
        disabled={disabled}
        value={values.minimumAvailability ?? ''}
        onChange={value => onChange('minimumAvailability', value as RadarrMinimumAvailability)}
        options={MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS}
        container={portalContainer ?? null}
        triggerClassName={modalSelectTriggerClassName}
      />

      <ProviderTagField
        availableTags={formOptions.tags}
        disabled={disabled}
        selectedTagIds={values.tags ?? []}
        selectedFreeformTags={values.freeformTags}
        onTagIdsChange={tagIds => onChange('tags', tagIds)}
        onFreeformTagsChange={freeformTags => onChange('freeformTags', freeformTags)}
      />

      <div className={cn('pt-1', fullWidthClass)}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SwitchField
            label="Monitored"
            disabled={disabled}
            checked={values.monitored ?? false}
            onCheckedChange={checked => onChange('monitored', checked)}
            labelHelp="Keep the movie monitored in Radarr so future upgrades remain eligible."
            labelHelpContainer={portalContainer ?? null}
            layout="inline"
            labelClassName="text-sm font-medium text-text-primary"
          />
        </div>
      </div>
    </div>
  );
}
