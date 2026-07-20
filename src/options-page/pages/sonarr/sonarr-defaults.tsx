/** Sonarr provider default add-options form section for the options page. */
// src/options-page/pages/sonarr/sonarr-defaults.tsx

import { useState } from "react";
import { ListPlus } from "lucide-react";
import * as v from "valibot";
import { ProviderQualityProfileIdSchema } from "@/providers/schemas";
import type { ProviderFormResources } from "@/providers/types";
import { ProviderTagField } from "@/providers/provider-tag-field";
import {
  createDefaultSonarrFormState,
  type SonarrFormState,
} from "@/providers/sonarr/form-state";
import type { ProviderTagSelection } from "@/providers/provider-tag-selection";
import {
  SONARR_MONITOR_OPTIONS_WITH_DESCRIPTIONS,
  SONARR_SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS,
} from "@/providers/sonarr/form-options";
import type {
  SonarrMonitorOption,
  SonarrSeriesType,
} from "@/providers/sonarr/schemas";
import { usePublicOptions, useSavePublicOptions } from "@/queries/options";
import { useSonarrFormResources } from "@/queries/sonarr";
import type { PublicOptions } from "@/settings/types";
import { getUserErrorMessage } from "@/shared/errors/error-utils";
import Button from "@/shared/ui/primitives/button";
import { SelectControl } from "@/shared/ui/primitives/select";
import { Switch } from "@/shared/ui/primitives/switch";
import { SettingsRow, SettingsSection } from "../../components/settings-section";

const DEFAULT_OPTIONS_DESCRIPTION =
  "Configures default add options reused when adding series via the extension media modal and overlay.";

type SonarrDraftChange = <K extends keyof SonarrFormState>(
  field: K,
  value: SonarrFormState[K],
) => void;

interface SonarrDefaultsFieldsProps {
  formResources: ProviderFormResources | undefined;
  resourceFieldsDisabled: boolean;
  fieldsDisabled: boolean;
  values: SonarrFormState;
  onChange: SonarrDraftChange;
  onTagsChange: (selection: ProviderTagSelection) => void;
}

const SonarrDefaultsFields = ({
  fieldsDisabled,
  formResources,
  onChange,
  onTagsChange,
  resourceFieldsDisabled,
  values,
}: SonarrDefaultsFieldsProps) => {
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
    <SettingsRow id="sonarr-root-folder" label="Root folder">
      <SelectControl
        id="sonarr-root-folder"
        value={values.rootFolderPath ?? ""}
        onValueChange={(value) => onChange("rootFolderPath", value)}
        options={rootFolderOptions}
        placeholder="Select root folder"
        disabled={resourceFieldsDisabled}
      />
    </SettingsRow>

    <SettingsRow id="sonarr-quality-profile" label="Quality profile">
      <SelectControl
        id="sonarr-quality-profile"
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

const cloneSonarrDefaults = (defaults: SonarrFormState): SonarrFormState =>
  structuredClone(defaults);

const getInitialSonarrDefaults = (
  savedDefaults: SonarrFormState,
  formResources: ProviderFormResources | undefined,
): SonarrFormState => {
  const defaults = cloneSonarrDefaults(savedDefaults);
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

const getSonarrDefaultsKey = (
  savedDefaults: SonarrFormState,
  formResources: ProviderFormResources | undefined,
): string =>
  JSON.stringify({
    savedDefaults,
    firstRootFolder: formResources?.rootFolders[0]?.path,
    firstQualityProfile: formResources?.qualityProfiles[0]?.id,
  });

const areSonarrDefaultsEqual = (
  left: SonarrFormState,
  right: SonarrFormState,
): boolean => JSON.stringify(left) === JSON.stringify(right);

export const SonarrDefaults = () => {
  const { data: savedSettings } = usePublicOptions();
  const saveOptions = useSavePublicOptions();
  const isConfigured = savedSettings?.providers.sonarr.isConfigured === true;

  const { data: formResources, isFetching } = useSonarrFormResources({
    enabled: isConfigured,
  });
  const resourceFieldsDisabled = !formResources || saveOptions.isPending;

  if (!isConfigured || !savedSettings) return null;

  const savedDefaults =
    savedSettings.providers.sonarr.defaults ?? createDefaultSonarrFormState();
  const savedValues = cloneSonarrDefaults(savedDefaults);
  const initialValues = getInitialSonarrDefaults(savedDefaults, formResources);
  const draftKey = getSonarrDefaultsKey(savedDefaults, formResources);

  return (
    <SonarrDefaultsDraft
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

const SonarrDefaultsDraft = ({
  formResources,
  initialValues,
  isFetching,
  resourceFieldsDisabled,
  savedSettings,
  savedValues,
  saveOptions,
}: {
  formResources: ProviderFormResources | undefined;
  initialValues: SonarrFormState;
  isFetching: boolean;
  resourceFieldsDisabled: boolean;
  savedSettings: PublicOptions;
  savedValues: SonarrFormState;
  saveOptions: ReturnType<typeof useSavePublicOptions>;
}) => {
  const [values, setValues] = useState(() => cloneSonarrDefaults(initialValues));
  const hasDraftChanges = !areSonarrDefaultsEqual(values, initialValues);
  const hasPersistableChanges = !areSonarrDefaultsEqual(values, savedValues);
  const saveError = saveOptions.error
    ? getUserErrorMessage(saveOptions.error, "Failed to save Sonarr defaults.")
    : null;

  const updateDefaults: SonarrDraftChange = (field, value) => {
    setValues((currentDefaults) => ({
      ...currentDefaults,
      [field]: value,
    }));
  };

  const updateTags = ({ tagIds, freeformTags }: ProviderTagSelection) => {
    setValues((currentDefaults) => {
      const nextDefaults: SonarrFormState = {
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

  const saveDefaults = (): void => {
    saveOptions.mutate({
      ...savedSettings,
      providers: {
        ...savedSettings.providers,
        sonarr: {
          ...savedSettings.providers.sonarr,
          defaults: values,
        },
      },
    });
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
          Sonarr folders, quality profiles, and existing tags are unavailable.
          Static defaults remain editable.
        </p>
      ) : null}
      <SonarrDefaultsFields
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
          onClick={() => setValues(cloneSonarrDefaults(initialValues))}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!hasPersistableChanges || saveOptions.isPending}
          onClick={saveDefaults}
        >
          {saveOptions.isPending ? "Saving..." : "Save defaults"}
        </Button>
      </div>
    </SettingsSection>
  );
};
