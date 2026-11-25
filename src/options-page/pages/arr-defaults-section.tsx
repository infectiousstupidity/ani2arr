/** Shared draft lifecycle and chrome for the Sonarr/Radarr default add-options sections. */
// src/options-page/pages/arr-defaults-section.tsx

import { useState, type ReactNode } from "react";
import { ListPlus } from "lucide-react";
import type { ProviderTagSelection } from "@/features/provider-ui/provider-tag-selection";
import type { useUpdatePublicOptions } from "@/queries/options";
import type { ProviderFormResources } from "@/providers/types";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { PublicOptionsUpdate } from "@/settings/schema";
import { getUserErrorMessage } from "@/shared/errors/error-utils";
import Button from "@/shared/ui/primitives/button";
import { SettingsSection } from "../components/settings-section";
import { ArrDefaultsResourceFields } from "./arr-defaults-resource-fields";

type ArrDefaultsState = Pick<
	SonarrFormState,
	"rootFolderPath" | "qualityProfileId" | "tags" | "freeformTags"
>;

export type ArrDefaultsChange<T> = <K extends keyof T>(
	field: K,
	value: T[K],
) => void;

export interface ArrDefaultsFieldsProps<T> {
	formResources: ProviderFormResources | undefined;
	fieldsDisabled: boolean;
	values: T;
	onChange: ArrDefaultsChange<T>;
	onTagsChange: (selection: ProviderTagSelection) => void;
}

interface ArrDefaultsSectionProps<T> {
	provider: "sonarr" | "radarr";
	description: string;
	savedDefaults: T;
	formResources: ProviderFormResources | undefined;
	isFetching: boolean;
	saveOptions: ReturnType<typeof useUpdatePublicOptions>;
	toUpdate: (defaults: T) => PublicOptionsUpdate;
	renderFields: (props: ArrDefaultsFieldsProps<T>) => ReactNode;
}

const PROVIDER_LABELS = { sonarr: "Sonarr", radarr: "Radarr" } as const;

const areDefaultsEqual = (left: unknown, right: unknown): boolean =>
	JSON.stringify(left) === JSON.stringify(right);

// Resource-derived first root folder/quality profile fill in missing saved values.
const getInitialDefaults = <T extends ArrDefaultsState>(
	savedDefaults: T,
	formResources: ProviderFormResources | undefined,
): T => {
	const firstRootFolder = formResources?.rootFolders[0];
	const firstQualityProfile = formResources?.qualityProfiles[0];

	return {
		...structuredClone(savedDefaults),
		...(!savedDefaults.rootFolderPath && firstRootFolder
			? { rootFolderPath: firstRootFolder.path }
			: {}),
		...(savedDefaults.qualityProfileId === undefined && firstQualityProfile
			? { qualityProfileId: firstQualityProfile.id }
			: {}),
	};
};

export const ArrDefaultsSection = <T extends ArrDefaultsState>({
	formResources,
	savedDefaults,
	...props
}: ArrDefaultsSectionProps<T>) => {
	// Remount the draft when saved values or resource-derived defaults change.
	const draftKey = JSON.stringify({
		savedDefaults,
		firstRootFolder: formResources?.rootFolders[0]?.path,
		firstQualityProfile: formResources?.qualityProfiles[0]?.id,
	});

	return (
		<ArrDefaultsDraft
			key={draftKey}
			formResources={formResources}
			initialValues={getInitialDefaults(savedDefaults, formResources)}
			savedValues={savedDefaults}
			{...props}
		/>
	);
};

const ArrDefaultsDraft = <T extends ArrDefaultsState>({
	provider,
	description,
	formResources,
	initialValues,
	isFetching,
	savedValues,
	saveOptions,
	toUpdate,
	renderFields,
}: Omit<ArrDefaultsSectionProps<T>, "savedDefaults"> & {
	initialValues: T;
	savedValues: T;
}) => {
	const label = PROVIDER_LABELS[provider];
	const [values, setValues] = useState(() => structuredClone(initialValues));
	const hasDraftChanges = !areDefaultsEqual(values, initialValues);
	const hasPersistableChanges = !areDefaultsEqual(values, savedValues);
	const saveError = saveOptions.error
		? getUserErrorMessage(
				saveOptions.error,
				`Failed to save ${label} defaults.`,
			)
		: null;

	const updateDefaults: ArrDefaultsChange<T> = (field, value) => {
		setValues((current) => ({ ...current, [field]: value }));
	};

	const updateTags = ({ tagIds, freeformTags }: ProviderTagSelection) => {
		setValues((current) => {
			const next: T = { ...current, freeformTags };
			if (tagIds.length === 0) {
				delete next.tags;
				return next;
			}
			return { ...next, tags: tagIds };
		});
	};

	return (
		<SettingsSection
			title="Default add options"
			description={description}
			icon={<ListPlus className="h-4 w-4" />}
			divider="top"
		>
			{!isFetching && !formResources ? (
				<p className="text-sm text-text-secondary">
					{label} folders, quality profiles, and existing tags are unavailable.
					Static defaults remain editable.
				</p>
			) : null}
			<ArrDefaultsResourceFields
				provider={provider}
				formResources={formResources}
				resourceFieldsDisabled={!formResources || saveOptions.isPending}
				values={values}
				onRootFolderChange={(value) => updateDefaults("rootFolderPath", value)}
				onQualityProfileChange={(value) =>
					updateDefaults("qualityProfileId", value)
				}
			/>
			{renderFields({
				fieldsDisabled: saveOptions.isPending,
				formResources,
				values,
				onChange: updateDefaults,
				onTagsChange: updateTags,
			})}
			{saveError ? (
				<p className="text-sm font-semibold text-error" role="alert">
					{saveError}
				</p>
			) : null}
			<div className="mt-6 flex justify-end gap-3">
				<Button
					type="button"
					variant="ghost"
					disabled={!hasDraftChanges || saveOptions.isPending}
					onClick={() => setValues(structuredClone(initialValues))}
				>
					Cancel
				</Button>
				<Button
					type="button"
					variant="primary"
					disabled={!hasPersistableChanges || saveOptions.isPending}
					onClick={() => saveOptions.mutate(toUpdate(values))}
				>
					{saveOptions.isPending ? "Saving..." : "Save defaults"}
				</Button>
			</div>
		</SettingsSection>
	);
};
