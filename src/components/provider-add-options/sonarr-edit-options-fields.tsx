/** Reusable Sonarr edit fields for existing-series flows. */
// src/components/provider-add-options/sonarr-edit-options-fields.tsx

import React from "react";

import { ProviderTagField } from "@/components/provider-tags/provider-tag-field";
import {
	parseProviderQualityProfileId,
	type ProviderMetadata,
} from "@/providers";
import {
	EDIT_MONITOR_ACTION_OPTIONS_WITH_DESCRIPTIONS,
	MONITOR_NEW_ITEMS_OPTIONS_WITH_DESCRIPTIONS,
	SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS,
	type SonarrEditMonitoringAction,
	type SonarrFormState,
} from "@/providers/settings/provider-settings.schema";
import { SelectField, SwitchField } from "@/shared/ui/form/form";
import { cn } from "@/shared/utils/cn";

import {
	ProviderRootFolderSelect,
	type ProviderRootFolderPathPreview,
} from "./provider-root-folder-select";

export interface SonarrEditOptionsFieldsProps {
	values: SonarrFormState;
	monitoringAction: SonarrEditMonitoringAction;
	metadata: ProviderMetadata;
	onChange: <K extends keyof SonarrFormState>(
		field: K,
		value: SonarrFormState[K],
	) => void;
	onMonitoringActionChange: (value: SonarrEditMonitoringAction) => void;
	disabled?: boolean | undefined;
	className?: string | undefined;
	portalContainer?: HTMLElement | ShadowRoot | null | undefined;
	initialFocusRef?: React.RefObject<HTMLButtonElement | null> | undefined;
	pathPreview?: ProviderRootFolderPathPreview | undefined;
	layout?: "stacked" | "grid" | undefined;
}

export function SonarrEditOptionsFields(
	props: SonarrEditOptionsFieldsProps,
): React.JSX.Element {
	const {
		values,
		monitoringAction,
		metadata,
		onChange,
		onMonitoringActionChange,
		disabled = false,
		className,
		portalContainer,
		initialFocusRef,
		pathPreview,
		layout = "stacked",
	} = props;

	const isGridLayout = layout === "grid";
	const fullWidthClass = isGridLayout ? "md:col-span-2" : undefined;
	const layoutClassName = isGridLayout
		? "grid gap-4 md:grid-cols-2"
		: "flex flex-col gap-4";
	const modalSelectTriggerClassName =
		"border border-border-primary/60 bg-bg-tertiary text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]";
	const qualityProfileOptions = metadata.qualityProfiles.map((profile) => ({
		value: String(profile.id),
		label: profile.name,
	}));

	return (
		<div className={cn(layoutClassName, className)}>
			<ProviderRootFolderSelect
				disabled={disabled}
				value={values.rootFolderPath ?? ""}
				rootFolders={metadata.rootFolders}
				onChange={(value) => onChange("rootFolderPath", value)}
				portalContainer={portalContainer ?? null}
				initialFocusRef={initialFocusRef}
				className={fullWidthClass}
				triggerClassName={modalSelectTriggerClassName}
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
							: parseProviderQualityProfileId(num),
					);
				}}
				options={qualityProfileOptions}
				placeholder="Select a profile..."
				container={portalContainer ?? null}
				triggerClassName={modalSelectTriggerClassName}
			/>

			<SelectField
				label="Series Type"
				disabled={disabled}
				value={values.seriesType ?? ""}
				onChange={(value) =>
					onChange("seriesType", value as SonarrFormState["seriesType"])
				}
				options={SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS}
				container={portalContainer ?? null}
				triggerClassName={modalSelectTriggerClassName}
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
				options={MONITOR_NEW_ITEMS_OPTIONS_WITH_DESCRIPTIONS}
				container={portalContainer ?? null}
				triggerClassName={modalSelectTriggerClassName}
			/>

			<SelectField
				label="Monitor Episodes"
				disabled={disabled}
				value={monitoringAction}
				onChange={(value) =>
					onMonitoringActionChange(value as SonarrEditMonitoringAction)
				}
				options={EDIT_MONITOR_ACTION_OPTIONS_WITH_DESCRIPTIONS}
				description="Applies a one-time Sonarr episode monitoring action. This does not reflect the current saved state."
				container={portalContainer ?? null}
				triggerClassName={modalSelectTriggerClassName}
			/>

			<ProviderTagField
				availableTags={metadata.tags}
				disabled={disabled}
				selectedTagIds={values.tags ?? []}
				selectedFreeformTags={values.freeformTags}
				onTagIdsChange={(tagIds) => onChange("tags", tagIds)}
				onFreeformTagsChange={(freeformTags) =>
					onChange("freeformTags", freeformTags)
				}
			/>

			<div className={cn("pt-1", fullWidthClass)}>
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
