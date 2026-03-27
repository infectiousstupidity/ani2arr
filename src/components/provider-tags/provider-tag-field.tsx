/** Reusable field that adapts provider tag ids and freeform tags into the shared tag input. */
// src/components/provider-tags/provider-tag-field.tsx

import React, { useCallback, useMemo } from 'react';

import type { ProviderTag } from '@/shared/types/provider-tags';
import { FormField, Label } from '@/shared/ui/form/form';
import MultiTagInput from '@/shared/ui/form/multi-tag-input';

import {
  buildProviderTagMaps,
  deriveSelectedProviderTagLabels,
  splitProviderTagLabels,
} from './provider-tag-selection';

interface ProviderTagFieldProps {
  availableTags: ReadonlyArray<ProviderTag>;
  selectedTagIds?: ReadonlyArray<number> | undefined;
  selectedFreeformTags?: ReadonlyArray<string> | undefined;
  disabled?: boolean | undefined;
  label?: string | undefined;
  placeholder?: string | undefined;
  onTagIdsChange: (tagIds: number[]) => void;
  onFreeformTagsChange: (freeformTags: string[]) => void;
}

export function ProviderTagField(props: ProviderTagFieldProps): React.JSX.Element {
  const {
    availableTags,
    selectedTagIds,
    selectedFreeformTags,
    disabled = false,
    label = 'Tags',
    placeholder = 'Add tags...',
    onTagIdsChange,
    onFreeformTagsChange,
  } = props;

  const tagMaps = useMemo(() => buildProviderTagMaps(availableTags), [availableTags]);

  const selectedLabels = useMemo(
    () => deriveSelectedProviderTagLabels(selectedTagIds, selectedFreeformTags, tagMaps.idToLabel),
    [selectedFreeformTags, selectedTagIds, tagMaps.idToLabel],
  );

  const existingTags = useMemo(() => Array.from(tagMaps.labelToId.keys()), [tagMaps.labelToId]);

  const handleChange = useCallback(
    (labels: string[]) => {
      const { tagIds, freeformTags } = splitProviderTagLabels(labels, tagMaps.labelToId);
      onTagIdsChange(tagIds);
      onFreeformTagsChange(freeformTags);
    },
    [onFreeformTagsChange, onTagIdsChange, tagMaps.labelToId],
  );

  return (
    <FormField>
      <div className="space-y-3">
        <Label>{label}</Label>
        <MultiTagInput
          value={selectedLabels}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          existingTags={existingTags}
        />
      </div>
    </FormField>
  );
}
