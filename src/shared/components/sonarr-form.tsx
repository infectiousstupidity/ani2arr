// src/shared/components/sonarr-form.tsx
import React, { useMemo } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type {
  SonarrFormState,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrTag,
} from '@/shared/types';
import {
  FormField,
  FormLabel,
  FormControl,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Switch,
  FormItem,
} from './form';
import MultiTagInput from './multi-tag-input';
import {
  MONITOR_OPTIONS_WITH_DESCRIPTIONS,
  SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS,
} from '@/shared/utils/constants';

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
  } = props;

  const effectiveMetadata: SonarrFormMetadata = metadata;
  const effectiveValues: SonarrFormState = form.watch();

  const setFieldValue = (
    field: keyof SonarrFormState,
    value: SonarrFormState[keyof SonarrFormState],
  ): void => {
    form.setValue(field, value, { shouldDirty: true, shouldValidate: true });
  };

  const tagMaps = useMemo(() => {
    if (!effectiveMetadata) {
      return {
        idToLabel: new Map<number, string>(),
        labelToId: new Map<string, number>(),
      };
    }

    const idToLabel = new Map<number, string>();
    const labelToId = new Map<string, number>();

    for (const tag of effectiveMetadata.tags) {
      if (tag.label) {
        idToLabel.set(tag.id, tag.label);
        labelToId.set(tag.label, tag.id);
      }
    }

    return { idToLabel, labelToId };
  }, [effectiveMetadata]);

  const { idToLabel, labelToId } = tagMaps;

  const selectedTagLabels = useMemo(
    () =>
      effectiveValues.tags
        .map(tagId => idToLabel.get(tagId))
        .filter((label): label is string => typeof label === 'string' && label.length > 0),
    [effectiveValues, idToLabel],
  );

  const selectPortal = portalContainer ?? null;

  const handleTagsChange = (labels: string[]) => {
    const tagIds = labels
      .map(label => labelToId.get(label))
      .filter((id): id is number => typeof id === 'number');

    setFieldValue('tags', tagIds);
  };

  return (
    <div className={className ?? "space-y-4"}>
      {computedPath != null && pathHintTitle ? (
        <div className="mb-4 space-y-3 rounded-xl border border-border-primary bg-bg-tertiary px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-text-primary">Root Folder</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <FormField>
                <FormItem>
                  <FormLabel>Root Folder</FormLabel>
                  <FormControl>
                    <Select
                      disabled={!!disabled}
                      value={effectiveValues.rootFolderPath}
                      onValueChange={v => setFieldValue('rootFolderPath', v)}
                    >
                      <SelectTrigger className="text-text-primary">
                        <SelectValue placeholder="Select a folder..." />
                      </SelectTrigger>
                      <SelectContent container={selectPortal}>
                        {effectiveMetadata.rootFolders.map(f => (
                          <SelectItem key={f.id} value={f.path}>
                            {f.path}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                </FormItem>
              </FormField>
            </div>
            <div className="space-y-2">
              <FormField>
                <FormItem>
                  <FormLabel>Path</FormLabel>
                  <FormControl>
                    <input
                      type="text"
                      readOnly
                      value={computedPath ?? ''}
                      placeholder="Path will be generated automatically"
                      className="w-full rounded-md border border-border-primary bg-bg-secondary px-3 py-2 text-sm text-text-primary"
                    />
                  </FormControl>
                </FormItem>
              </FormField>
              {pathHintTitle && pathHintTvdbId ? (
                <p className="text-xs text-text-secondary">
                  &apos;
                  {pathHintTitle}
                  {' '}
                  [tvdb-
                  {pathHintTvdbId}
                  ]
                  &apos; subfolder will be created automatically.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-4 rounded-xl border border-border-primary bg-bg-tertiary px-4 py-4">
        <h3 className="text-sm font-semibold text-text-primary">Series setup</h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <FormField>
              <FormItem>
                <FormLabel>Quality Profile</FormLabel>
                <FormControl>
                  <Select
                    disabled={!!disabled}
                    value={String(effectiveValues.qualityProfileId)}
                    onValueChange={v => setFieldValue('qualityProfileId', Number(v))}
                  >
                    <SelectTrigger ref={initialFocusRef} className="text-text-primary">
                      <SelectValue placeholder="Select a profile..." />
                    </SelectTrigger>
                    <SelectContent container={selectPortal}>
                      {effectiveMetadata.qualityProfiles.map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            </FormField>

            <FormField>
              <FormItem>
                <FormLabel>Monitor</FormLabel>
                <FormControl>
                  <Select
                    disabled={!!disabled}
                    value={effectiveValues.monitorOption}
                    onValueChange={v =>
                      setFieldValue('monitorOption', v as SonarrFormState['monitorOption'])
                    }
                  >
                    <SelectTrigger className="w-[250px] text-text-primary">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent container={selectPortal}>
                      {MONITOR_OPTIONS_WITH_DESCRIPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            </FormField>
          </div>

          <div className="space-y-4">
            <FormField>
              <FormItem>
                <FormLabel>Series Type</FormLabel>
                <FormControl>
                  <Select
                    disabled={!!disabled}
                    value={effectiveValues.seriesType}
                    onValueChange={v =>
                      setFieldValue('seriesType', v as SonarrFormState['seriesType'])
                    }
                  >
                    <SelectTrigger className="text-text-primary">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent container={selectPortal}>
                      {SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            </FormField>

            <FormField>
              <FormItem>
                <FormLabel>Use Season Folders</FormLabel>
                <FormControl className="flex justify-end">
                  <Switch
                    disabled={!!disabled}
                    checked={effectiveValues.seasonFolder}
                    onCheckedChange={v => setFieldValue('seasonFolder', v)}
                  />
                </FormControl>
              </FormItem>
            </FormField>
          </div>
        </div>

        <FormField>
          <FormItem>
            <FormLabel>Tags</FormLabel>
            <FormControl>
              <MultiTagInput
                value={selectedTagLabels}
                onChange={handleTagsChange}
                placeholder="Add tags..."
                disabled={!!disabled}
                existingTags={effectiveMetadata.tags.map(t => t.label)}
              />
            </FormControl>
          </FormItem>
        </FormField>

        <FormField>
          <FormItem>
            <FormLabel>Search on Add</FormLabel>
            <FormControl className="flex justify-end">
              <Switch
                disabled={!!disabled}
                checked={effectiveValues.searchForMissingEpisodes}
                onCheckedChange={v => setFieldValue('searchForMissingEpisodes', v)}
              />
            </FormControl>
          </FormItem>
        </FormField>
      </div>
    </div>
  );
}

export default SonarrForm;
