import React, { useMemo } from 'react';
import type { FieldPath, FieldPathValue, UseFormReturn } from 'react-hook-form';
import type {
  RadarrFormState,
  RadarrMinimumAvailability,
  RadarrQualityProfile,
  RadarrRootFolder,
  RadarrTag,
} from '@/shared/types';
import { SelectField, SwitchField } from '@/shared/ui/form/form';
import { cn } from '@/shared/utils/cn';
import { RootFolderField } from '@/shared/ui/sonarr-form/components/root-folder-field';
import { TagsField } from '@/shared/ui/sonarr-form/components/tags-field';

export type RadarrFormLayout = 'stacked' | 'grid';

export interface RadarrFormMetadata {
  qualityProfiles: RadarrQualityProfile[];
  rootFolders: RadarrRootFolder[];
  tags: RadarrTag[];
}

export interface RadarrFormProps {
  form: UseFormReturn<RadarrFormState>;
  metadata: RadarrFormMetadata;
  disabled?: boolean;
  className?: string;
  portalContainer?: HTMLElement | ShadowRoot | null;
  initialFocusRef?: React.RefObject<HTMLButtonElement | null>;
  computedPath?: string | null;
  folderSlug?: string | null;
  displayRootWithSlug?: boolean;
  layout?: RadarrFormLayout;
}

const MINIMUM_AVAILABILITY_OPTIONS: Array<{
  value: RadarrMinimumAvailability;
  label: string;
  description: string;
}> = [
  { value: 'announced', label: 'Announced', description: 'Allow adds before a theatrical or digital date exists.' },
  { value: 'inCinemas', label: 'In Cinemas', description: 'Wait until the movie has a theatrical release.' },
  { value: 'released', label: 'Released', description: 'Wait until the movie is officially released.' },
  { value: 'preDB', label: 'PreDB', description: 'Allow pre-release availability.' },
];

const DEFAULT_CONTAINER_CLASS_NAME = 'grid gap-4';

function RadarrForm(props: RadarrFormProps): React.JSX.Element {
  const {
    form,
    metadata,
    disabled,
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
  const layoutClassName = isGridLayout ? 'grid gap-4 md:grid-cols-2' : 'flex flex-col gap-4';
  const effectiveValues: RadarrFormState = form.watch();

  const setFieldValue = <K extends FieldPath<RadarrFormState>>(
    field: K,
    value: FieldPathValue<RadarrFormState, K>,
  ): void => {
    form.setValue(field, value, { shouldDirty: true, shouldValidate: true });
  };

  const qualityProfileOptions = useMemo(
    () =>
      metadata.qualityProfiles.map(profile => ({
        value: String(profile.id),
        label: profile.name,
      })),
    [metadata.qualityProfiles],
  );

  const tagMaps = useMemo(() => {
    const idToLabel = new Map<number, string>();
    const labelToId = new Map<string, number>();

    for (const tag of metadata.tags) {
      const label = tag.label?.trim();
      if (!label) continue;
      idToLabel.set(tag.id, label);
      labelToId.set(label, tag.id);
    }

    return { idToLabel, labelToId };
  }, [metadata.tags]);

  const allSelectedTagLabels = useMemo(() => {
    const existing = effectiveValues.tags
      .map(tagId => tagMaps.idToLabel.get(tagId))
      .filter((label): label is string => typeof label === 'string' && label.length > 0);
    const freeform = effectiveValues.freeformTags.filter(
      (label): label is string => typeof label === 'string' && label.trim().length > 0,
    );
    return Array.from(new Set([...existing, ...freeform]));
  }, [effectiveValues.freeformTags, effectiveValues.tags, tagMaps.idToLabel]);

  const existingTagLabels = useMemo(
    () =>
      metadata.tags
        .map(tag => tag.label?.trim())
        .filter((label): label is string => typeof label === 'string' && label.length > 0),
    [metadata.tags],
  );

  const handleTagsChange = (labels: string[]) => {
    const uniqueLabels = Array.from(new Set(labels.filter(label => label.trim().length > 0)));
    const tagIds: number[] = [];
    const freeformTags: string[] = [];

    for (const label of uniqueLabels) {
      const existingId = tagMaps.labelToId.get(label);
      if (typeof existingId === 'number') {
        tagIds.push(existingId);
      } else {
        freeformTags.push(label);
      }
    }

    setFieldValue('tags', tagIds);
    setFieldValue('freeformTags', freeformTags);
  };

  const containerClassName = cn(DEFAULT_CONTAINER_CLASS_NAME, layoutClassName, className);
  const selectPortal = portalContainer ?? null;

  return (
    <div className={containerClassName}>
      <RootFolderField
        disabled={Boolean(disabled)}
        value={effectiveValues.rootFolderPath}
        rootFolders={metadata.rootFolders}
        onChange={value => setFieldValue('rootFolderPath', value)}
        portalContainer={selectPortal}
        initialFocusRef={initialFocusRef}
        fullWidthClass={fullWidthClass}
        computedSlug={folderSlug ?? null}
        displayRootWithSlug={displayRootWithSlug}
        computedPath={computedPath}
      />

      <SelectField
        label="Quality Profile"
        disabled={Boolean(disabled)}
        value={String(effectiveValues.qualityProfileId)}
        onChange={value => setFieldValue('qualityProfileId', Number(value))}
        options={qualityProfileOptions}
        placeholder="Select a profile..."
        container={selectPortal}
      />

      <SelectField
        label="Minimum Availability"
        disabled={Boolean(disabled)}
        value={effectiveValues.minimumAvailability}
        onChange={value => setFieldValue('minimumAvailability', value as RadarrMinimumAvailability)}
        options={MINIMUM_AVAILABILITY_OPTIONS}
        container={selectPortal}
      />

      <TagsField
        disabled={Boolean(disabled)}
        value={allSelectedTagLabels}
        onChange={handleTagsChange}
        existingTags={existingTagLabels}
      />

      <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', fullWidthClass)}>
        <SwitchField
          label="Monitored"
          disabled={Boolean(disabled)}
          checked={effectiveValues.monitored}
          onCheckedChange={value => setFieldValue('monitored', value)}
          description="Keep the movie eligible for future upgrades."
        />
        <SwitchField
          label="Search on Add"
          disabled={Boolean(disabled)}
          checked={effectiveValues.searchForMovie}
          onCheckedChange={value => setFieldValue('searchForMovie', value)}
          description="Trigger a Radarr search after add."
        />
      </div>
    </div>
  );
}

export default RadarrForm;
