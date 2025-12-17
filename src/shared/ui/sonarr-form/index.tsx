import React, { useMemo } from 'react';
import type { FieldPath, FieldPathValue, UseFormReturn } from 'react-hook-form';
import type { SonarrFormState, SonarrQualityProfile, SonarrRootFolder, SonarrTag } from '@/shared/types';
import { SelectField } from '@/shared/ui/form/form';
import { cn } from '@/shared/utils/cn';
import { MONITOR_OPTIONS_WITH_DESCRIPTIONS, SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS } from '@/shared/utils/constants';
import { DEFAULT_CONTAINER_CLASS_NAME, buildFolderSlug } from './helpers';
import { RootFolderField } from './components/root-folder-field';
import { TagsField } from './components/tags-field';
import { TogglesGrid } from './components/toggles-grid';
import { useSonarrTagSelection } from './use-tag-maps';

export type SonarrFormLayout = 'stacked' | 'grid';

export interface SonarrFormMetadata {
  qualityProfiles: SonarrQualityProfile[];
  rootFolders: SonarrRootFolder[];
  tags: SonarrTag[];
}

export interface SonarrFormProps {
  form: UseFormReturn<SonarrFormState>;
  metadata: SonarrFormMetadata;
  disabled?: boolean;
  className?: string;
  portalContainer?: HTMLElement | ShadowRoot | null;
  initialFocusRef?: React.RefObject<HTMLButtonElement | null>;

  computedPath?: string | null;
  pathHintTitle?: string;
  pathHintTvdbId?: number | null;
  includeSearchToggle?: boolean;
  displayRootWithSlug?: boolean;
  folderSlug?: string | null;
  layout?: SonarrFormLayout;
}

function SonarrForm(props: SonarrFormProps): React.JSX.Element | null {
  const {
    form,
    metadata,
    disabled,
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
  const layoutClassName = isGridLayout ? 'grid gap-4 md:grid-cols-2' : 'flex flex-col gap-4';

  const effectiveValues: SonarrFormState = form.watch();

  const setFieldValue = <K extends FieldPath<SonarrFormState>>(
    field: K,
    value: FieldPathValue<SonarrFormState, K>,
  ): void => {
    form.setValue(field, value, { shouldDirty: true, shouldValidate: true });
  };

  const computedSlug = useMemo(
    () => buildFolderSlug(folderSlug, pathHintTitle, pathHintTvdbId),
    [folderSlug, pathHintTitle, pathHintTvdbId],
  );

  const { allSelectedTagLabels, existingTagLabels, handleTagsChange } = useSonarrTagSelection({
    availableTags: metadata.tags,
    selectedTagIds: effectiveValues.tags,
    selectedFreeformTags: effectiveValues.freeformTags,
    setTagIds: ids => setFieldValue('tags', ids),
    setFreeformTags: labels => setFieldValue('freeformTags', labels),
  });

  const qualityProfileOptions = useMemo(() => {
    return metadata.qualityProfiles.map((profile) => ({
      value: String(profile.id),
      label: profile.name,
    }));
  }, [metadata.qualityProfiles]);

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
        computedSlug={computedSlug}
        displayRootWithSlug={displayRootWithSlug}
        computedPath={computedPath}
      />

      <SelectField
        label="Monitor"
        disabled={Boolean(disabled)}
        value={effectiveValues.monitorOption}
        onChange={value => setFieldValue('monitorOption', value as SonarrFormState['monitorOption'])}
        options={MONITOR_OPTIONS_WITH_DESCRIPTIONS}
        container={selectPortal}
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
        label="Series Type"
        disabled={Boolean(disabled)}
        value={effectiveValues.seriesType}
        onChange={value => setFieldValue('seriesType', value as SonarrFormState['seriesType'])}
        options={SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS}
        container={selectPortal}
      />

      <TagsField
        disabled={Boolean(disabled)}
        value={allSelectedTagLabels}
        onChange={handleTagsChange}
        existingTags={existingTagLabels}
      />

      <TogglesGrid
        disabled={Boolean(disabled)}
        values={{
          seasonFolder: effectiveValues.seasonFolder,
          searchForMissingEpisodes: effectiveValues.searchForMissingEpisodes,
          searchForCutoffUnmet: effectiveValues.searchForCutoffUnmet,
        }}
        onChange={setFieldValue}
        includeSearchToggle={includeSearchToggle}
        portalContainer={selectPortal}
        fullWidthClass={fullWidthClass}
      />
    </div>
  );
}

export default SonarrForm;
