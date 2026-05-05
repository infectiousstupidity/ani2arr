/** Reusable Sonarr add-options fields shared by modal and settings flows. */
// src/components/provider-add-options/sonarr-add-options-fields.tsx

import React from 'react';

import { ProviderTagField } from '@/components/provider-tags/provider-tag-field';
import { parseProviderQualityProfileId, type ProviderFormOptions } from '@/providers';
import {
  MONITOR_OPTIONS_WITH_DESCRIPTIONS,
  SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS,
  type SonarrFormState,
} from '@/providers/settings/provider-settings.schema';
import { SelectField, SwitchField } from '@/shared/ui/form/form';
import { cn } from '@/shared/utils/cn';

import { ProviderRootFolderSelect, type ProviderRootFolderPathPreview } from './provider-root-folder-select';

export type SonarrAddOptionsFieldsLayout = 'stacked' | 'grid';

export interface SonarrAddOptionsFieldsProps {
  values: SonarrFormState;
  formOptions: ProviderFormOptions;
  onChange: <K extends keyof SonarrFormState>(field: K, value: SonarrFormState[K]) => void;
  disabled?: boolean | undefined;
  className?: string | undefined;
  portalContainer?: HTMLElement | ShadowRoot | null | undefined;
  initialFocusRef?: React.RefObject<HTMLButtonElement | null> | undefined;
  pathPreview?: ProviderRootFolderPathPreview | undefined;
  includeSearchToggle?: boolean | undefined;
  layout?: SonarrAddOptionsFieldsLayout | undefined;
}
// TODO: Clean up and simplify this component later.
// eslint-disable-next-line complexity -- Existing add form keeps Sonarr field wiring in one reusable component.
export function SonarrAddOptionsFields(
  props: SonarrAddOptionsFieldsProps,
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
    includeSearchToggle = true,
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
  const monitor = values.addOptions?.monitor ?? '';
  const searchForMissingEpisodes = values.addOptions?.searchForMissingEpisodes ?? false;
  const searchForCutoffUnmetEpisodes =
    values.addOptions?.searchForCutoffUnmetEpisodes ?? false;

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
        label="Monitor Episodes"
        disabled={disabled}
        value={monitor}
        onChange={value =>
          onChange('addOptions', {
            ...values.addOptions,
            monitor: value as NonNullable<SonarrFormState['addOptions']>['monitor'],
          })}
        options={MONITOR_OPTIONS_WITH_DESCRIPTIONS}
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
        options={SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS}
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

          {includeSearchToggle ? (
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
                labelHelp="Automatically trigger a search for any missing episodes once the series is added."
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
