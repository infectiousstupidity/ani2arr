/** Sonarr provider default add-options form section for the options page. */
// src/options-page/pages/sonarr/sonarr-defaults.tsx

import { ProviderTagField } from "@/features/provider-ui/provider-tag-field";
import {
	createDefaultSonarrFormState,
	type SonarrFormState,
} from "@/providers/sonarr/form-state";
import {
	SONARR_MONITOR_OPTIONS_WITH_DESCRIPTIONS,
	SONARR_SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS,
} from "@/providers/sonarr/form-options";
import type {
	SonarrMonitorOption,
	SonarrSeriesType,
} from "@/providers/sonarr/schemas";
import { usePublicOptions, useUpdatePublicOptions } from "@/queries/options";
import { useSonarrFormResources } from "@/queries/sonarr";
import { SelectControl } from "@/shared/ui/primitives/select";
import { Switch } from "@/shared/ui/primitives/switch";
import { SettingsRow } from "../../components/settings-section";
import {
	ArrDefaultsSection,
	type ArrDefaultsFieldsProps,
} from "../arr-defaults-section";

const DEFAULT_OPTIONS_DESCRIPTION =
	"Configures default add options reused when adding series via the extension media modal and overlay.";

type SonarrDefaultsFieldsProps = ArrDefaultsFieldsProps<SonarrFormState>;

const SonarrDefaultsFields = ({
	fieldsDisabled,
	formResources,
	onChange,
	onTagsChange,
	values,
}: SonarrDefaultsFieldsProps) => {
	return (
		<>
			<SettingsRow id="sonarr-series-type" label="Series type">
				<SelectControl
					id="sonarr-series-type"
					value={values.seriesType ?? ""}
					onValueChange={(value) =>
						onChange("seriesType", value as SonarrSeriesType)
					}
					options={SONARR_SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS}
					disabled={fieldsDisabled}
				/>
			</SettingsRow>

			<SettingsRow id="sonarr-tags" label="Tags">
				<ProviderTagField
					id="sonarr-tags"
					availableTags={formResources?.tags ?? []}
					selectedTagIds={values.tags}
					selectedFreeformTags={values.freeformTags}
					onChange={onTagsChange}
					placeholder="Add tags..."
					disabled={fieldsDisabled}
				/>
			</SettingsRow>

			<SettingsRow id="sonarr-monitor" label="Monitor episodes">
				<SelectControl
					id="sonarr-monitor"
					value={values.addOptions?.monitor ?? ""}
					onValueChange={(value) =>
						onChange("addOptions", {
							...values.addOptions,
							monitor: value as SonarrMonitorOption,
						})
					}
					options={SONARR_MONITOR_OPTIONS_WITH_DESCRIPTIONS}
					disabled={fieldsDisabled}
				/>
			</SettingsRow>

			<div className="mt-4 flex flex-col divide-y divide-border-primary/20">
				<div className="py-5">
					<SettingsRow
						id="sonarr-season-folder"
						label="Season Folders"
						description="Use season folders for downloaded episodes."
						inlineOnMobile
						controlClassName="lg:flex lg:justify-end"
					>
						<Switch
							id="sonarr-season-folder"
							checked={values.seasonFolder ?? false}
							disabled={fieldsDisabled}
							onCheckedChange={(checked) => onChange("seasonFolder", checked)}
						/>
					</SettingsRow>
				</div>

				<div className="py-5">
					<SettingsRow
						id="sonarr-search-missing"
						label="Search Missing"
						description="Automatically search for missing episodes when adding a series."
						inlineOnMobile
						controlClassName="lg:flex lg:justify-end"
					>
						<Switch
							id="sonarr-search-missing"
							checked={values.addOptions?.searchForMissingEpisodes ?? false}
							disabled={fieldsDisabled}
							onCheckedChange={(checked) =>
								onChange("addOptions", {
									...values.addOptions,
									searchForMissingEpisodes: checked,
								})
							}
						/>
					</SettingsRow>
				</div>

				<div className="py-5">
					<SettingsRow
						id="sonarr-search-cutoff"
						label="Search Cutoff"
						description="Search for episodes that haven't met the cutoff."
						inlineOnMobile
						controlClassName="lg:flex lg:justify-end"
					>
						<Switch
							id="sonarr-search-cutoff"
							checked={values.addOptions?.searchForCutoffUnmetEpisodes ?? false}
							disabled={fieldsDisabled}
							onCheckedChange={(checked) =>
								onChange("addOptions", {
									...values.addOptions,
									searchForCutoffUnmetEpisodes: checked,
								})
							}
						/>
					</SettingsRow>
				</div>
			</div>
		</>
	);
};

export const SonarrDefaults = () => {
	const { data: savedSettings } = usePublicOptions();
	const saveOptions = useUpdatePublicOptions();
	const isConfigured = savedSettings?.providers.sonarr.isConfigured === true;
	const { data: formResources, isFetching } = useSonarrFormResources({
		enabled: isConfigured,
	});

	if (!isConfigured || !savedSettings) return null;

	return (
		<ArrDefaultsSection
			provider="sonarr"
			description={DEFAULT_OPTIONS_DESCRIPTION}
			savedDefaults={
				savedSettings.providers.sonarr.defaults ??
				createDefaultSonarrFormState()
			}
			formResources={formResources}
			isFetching={isFetching}
			saveOptions={saveOptions}
			toUpdate={(defaults) => ({ type: "sonarrDefaults", defaults })}
			renderFields={(props) => <SonarrDefaultsFields {...props} />}
		/>
	);
};
