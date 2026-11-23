/** Sonarr edit fields for existing-series media modal setup flows. */
// src/features/media-modal/sonarr/sonarr-edit-options-fields.tsx

import React from "react";
import * as v from "valibot";

import { ProviderQualityProfileIdSchema } from "@/providers/schemas";
import type { ProviderFormResources } from "@/providers/types";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { SonarrEditMonitoringAction } from "@/providers/sonarr/schemas";
import {
	SONARR_EDIT_MONITORING_ACTION_OPTIONS_WITH_DESCRIPTIONS,
	SONARR_MONITOR_NEW_ITEMS_OPTIONS_WITH_DESCRIPTIONS,
	SONARR_SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS,
} from "@/providers/sonarr/form-options";
import { SelectField } from "@/shared/ui/fields/select-field";
import { SwitchField } from "@/shared/ui/fields/switch-field";
import { ProviderTagField } from "@/features/provider-ui/provider-tag-field";
import { cn } from "@/shared/utils/cn";

import {
	ProviderRootFolderSelect,
	type ProviderRootFolderPathPreview,
} from "../setup/provider-root-folder-select";

export interface SonarrEditOptionsFieldsProps {
	values: SonarrFormState;
	monitoringAction: SonarrEditMonitoringAction;
	formResources: ProviderFormResources;
	onChange: <K extends keyof SonarrFormState>(
		field: K,
		value: SonarrFormState[K],
	) => void;
	onMonitoringActionChange: (value: SonarrEditMonitoringAction) => void;
	disabled?: boolean | undefined;
	className?: string | undefined;
	portalContainer?: HTMLElement | ShadowRoot | null | undefined;
	pathPreview?: ProviderRootFolderPathPreview | undefined;
}

export function SonarrEditOptionsFields(
	props: SonarrEditOptionsFieldsProps,
): React.JSX.Element {
	const {
		values,
		monitoringAction,
		formResources,
		onChange,
		onMonitoringActionChange,
		disabled = false,
		className,
		portalContainer,
		pathPreview,
	} = props;

	const qualityProfileOptions = formResources.qualityProfiles.map((profile) => ({
		value: String(profile.id),
		label: profile.name,
	}));

	return (
		<div className={cn("flex flex-col gap-4", className)}>
			<ProviderRootFolderSelect
				disabled={disabled}
				value={values.rootFolderPath ?? ""}
				rootFolders={formResources.rootFolders}
				onChange={(value) => onChange("rootFolderPath", value)}
				portalContainer={portalContainer ?? null}
				pathPreview={pathPreview}
			/>

			<SelectField
				label="Quality Profile"
				disabled={disabled}
				value={
					values.qualityProfileId === undefined
						? ""
						: String(values.qualityProfileId)
				}
				onChange={(value) => {
					const num = Number(value);
					onChange(
						"qualityProfileId",
						!value || Number.isNaN(num)
							? undefined
							: v.parse(ProviderQualityProfileIdSchema, num),
					);
				}}
				options={qualityProfileOptions}
				placeholder="Select a profile..."
				container={portalContainer ?? null}
			/>

			<SelectField
				label="Series Type"
				disabled={disabled}
				value={values.seriesType ?? ""}
				onChange={(value) =>
					onChange("seriesType", value as SonarrFormState["seriesType"])
				}
				options={SONARR_SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS}
				container={portalContainer ?? null}
			/>

			<SelectField
				label="Monitor New Seasons"
				disabled={disabled}
				value={values.monitorNewItems ?? ""}
				onChange={(value) =>
					onChange(
						"monitorNewItems",
						value as SonarrFormState["monitorNewItems"],
					)
				}
				options={SONARR_MONITOR_NEW_ITEMS_OPTIONS_WITH_DESCRIPTIONS}
				container={portalContainer ?? null}
			/>

			<SelectField
				label="Monitor Episodes"
				disabled={disabled}
				value={monitoringAction}
				onChange={(value) =>
					onMonitoringActionChange(value as SonarrEditMonitoringAction)
				}
				options={SONARR_EDIT_MONITORING_ACTION_OPTIONS_WITH_DESCRIPTIONS}
				description="Applies a one-time Sonarr episode monitoring action. This does not reflect the current saved state."
				container={portalContainer ?? null}
			/>

			<ProviderTagField
				availableTags={formResources.tags}
				disabled={disabled}
				selectedTagIds={values.tags ?? []}
				selectedFreeformTags={values.freeformTags}
				label="Tags"
				onChange={({ tagIds, freeformTags }) => {
					onChange("tags", tagIds);
					onChange("freeformTags", freeformTags);
				}}
			/>

			<div className="pt-1">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<SwitchField
						label="Monitored"
						disabled={disabled}
						checked={values.monitored ?? false}
						onCheckedChange={(checked) => onChange("monitored", checked)}
						labelHelp="Keep the whole series monitored in Sonarr."
						labelHelpContainer={portalContainer ?? null}
						layout="inline"
						labelClassName="text-sm font-medium text-text-primary"
					/>

					<SwitchField
						label="Season Folders"
						disabled={disabled}
						checked={values.seasonFolder ?? false}
						onCheckedChange={(checked) => onChange("seasonFolder", checked)}
						labelHelp="Organize episodes into per-season subfolders created automatically."
						labelHelpDelay={600}
						labelHelpContainer={portalContainer ?? null}
						layout="inline"
						labelClassName="text-sm font-medium text-text-primary"
					/>
				</div>
			</div>
		</div>
	);
}
