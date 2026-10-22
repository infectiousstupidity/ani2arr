/** Radarr edit fields for existing-movie media modal setup flows. */
// src/features/media-modal/radarr/radarr-edit-options-fields.tsx

import React from 'react';
import * as v from 'valibot';

import { ProviderQualityProfileIdSchema } from "@/providers/schemas";
import type { ProviderFormResources } from "@/providers/types";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type { RadarrMinimumAvailability } from "@/providers/radarr/schemas";
import { SelectField } from '@/shared/ui/fields/select-field';
import { SwitchField } from '@/shared/ui/fields/switch-field';
import { ProviderTagField } from '@/features/provider-ui/provider-tag-field';
import { cn } from '@/shared/utils/cn';

import { ProviderRootFolderSelect, type ProviderRootFolderPathPreview } from '../setup/provider-root-folder-select';
import { RADARR_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS } from '@/providers/radarr/form-options';

export interface RadarrEditOptionsFieldsProps {
  values: RadarrFormState;
  formResources: ProviderFormResources;
  onChange: <K extends keyof RadarrFormState>(field: K, value: RadarrFormState[K]) => void;
  disabled?: boolean | undefined;
  className?: string | undefined;
  portalContainer?: HTMLElement | ShadowRoot | null | undefined;
  pathPreview?: ProviderRootFolderPathPreview | undefined;
}

export function RadarrEditOptionsFields(
  props: RadarrEditOptionsFieldsProps,
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

  const qualityProfileOptions = formResources.qualityProfiles.map(profile => ({
    value: String(profile.id),
    label: profile.name,
  }));

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <ProviderRootFolderSelect
        disabled={disabled}
        value={values.rootFolderPath ?? ''}
        rootFolders={formResources.rootFolders}
        onChange={value => onChange('rootFolderPath', value)}
        portalContainer={portalContainer ?? null}
        pathPreview={pathPreview}
      />

      <SelectField
        label="Quality Profile"
        disabled={disabled}
        value={values.qualityProfileId === undefined ? '' : String(values.qualityProfileId)}
        onChange={value => {
          const num = Number(value);
          onChange('qualityProfileId', !value || Number.isNaN(num) ? undefined : v.parse(ProviderQualityProfileIdSchema, num));
        }}
        options={qualityProfileOptions}
        placeholder="Select a profile..."
        container={portalContainer ?? null}
      />

      <SelectField
        label="Minimum Availability"
        disabled={disabled}
        value={values.minimumAvailability ?? ''}
        onChange={value => onChange('minimumAvailability', value as RadarrMinimumAvailability)}
        options={RADARR_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS}
        container={portalContainer ?? null}
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
