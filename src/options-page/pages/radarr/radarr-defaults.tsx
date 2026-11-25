/** Radarr provider default add-options form section for the options page. */
// src/options-page/pages/radarr/radarr-defaults.tsx

import { ProviderTagField } from "@/features/provider-ui/provider-tag-field";
import { createDefaultRadarrFormState } from "@/providers/radarr/form-state";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type {
	RadarrMinimumAvailability,
	RadarrMovieMonitor,
} from "@/providers/radarr/schemas";
import {
	RADARR_ADD_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS,
	RADARR_MOVIE_MONITOR_OPTIONS_WITH_DESCRIPTIONS,
} from "@/providers/radarr/form-options";
import { usePublicOptions, useUpdatePublicOptions } from "@/queries/options";
import { useRadarrFormResources } from "@/queries/radarr";
import { SelectControl } from "@/shared/ui/primitives/select";
import { Switch } from "@/shared/ui/primitives/switch";
import { SettingsRow } from "../../components/settings-section";
import {
	ArrDefaultsSection,
	type ArrDefaultsFieldsProps,
} from "../arr-defaults-section";

const DEFAULT_OPTIONS_DESCRIPTION =
	"Configures default add options reused when adding movies via the extension media modal and overlay.";

type RadarrDefaultsFieldsProps = ArrDefaultsFieldsProps<RadarrFormState>;

const RadarrDefaultsFields = ({
	fieldsDisabled,
	formResources,
	onChange,
	onTagsChange,
	values,
}: RadarrDefaultsFieldsProps) => {
	return (
		<>
			<SettingsRow
				id="radarr-minimum-availability"
				label="Minimum availability"
			>
				<SelectControl
					id="radarr-minimum-availability"
					value={values.minimumAvailability ?? ""}
					onValueChange={(value) =>
						onChange("minimumAvailability", value as RadarrMinimumAvailability)
					}
					options={RADARR_ADD_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS}
					disabled={fieldsDisabled}
				/>
			</SettingsRow>

			<SettingsRow id="radarr-tags" label="Tags">
				<ProviderTagField
					id="radarr-tags"
					availableTags={formResources?.tags ?? []}
					selectedTagIds={values.tags}
					selectedFreeformTags={values.freeformTags}
					onChange={onTagsChange}
					placeholder="Add tags..."
					disabled={fieldsDisabled}
				/>
			</SettingsRow>

			<SettingsRow id="radarr-monitor" label="Monitor movie">
				<SelectControl
					id="radarr-monitor"
					value={values.addOptions?.monitor ?? ""}
					onValueChange={(value) =>
						onChange("addOptions", {
							...values.addOptions,
							monitor: value as RadarrMovieMonitor,
						})
					}
					options={RADARR_MOVIE_MONITOR_OPTIONS_WITH_DESCRIPTIONS}
					disabled={fieldsDisabled}
				/>
			</SettingsRow>

			<div className="mt-4">
				<div className="py-5">
					<SettingsRow
						id="radarr-search-movie"
						label="Search Movie"
						description="Automatically search for the movie when adding."
						inlineOnMobile
						controlClassName="lg:flex lg:justify-end"
					>
						<Switch
							id="radarr-search-movie"
							checked={values.addOptions?.searchForMovie ?? false}
							disabled={fieldsDisabled}
							onCheckedChange={(checked) =>
								onChange("addOptions", {
									...values.addOptions,
									searchForMovie: checked,
								})
							}
						/>
					</SettingsRow>
				</div>
			</div>
		</>
	);
};

export const RadarrDefaults = () => {
	const { data: savedSettings } = usePublicOptions();
	const saveOptions = useUpdatePublicOptions();
	const isConfigured = savedSettings?.providers.radarr.isConfigured === true;
	const { data: formResources, isFetching } = useRadarrFormResources({
		enabled: isConfigured,
	});

	if (!isConfigured || !savedSettings) return null;

	return (
		<ArrDefaultsSection
			provider="radarr"
			description={DEFAULT_OPTIONS_DESCRIPTION}
			savedDefaults={
				savedSettings.providers.radarr.defaults ??
				createDefaultRadarrFormState()
			}
			formResources={formResources}
			isFetching={isFetching}
			saveOptions={saveOptions}
			toUpdate={(defaults) => ({ type: "radarrDefaults", defaults })}
			renderFields={(props) => <RadarrDefaultsFields {...props} />}
		/>
	);
};
