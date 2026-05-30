/** Sonarr add-options fields for media modal setup flows. */
// src/features/media-modal/sonarr/sonarr-add-options-fields.tsx

import React from 'react';

import { parseProviderQualityProfileId, type ProviderFormResources } from '@/providers';
import type { SonarrFormState } from '@/providers/sonarr/form-state';
import {
  SONARR_MONITOR_OPTIONS_WITH_DESCRIPTIONS,
  SONARR_SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS,
} from '@/providers/sonarr/form-options';
import { SelectField } from '@/shared/ui/form/select-field';
import { SwitchField } from '@/shared/ui/form/switch-field';
import { ProviderTagField } from '@/shared/ui/provider-tag-field';
import { cn } from '@/shared/utils/cn';

import { ProviderRootFolderSelect, type ProviderRootFolderPathPreview } from '../setup/provider-root-folder-select';

export interface SonarrAddOptionsFieldsProps {
  values: SonarrFormState;
  formResources: ProviderFormResources;
  onChange: <K extends keyof SonarrFormState>(field: K, value: SonarrFormState[K]) => void;
  disabled?: boolean | undefined;
  className?: string | undefined;
  portalContainer?: HTMLElement | ShadowRoot | null | undefined;
  pathPreview?: ProviderRootFolderPathPreview | undefined;
}

function SonarrSearchToggles(props: {
  values: SonarrFormState;
  disabled: boolean;
  portalContainer?: HTMLElement | ShadowRoot | null | undefined;
  onChange: <K extends keyof SonarrFormState>(field: K, value: SonarrFormState[K]) => void;
}): React.JSX.Element {
  const { values, disabled, portalContainer, onChange } = props;
  const searchForMissingEpisodes = values.addOptions?.searchForMissingEpisodes ?? false;
  const searchForCutoffUnmetEpisodes =
    values.addOptions?.searchForCutoffUnmetEpisodes ?? false;

  return (
    <>
      <SwitchField
        label="Search Missing"
        disabled={disabled}
        checked={searchForMissingEpisodes}
        onCheckedChange={checked =>
          onChange('addOptions', {
            ...values.addOptions,
            searchForMissingEpisodes: checked,
          })}
        labelHelp="Automatically search for missing episodes when adding a series."
        labelHelpDelay={600}
        labelHelpContainer={portalContainer ?? null}
        layout="inline"
        labelClassName="text-sm font-medium text-text-primary"
      />

      <SwitchField
        label="Search Cutoff"
        disabled={disabled}
        checked={searchForCutoffUnmetEpisodes}
        onCheckedChange={checked =>
          onChange('addOptions', {
            ...values.addOptions,
            searchForCutoffUnmetEpisodes: checked,
          })}
        labelHelp="Search for episodes that haven't met the cutoff."
        labelHelpDelay={600}
        labelHelpContainer={portalContainer ?? null}
        layout="inline"
        labelClassName="text-sm font-medium text-text-primary"
      />
    </>
  );
}

export function SonarrAddOptionsFields(
  props: SonarrAddOptionsFieldsProps,
): React.JSX.Element {
  const {
    values,
    formResources,
    onChange,
    disabled = false,
    className,
    portalContainer,
    pathPreview,
  } = props;

  const modalSelectTriggerClassName = 'border border-border-primary/60 bg-bg-tertiary text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]';
  const qualityProfileOptions = formResources.qualityProfiles.map(profile => ({
    value: String(profile.id),
    label: profile.name,
  }));
  const monitor = values.addOptions?.monitor ?? '';

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <ProviderRootFolderSelect
        disabled={disabled}
        value={values.rootFolderPath ?? ''}
        rootFolders={formResources.rootFolders}
        onChange={value => onChange('rootFolderPath', value)}
        portalContainer={portalContainer ?? null}
        triggerClassName={modalSelectTriggerClassName}
        pathPreview={pathPreview}
      />

      <SelectField
        label="Monitor Episodes"
        disabled={disabled}
        value={monitor}
        onChange={value =>
          onChange('addOptions', {
            ...values.addOptions,
            monitor: value as NonNullable<SonarrFormState['addOptions']>['monitor'],
          })}
        options={SONARR_MONITOR_OPTIONS_WITH_DESCRIPTIONS}
        container={portalContainer ?? null}
        triggerClassName={modalSelectTriggerClassName}
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
        label="Series Type"
        disabled={disabled}
        value={values.seriesType ?? ''}
        onChange={value => onChange('seriesType', value as SonarrFormState['seriesType'])}
        options={SONARR_SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS}
        container={portalContainer ?? null}
        triggerClassName={modalSelectTriggerClassName}
      />

      <ProviderTagField
        availableTags={formResources.tags}
        disabled={disabled}
        selectedTagIds={values.tags ?? []}
        selectedFreeformTags={values.freeformTags}
        label="Tags"
        onChange={({ tagIds, freeformTags }) => {
          onChange('tags', tagIds);
          onChange('freeformTags', freeformTags);
        }}
      />

      <div className="pt-1">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SwitchField
            label="Season Folders"
            disabled={disabled}
            checked={values.seasonFolder ?? false}
            onCheckedChange={checked => onChange('seasonFolder', checked)}
            labelHelp="Organize episodes into per-season subfolders created automatically."
            labelHelpDelay={600}
            labelHelpContainer={portalContainer ?? null}
            layout="inline"
            labelClassName="text-sm font-medium text-text-primary"
          />

          <SonarrSearchToggles
            values={values}
            disabled={disabled}
            portalContainer={portalContainer}
            onChange={onChange}
          />
        </div>
      </div>
    </div>
  );
}
