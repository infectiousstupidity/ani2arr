import { useCallback, useMemo } from 'react';
import type { SonarrFormState, SonarrTag } from '@/shared/types';

type UseSonarrTagSelectionInput = {
  availableTags: SonarrTag[];
  selectedTagIds: SonarrFormState['tags'] | undefined;
  selectedFreeformTags: SonarrFormState['freeformTags'] | undefined;
  setTagIds: (ids: number[]) => void;
  setFreeformTags: (labels: string[]) => void;
};

export const useSonarrTagSelection = (input: UseSonarrTagSelectionInput) => {
  const { availableTags, selectedTagIds, selectedFreeformTags, setTagIds, setFreeformTags } = input;

  const tagMaps = useMemo(() => {
    const idToLabel = new Map<number, string>();
    const labelToId = new Map<string, number>();

    for (const tag of availableTags) {
      if (tag.label && tag.label.trim().length > 0) {
        const trimmed = tag.label.trim();
        idToLabel.set(tag.id, trimmed);
        labelToId.set(trimmed, tag.id);
      }
    }

    return { idToLabel, labelToId };
  }, [availableTags]);

  const selectedExistingTagLabels = useMemo(
    () =>
      (selectedTagIds ?? [])
        .map(tagId => tagMaps.idToLabel.get(tagId))
        .filter((label): label is string => typeof label === 'string' && label.length > 0),
    [selectedTagIds, tagMaps.idToLabel],
  );

  const freeformTagLabels = useMemo(
    () =>
      (selectedFreeformTags ?? []).filter(
        (label): label is string => typeof label === 'string' && label.trim().length > 0,
      ),
    [selectedFreeformTags],
  );

  const allSelectedTagLabels = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const label of [...selectedExistingTagLabels, ...freeformTagLabels]) {
      if (!seen.has(label)) {
        seen.add(label);
        result.push(label);
      }
    }

    return result;
  }, [selectedExistingTagLabels, freeformTagLabels]);

  const existingTagLabels = useMemo(
    () =>
      availableTags
        .map(t => t.label)
        .filter((label): label is string => typeof label === 'string' && label.trim().length > 0),
    [availableTags],
  );

  const handleTagsChange = useCallback(
    (labels: string[]) => {
      const uniqueLabels: string[] = [];
      const seen = new Set<string>();

      for (const label of labels) {
        if (!label) continue;
        if (seen.has(label)) continue;
        seen.add(label);
        uniqueLabels.push(label);
      }

      const tagIds: number[] = [];
      const freeform: string[] = [];

      for (const label of uniqueLabels) {
        const id = tagMaps.labelToId.get(label);
        if (typeof id === 'number') {
          tagIds.push(id);
        } else {
          freeform.push(label);
        }
      }

      setTagIds(tagIds);
      setFreeformTags(freeform);
    },
    [setFreeformTags, setTagIds, tagMaps.labelToId],
  );

  return {
    allSelectedTagLabels,
    existingTagLabels,
    handleTagsChange,
  };
};

