/** Shared provider tag pill field for existing and freeform provider tags. */
// src/shared/ui/provider-tag-field.tsx

import { useCallback, useId, useMemo } from "react";
import type { ProviderTag, ProviderTagId } from "@/providers";
import {
	buildProviderTagMaps,
	deriveSelectedProviderTagLabels,
	type ProviderTagSelection,
	splitProviderTagLabels,
} from "@/providers/provider-tag-selection";
import { Label } from "@/shared/ui/form/label";
import MultiTagInput from "@/shared/ui/form/multi-tag-input";

interface ProviderTagFieldProps {
	availableTags: ReadonlyArray<ProviderTag>;
	selectedTagIds?: ReadonlyArray<ProviderTagId> | undefined;
	selectedFreeformTags?: ReadonlyArray<string> | undefined;
	disabled?: boolean | undefined;
	id?: string | undefined;
	label?: string | undefined;
	placeholder?: string | undefined;
	onChange: (selection: ProviderTagSelection) => void;
}

export function ProviderTagField({
	availableTags,
	disabled = false,
	id,
	label,
	placeholder = "Add tags...",
	selectedFreeformTags,
	selectedTagIds,
	onChange,
}: ProviderTagFieldProps) {
	const generatedId = useId();
	const inputId = id ?? (label ? generatedId : undefined);
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

	const input = (
		<MultiTagInput
			{...(inputId === undefined ? {} : { id: inputId })}
			value={selectedLabels}
			onChange={handleChange}
			placeholder={placeholder}
			disabled={disabled}
			existingTags={tagMaps.existingLabels}
		/>
	);

	if (!label) return input;

	return (
		<div className="space-y-3">
			<Label htmlFor={inputId}>{label}</Label>
			{input}
		</div>
	);
}
