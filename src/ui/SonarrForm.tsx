// src/ui/SonarrForm.tsx
import React, { useState, useLayoutEffect, useRef, useMemo } from 'react';
import type { SonarrFormState, SonarrQualityProfile, SonarrRootFolder, SonarrTag } from '@/types';
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
} from './Form';
import MultiTagInput from './MultiTagInput';
import { MONITOR_OPTIONS_WITH_DESCRIPTIONS, SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS } from '@/utils/constants';

interface SonarrFormProps {
  options: SonarrFormState;
  data: {
    qualityProfiles: SonarrQualityProfile[];
    rootFolders: SonarrRootFolder[];
    tags: SonarrTag[];
  };
  onChange: <K extends keyof SonarrFormState>(field: K, value: SonarrFormState[K]) => void;
  disabled?: boolean;
  className?: string;
}

const SonarrForm: React.FC<SonarrFormProps> = ({ options, data, onChange, disabled, className }) => {
  const formRef = useRef<HTMLDivElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  const tagMaps = useMemo(() => {
    const idToLabel = new Map<number, string>();
    const labelToId = new Map<string, number>();

    for (const tag of data.tags) {
      if (tag.label) {
        idToLabel.set(tag.id, tag.label);
        labelToId.set(tag.label, tag.id);
      }
    }

    return { idToLabel, labelToId };
  }, [data.tags]);

  const { idToLabel, labelToId } = tagMaps;

  const selectedTagLabels = useMemo(() => {
    return options.tags
      .map(tagId => idToLabel.get(tagId))
      .filter((label): label is string => typeof label === 'string' && label.length > 0);
  }, [options.tags, idToLabel]);

  const handleTagsChange = (labels: string[]) => {
    const tagIds = labels
      .map(label => labelToId.get(label))
      .filter((id): id is number => typeof id === 'number');

    onChange('tags', tagIds);
  };

  // useLayoutEffect runs synchronously after a render but before the screen is updated.
  // This is the ideal place to find a DOM node to prevent any flicker.
  useLayoutEffect(() => {
    if (formRef.current) {
      // Get the root node of the form, which will be the Shadow Root.
      const rootNode = formRef.current.getRootNode();
      // Find our dedicated portal container within that root.
      const host = (rootNode as Document | ShadowRoot).querySelector('#kitsunarr-select-portal-container');
      if (host instanceof HTMLElement) {
        setPortalHost(host);
      }
    }
  }, []); // Run only once after the component mounts.

  return (
    <div ref={formRef} className={`space-y-4 ${className ?? ''}`}>
      {/* Quality Profile */}
      <FormField>
        <FormItem>
          <FormLabel>Quality Profile</FormLabel>
          <FormControl>
            <Select
              disabled={!!disabled}
              value={String(options.qualityProfileId)}
              onValueChange={v => onChange('qualityProfileId', Number(v))}
            >
              <SelectTrigger className="text-text-primary">
                <SelectValue placeholder="Select a profile..." />
              </SelectTrigger>
              <SelectContent container={portalHost}>
                {data.qualityProfiles.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormControl>
        </FormItem>
      </FormField>

      {/* Root Folder */}
      <FormField>
        <FormItem>
          <FormLabel>Root Folder</FormLabel>
          <FormControl>
            <Select
              disabled={!!disabled}
              value={options.rootFolderPath}
              onValueChange={v => onChange('rootFolderPath', v)}
            >
              <SelectTrigger className="text-text-primary">
                <SelectValue placeholder="Select a folder..." />
              </SelectTrigger>
              <SelectContent container={portalHost}>
                {data.rootFolders.map(f => (
                  <SelectItem key={f.id} value={f.path}>
                    {f.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormControl>
        </FormItem>
      </FormField>

      {/* Monitor */}
      <FormField>
        <FormItem>
          <FormLabel>Monitor</FormLabel>
          <FormControl>
            <Select
              disabled={!!disabled}
              value={options.monitorOption}
              onValueChange={v => onChange('monitorOption', v as SonarrFormState['monitorOption'])}
            >
              <SelectTrigger className="w-[250px] text-text-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={portalHost}>
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

      {/* Series Type */}
      <FormField>
        <FormItem>
          <FormLabel>Series Type</FormLabel>
          <FormControl>
            <Select
              disabled={!!disabled}
              value={options.seriesType}
              onValueChange={v => onChange('seriesType', v as SonarrFormState['seriesType'])}
            >
              <SelectTrigger className="text-text-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={portalHost}>
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

      {/* Tags */}
      <FormField>
        <FormItem>
          <FormLabel>Tags</FormLabel>
          <FormControl>
            <MultiTagInput
              value={selectedTagLabels}
              onChange={handleTagsChange}
              placeholder="Add tags..."
              disabled={!!disabled}
              existingTags={data.tags.map(t => t.label)}
            />
          </FormControl>
        </FormItem>
      </FormField>

      {/* Season Folder */}
      <FormField>
        <FormItem>
          <FormLabel>Use Season Folders</FormLabel>
          <FormControl className="flex justify-end">
            <Switch
              disabled={!!disabled}
              checked={options.seasonFolder}
              onCheckedChange={v => onChange('seasonFolder', v)}
            />
          </FormControl>
        </FormItem>
      </FormField>

      {/* Search on Add */}
      <FormField>
        <FormItem>
          <FormLabel>Search on Add</FormLabel>
          <FormControl className="flex justify-end">
            <Switch
              disabled={!!disabled}
              checked={options.searchForMissingEpisodes}
              onCheckedChange={v => onChange('searchForMissingEpisodes', v)}
            />
          </FormControl>
        </FormItem>
      </FormField>
    </div>
  );
};

export default React.memo(SonarrForm);