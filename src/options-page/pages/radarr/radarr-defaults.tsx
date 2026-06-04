/** Radarr provider default add-options form section for the options page. */
// src/options-page/pages/radarr/radarr-defaults.tsx

import { useState } from "react";
import { ListPlus } from "lucide-react";
import * as v from "valibot";
import { ProviderQualityProfileIdSchema } from "@/providers/schemas";
import type { ProviderFormResources } from "@/providers/types";
import { ProviderTagField } from "@/providers/provider-tag-field";
import { createDefaultRadarrFormState } from "@/providers/radarr/form-state";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type {
	RadarrMinimumAvailability,
	RadarrMovieMonitor,
} from "@/providers/radarr/schemas";
import type { ProviderTagSelection } from "@/providers/provider-tag-selection";
import {
  RADARR_ADD_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS,
  RADARR_MOVIE_MONITOR_OPTIONS_WITH_DESCRIPTIONS,
} from "@/providers/radarr/form-options";
import { usePublicOptions, useSavePublicOptions } from "@/queries/options";
import { useRadarrFormResources } from "@/queries/radarr";
import type { PublicOptions } from "@/settings/types";
import Button from "@/shared/ui/primitives/button";
import { SelectControl } from "@/shared/ui/primitives/select";
import { SettingsRow, SettingsSection } from "../../components/settings-section";
import { Switch } from "../../components/ui/switch";
import { getActionErrorMessage } from "../../hooks/action-helpers";

const DEFAULT_OPTIONS_DESCRIPTION =
  "Configures default add options reused when adding movies via the extension media modal and overlay.";

type RadarrDraftChange = <K extends keyof RadarrFormState>(
  field: K,
  value: RadarrFormState[K],
) => void;

interface RadarrDefaultsFieldsProps {
  formResources: ProviderFormResources | undefined;
  resourceFieldsDisabled: boolean;
  fieldsDisabled: boolean;
  values: RadarrFormState;
  onChange: RadarrDraftChange;
  onTagsChange: (selection: ProviderTagSelection) => void;
}

const RadarrDefaultsFields = ({
  fieldsDisabled,
  formResources,
  onChange,
  onTagsChange,
  resourceFieldsDisabled,
  values,
}: RadarrDefaultsFieldsProps) => {
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
    <SettingsRow id="radarr-root-folder" label="Root folder">
      <SelectControl
        id="radarr-root-folder"
        value={values.rootFolderPath ?? ""}
        onValueChange={(value) => onChange("rootFolderPath", value)}
        options={rootFolderOptions}
        placeholder="Select root folder"
        disabled={resourceFieldsDisabled}
      />
    </SettingsRow>

    <SettingsRow id="radarr-quality-profile" label="Quality profile">
      <SelectControl
        id="radarr-quality-profile"
        value={
          values.qualityProfileId === undefined
            ? ""
            : String(values.qualityProfileId)
        }
        onValueChange={(value) => {
          const qualityProfileId = Number(value);
          onChange(
            "qualityProfileId",
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

    <SettingsRow id="radarr-minimum-availability" label="Minimum availability">
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

const cloneRadarrDefaults = (defaults: RadarrFormState): RadarrFormState =>
  structuredClone(defaults);

const getInitialRadarrDefaults = (
  savedDefaults: RadarrFormState,
  formResources: ProviderFormResources | undefined,
): RadarrFormState => {
  const defaults = cloneRadarrDefaults(savedDefaults);
  const firstRootFolder = formResources?.rootFolders[0];
  const firstQualityProfile = formResources?.qualityProfiles[0];

  return {
    ...defaults,
    ...(!defaults.rootFolderPath && firstRootFolder
      ? { rootFolderPath: firstRootFolder.path }
      : {}),
    ...(defaults.qualityProfileId === undefined && firstQualityProfile
      ? { qualityProfileId: firstQualityProfile.id }
      : {}),
  };
};

const getRadarrDefaultsKey = (
  savedDefaults: RadarrFormState,
  formResources: ProviderFormResources | undefined,
): string =>
  JSON.stringify({
    savedDefaults,
    firstRootFolder: formResources?.rootFolders[0]?.path,
    firstQualityProfile: formResources?.qualityProfiles[0]?.id,
  });

const areRadarrDefaultsEqual = (
  left: RadarrFormState,
  right: RadarrFormState,
): boolean => JSON.stringify(left) === JSON.stringify(right);

export const RadarrDefaults = () => {
  const { data: savedSettings } = usePublicOptions();
  const saveOptions = useSavePublicOptions();
  const isConfigured = savedSettings?.providers.radarr.isConfigured === true;

  const { data: formResources, isFetching } = useRadarrFormResources({
    enabled: isConfigured,
  });
  const resourceFieldsDisabled = !formResources || saveOptions.isPending;

  if (!isConfigured || !savedSettings) return null;

  const savedDefaults =
    savedSettings.providers.radarr.defaults ?? createDefaultRadarrFormState();
  const savedValues = cloneRadarrDefaults(savedDefaults);
  const initialValues = getInitialRadarrDefaults(savedDefaults, formResources);
  const draftKey = getRadarrDefaultsKey(savedDefaults, formResources);

  return (
    <RadarrDefaultsDraft
      key={draftKey}
      formResources={formResources}
      initialValues={initialValues}
      isFetching={isFetching}
      resourceFieldsDisabled={resourceFieldsDisabled}
      savedSettings={savedSettings}
      savedValues={savedValues}
      saveOptions={saveOptions}
    />
  );
};

const RadarrDefaultsDraft = ({
  formResources,
  initialValues,
  isFetching,
  resourceFieldsDisabled,
  savedSettings,
  savedValues,
  saveOptions,
}: {
  formResources: ProviderFormResources | undefined;
  initialValues: RadarrFormState;
  isFetching: boolean;
  resourceFieldsDisabled: boolean;
  savedSettings: PublicOptions;
  savedValues: RadarrFormState;
  saveOptions: ReturnType<typeof useSavePublicOptions>;
}) => {
  const [values, setValues] = useState(() => cloneRadarrDefaults(initialValues));
  const [saveError, setSaveError] = useState<string | null>(null);
  const hasDraftChanges = !areRadarrDefaultsEqual(values, initialValues);
  const hasPersistableChanges = !areRadarrDefaultsEqual(values, savedValues);

  const updateDefaults: RadarrDraftChange = (field, value) => {
    setValues((currentDefaults) => ({
      ...currentDefaults,
      [field]: value,
    }));
  };

  const updateTags = ({ tagIds, freeformTags }: ProviderTagSelection) => {
    setValues((currentDefaults) => {
      const nextDefaults: RadarrFormState = {
        ...currentDefaults,
        freeformTags,
      };

      if (tagIds.length === 0) {
        delete nextDefaults.tags;
        return nextDefaults;
      }

      return {
        ...nextDefaults,
        tags: tagIds,
      };
    });
  };

  const saveDefaults = async (): Promise<void> => {
    setSaveError(null);

    try {
      await saveOptions.mutateAsync({
        ...savedSettings,
        providers: {
          ...savedSettings.providers,
          radarr: {
            ...savedSettings.providers.radarr,
            defaults: values,
          },
        },
      });
    } catch (error) {
      setSaveError(getActionErrorMessage(error, "Failed to save Radarr defaults."));
    }
  };

  return (
    <SettingsSection
      title="Default add options"
      description={DEFAULT_OPTIONS_DESCRIPTION}
      icon={<ListPlus className="h-4 w-4" />}
      divider="top"
    >
      {!isFetching && !formResources ? (
        <p className="text-sm text-text-secondary">
          Radarr folders, quality profiles, and existing tags are unavailable.
          Static defaults remain editable.
        </p>
      ) : null}
      <RadarrDefaultsFields
        fieldsDisabled={saveOptions.isPending}
        formResources={formResources}
        resourceFieldsDisabled={resourceFieldsDisabled}
        values={values}
        onChange={updateDefaults}
        onTagsChange={updateTags}
      />
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
          onClick={() => setValues(cloneRadarrDefaults(initialValues))}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!hasPersistableChanges || saveOptions.isPending}
          onClick={() => void saveDefaults()}
        >
          {saveOptions.isPending ? "Saving..." : "Save defaults"}
        </Button>
      </div>
    </SettingsSection>
  );
};
