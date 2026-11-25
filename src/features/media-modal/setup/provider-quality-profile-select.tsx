/** Provider quality-profile select for media modal setup flows. */

import React from "react";
import * as v from "valibot";

import {
	ProviderQualityProfileIdSchema,
	type ProviderQualityProfileId,
} from "@/providers/schemas";
import type { ProviderFormResources } from "@/providers/types";
import { SelectField } from "@/shared/ui/fields/select-field";

export function ProviderQualityProfileSelect(props: {
	value: ProviderQualityProfileId | undefined;
	qualityProfiles: ProviderFormResources["qualityProfiles"];
	onChange: (value: ProviderQualityProfileId | undefined) => void;
	disabled: boolean;
	portalContainer?: HTMLElement | ShadowRoot | null | undefined;
}): React.JSX.Element {
	const { value, qualityProfiles, onChange, disabled, portalContainer } = props;

	return (
		<SelectField
			label="Quality Profile"
			disabled={disabled}
			value={value === undefined ? "" : String(value)}
			onChange={(nextValue) => {
				const num = Number(nextValue);
				onChange(
					!nextValue || Number.isNaN(num)
						? undefined
						: v.parse(ProviderQualityProfileIdSchema, num),
				);
			}}
			options={qualityProfiles.map((profile) => ({
				value: String(profile.id),
				label: profile.name,
			}))}
			placeholder="Select a profile..."
			container={portalContainer ?? null}
		/>
	);
}
