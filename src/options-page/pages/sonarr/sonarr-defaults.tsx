/** Sonarr provider default add-options form section for the options page. */
// src/options-page/pages/sonarr/sonarr-defaults.tsx

import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { ListPlus } from "lucide-react";
import {
  parseProviderQualityProfileId,
  type ProviderFormResources,
} from "@/providers";
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
import type { PublicOptions } from "@/settings";
import { ProviderTagField } from "@/shared/ui/provider-tag-field";
import { SettingsRow, SettingsSection } from "../../components/settings-section";
import { Select } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";

const DEFAULT_OPTIONS_DESCRIPTION =
  "Configures default add options reused when adding series via the extension media modal and overlay.";

const DEFAULT_FIELD_OPTIONS = { shouldDirty: true, shouldTouch: true } as const;
const AUTO_DEFAULT_FIELD_OPTIONS = {
  shouldDirty: false,
  shouldTouch: false,
} as const;

interface SonarrDefaultsFieldsProps {
  formResources?: ProviderFormResources | undefined;
  resourceFieldsDisabled: boolean;
  values: SonarrFormState;
  onChange: <K extends keyof SonarrFormState>(
    field: K,
    value: SonarrFormState[K],
  ) => void;
  onTagsChange: (selection: ProviderTagSelection) => void;
}

const SonarrDefaultsFields = ({
  formResources,
  resourceFieldsDisabled,
  values,
  onChange,
  onTagsChange,
}: SonarrDefaultsFieldsProps) => {
  const rootFolderOptions = formResources?.rootFolders.map((rf) => ({
    label: rf.path,
    value: rf.path,
  })) ?? [];

  const qualityProfileOptions = formResources?.qualityProfiles.map((qp) => ({
    label: qp.name,
    value: String(qp.id),
  })) ?? [];

  return (
    <>
      <SettingsRow id="sonarr-root-folder" label="Root folder">
        <Select
          id="sonarr-root-folder"
          value={values.rootFolderPath ?? ""}
          onValueChange={(value) => onChange("rootFolderPath", value)}
          options={rootFolderOptions}
          placeholder="Select root folder"
          disabled={resourceFieldsDisabled}
        />
      </SettingsRow>

      <SettingsRow id="sonarr-quality-profile" label="Quality profile">
        <Select
          id="sonarr-quality-profile"
          value={
            values.qualityProfileId === undefined
              ? ""
              : String(values.qualityProfileId)
          }
          onValueChange={(value) => {
            const num = Number(value);
            onChange(
              "qualityProfileId",
              !value || Number.isNaN(num)
                ? undefined
                : parseProviderQualityProfileId(num),
            );
          }}
          options={qualityProfileOptions}
          placeholder="Select quality profile"
          disabled={resourceFieldsDisabled}
        />
      </SettingsRow>

      <SettingsRow id="sonarr-series-type" label="Series type">
        <Select
          id="sonarr-series-type"
          value={values.seriesType ?? ""}
          onValueChange={(value) =>
            onChange("seriesType", value as SonarrSeriesType)
          }
          options={SONARR_SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS}
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
        />
      </SettingsRow>

      <SettingsRow id="sonarr-monitor" label="Monitor episodes">
        <Select
          id="sonarr-monitor"
          value={values.addOptions?.monitor ?? ""}
          onValueChange={(value) =>
            onChange("addOptions", {
              ...values.addOptions,
              monitor: value as SonarrMonitorOption,
            })
          }
          options={SONARR_MONITOR_OPTIONS_WITH_DESCRIPTIONS}
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
  const { mutateAsync: savePublicOptions } = useSavePublicOptions();
  const isConfigured = savedSettings?.providers.sonarr.isConfigured === true;

  const { data: formResources, isFetching } = useSonarrFormResources({
    enabled: isConfigured,
  });
  const resourceFieldsDisabled = !formResources;

  const { control, getValues, setValue } = useFormContext<PublicOptions>();
  const values =
    useWatch({ control, name: "providers.sonarr.defaults" }) ??
    createDefaultSonarrFormState();

  useEffect(() => {
    if (!formResources || !savedSettings) return;

    const currentDefaults =
      getValues("providers.sonarr.defaults") ?? createDefaultSonarrFormState();
    const firstRootFolder = formResources.rootFolders[0];
    const firstQualityProfile = formResources.qualityProfiles[0];
    const nextDefaults: SonarrFormState = { ...currentDefaults };

    if (!nextDefaults.rootFolderPath && firstRootFolder) {
      nextDefaults.rootFolderPath = firstRootFolder.path;
    }

    if (nextDefaults.qualityProfileId === undefined && firstQualityProfile) {
      nextDefaults.qualityProfileId = firstQualityProfile.id;
    }

    if (
      nextDefaults.rootFolderPath === currentDefaults.rootFolderPath &&
      nextDefaults.qualityProfileId === currentDefaults.qualityProfileId
    ) {
      return;
    }

    setValue(
      "providers.sonarr.defaults",
      nextDefaults,
      AUTO_DEFAULT_FIELD_OPTIONS,
    );
    void savePublicOptions({
      ...savedSettings,
      providers: {
        ...savedSettings.providers,
        sonarr: {
          ...savedSettings.providers.sonarr,
          defaults: nextDefaults,
        },
      },
    });
  }, [formResources, getValues, savedSettings, savePublicOptions, setValue]);

  const updateDefaults = <K extends keyof SonarrFormState>(
    field: K,
    value: SonarrFormState[K],
  ) => {
    const currentDefaults =
      getValues("providers.sonarr.defaults") ?? createDefaultSonarrFormState();

    setValue(
      "providers.sonarr.defaults",
      {
        ...currentDefaults,
        [field]: value,
      },
      DEFAULT_FIELD_OPTIONS,
    );
  };

  const updateTags = ({ tagIds, freeformTags }: ProviderTagSelection) => {
    const currentDefaults =
      getValues("providers.sonarr.defaults") ?? createDefaultSonarrFormState();
    const nextDefaults: SonarrFormState = {
      ...currentDefaults,
      freeformTags,
    };
    delete nextDefaults.tags;

    setValue(
      "providers.sonarr.defaults",
      {
        ...nextDefaults,
        ...(tagIds.length > 0 ? { tags: tagIds } : {}),
      },
      DEFAULT_FIELD_OPTIONS,
    );
  };

  if (!isConfigured) {
    return (
      <SettingsSection
        title="Default add options"
        description={DEFAULT_OPTIONS_DESCRIPTION}
        icon={<ListPlus className="h-4 w-4" />}
        className="opacity-60"
        divider="top"
      >
        <p className="py-5 text-sm text-text-secondary">
          Connect Sonarr to configure defaults.
        </p>
      </SettingsSection>
    );
  }

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
        formResources={formResources}
        resourceFieldsDisabled={resourceFieldsDisabled}
        values={values}
        onChange={updateDefaults}
        onTagsChange={updateTags}
      />
    </SettingsSection>
  );
};
