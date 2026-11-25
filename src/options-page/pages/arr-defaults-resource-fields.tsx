import * as v from "valibot";
import { ProviderQualityProfileIdSchema } from "@/providers/schemas";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { ProviderFormResources } from "@/providers/types";
import { SelectControl } from "@/shared/ui/primitives/select";
import { SettingsRow } from "../components/settings-section";

export const ArrDefaultsResourceFields = ({
	provider,
	formResources,
	resourceFieldsDisabled,
	values,
	onRootFolderChange,
	onQualityProfileChange,
}: {
	provider: "sonarr" | "radarr";
	formResources: ProviderFormResources | undefined;
	resourceFieldsDisabled: boolean;
	values: Pick<SonarrFormState, "rootFolderPath" | "qualityProfileId">;
	onRootFolderChange: (value: string) => void;
	onQualityProfileChange: (value: SonarrFormState["qualityProfileId"]) => void;
}) => {
	const rootFolderOptions =
		formResources?.rootFolders.map((rootFolder) => ({
			label: rootFolder.path,
			value: rootFolder.path,
		})) ?? [];

	const qualityProfileOptions =
		formResources?.qualityProfiles.map((qualityProfile) => ({
			label: qualityProfile.name,
			value: String(qualityProfile.id),
		})) ?? [];

	return (
		<>
			<SettingsRow id={`${provider}-root-folder`} label="Root folder">
				<SelectControl
					id={`${provider}-root-folder`}
					value={values.rootFolderPath ?? ""}
					onValueChange={(value) => onRootFolderChange(value)}
					options={rootFolderOptions}
					placeholder="Select root folder"
					disabled={resourceFieldsDisabled}
				/>
			</SettingsRow>

			<SettingsRow id={`${provider}-quality-profile`} label="Quality profile">
				<SelectControl
					id={`${provider}-quality-profile`}
					value={
						values.qualityProfileId === undefined
							? ""
							: String(values.qualityProfileId)
					}
					onValueChange={(value) => {
						const qualityProfileId = Number(value);
						onQualityProfileChange(
							!value || Number.isNaN(qualityProfileId)
								? undefined
								: v.parse(ProviderQualityProfileIdSchema, qualityProfileId),
						);
					}}
					options={qualityProfileOptions}
					placeholder="Select quality profile"
					disabled={resourceFieldsDisabled}
				/>
			</SettingsRow>
		</>
	);
};
