/** Options-page provider tag pill field for saved default add options. */
// src/options-page/components/provider-tag-field.tsx

import { useCallback, useMemo } from "react";
import type { ProviderTag, ProviderTagId } from "@/providers";
import MultiTagInput from "@/shared/ui/form/multi-tag-input";
import {
  buildProviderTagMaps,
  deriveSelectedProviderTagLabels,
  type ProviderTagSelection,
  splitProviderTagLabels,
} from "./provider-tag-selection";

interface ProviderTagFieldProps {
  availableTags: ReadonlyArray<ProviderTag>;
  selectedTagIds?: ReadonlyArray<ProviderTagId> | undefined;
  selectedFreeformTags?: ReadonlyArray<string> | undefined;
  disabled?: boolean | undefined;
  id?: string | undefined;
  placeholder?: string | undefined;
  onChange: (selection: ProviderTagSelection) => void;
}

export function ProviderTagField({
  availableTags,
  disabled = false,
  id,
  placeholder = "Add tags...",
  selectedFreeformTags,
  selectedTagIds,
  onChange,
}: ProviderTagFieldProps) {
  const tagMaps = useMemo(
    () => buildProviderTagMaps(availableTags),
    [availableTags],
  );

  const selectedLabels = useMemo(
    () =>
      deriveSelectedProviderTagLabels(
        selectedTagIds,
        selectedFreeformTags,
        tagMaps.idToLabel,
      ),
    [selectedFreeformTags, selectedTagIds, tagMaps.idToLabel],
  );

  const handleChange = useCallback(
    (labels: string[]) => {
      onChange(splitProviderTagLabels(labels, tagMaps.lookupKeyToId));
    },
    [onChange, tagMaps.lookupKeyToId],
  );

  const inputId = id ? { id } : {};

  return (
    <MultiTagInput
      {...inputId}
      value={selectedLabels}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      existingTags={tagMaps.existingLabels}
    />
  );
}
