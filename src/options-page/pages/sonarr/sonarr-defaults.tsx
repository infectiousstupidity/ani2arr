/** Sonarr provider default add-options form section for the options page. */
// src/options-page/pages/sonarr/sonarr-defaults.tsx

import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { ListPlus } from "lucide-react";
import {
  parseProviderQualityProfileId,
  type ProviderFormOptions,
} from "@/providers";
import {
  createDefaultSonarrFormState,
  type SonarrFormState,
} from "@/providers/sonarr/form-state";
import type {
  SonarrMonitorOption,
  SonarrSeriesType,
} from "@/providers/sonarr/schemas";
import { usePublicOptions } from "@/queries/options";
import { useSonarrFormOptions } from "@/queries/sonarr";
import type { PublicOptions } from "@/settings";
import { ProviderTagField } from "../../components/provider-tag-field";
import type { ProviderTagSelection } from "../../components/provider-tag-selection";
import { SettingsRow, SettingsSection } from "../../components/settings-section";
import { Select } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";

const DEFAULT_OPTIONS_DESCRIPTION =
  "Configures default add options reused when adding series via the extension media modal and overlay.";

const DEFAULT_FIELD_OPTIONS = { shouldDirty: true, shouldTouch: true } as const;

interface SonarrDefaultsFieldsProps {
  formOptions: ProviderFormOptions;
  values: SonarrFormState;
  onChange: <K extends keyof SonarrFormState>(
    field: K,
    value: SonarrFormState[K],
  ) => void;
  onTagsChange: (selection: ProviderTagSelection) => void;
}

const SonarrDefaultsFields = ({
  formOptions,
  values,
  onChange,
  onTagsChange,
}: SonarrDefaultsFieldsProps) => {
  const rootFolderOptions = formOptions.rootFolders.map((rf) => ({
    label: rf.path,
    value: rf.path,
  }));

  const qualityProfileOptions = formOptions.qualityProfiles.map((qp) => ({
    label: qp.name,
    value: String(qp.id),
  }));

  return (
    <>
      <SettingsRow id="sonarr-root-folder" label="Root folder">
        <Select
          id="sonarr-root-folder"
          value={values.rootFolderPath ?? ""}
          onValueChange={(value) => onChange("rootFolderPath", value)}
          options={rootFolderOptions}
          placeholder="Select root folder"
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
        />
      </SettingsRow>

      <SettingsRow id="sonarr-series-type" label="Series type">
        <Select
          id="sonarr-series-type"
          value={values.seriesType ?? ""}
          onValueChange={(value) =>
            onChange("seriesType", value as SonarrSeriesType)
          }
          options={[
            { label: "Anime", value: "anime" },
            { label: "Standard", value: "standard" },
            { label: "Daily", value: "daily" },
          ]}
        />
      </SettingsRow>

      <SettingsRow id="sonarr-tags" label="Tags">
        <ProviderTagField
          id="sonarr-tags"
          availableTags={formOptions.tags}
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
          options={[
            { label: "All Episodes", value: "all" },
            { label: "Future Episodes", value: "future" },
            { label: "Missing Episodes", value: "missing" },
            { label: "Existing Episodes", value: "existing" },
            { label: "First Season", value: "firstSeason" },
            { label: "Latest Season", value: "latestSeason" },
            { label: "None", value: "none" },
          ]}
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
  const isConfigured = savedSettings?.providers.sonarr.isConfigured === true;

  const { data: formOptions, isFetching } = useSonarrFormOptions({
    enabled: isConfigured,
  });

  const { control, getValues, setValue } = useFormContext<PublicOptions>();
  const values =
    useWatch({ control, name: "providers.sonarr.defaults" }) ??
    createDefaultSonarrFormState();

  useEffect(() => {
    if (!formOptions) return;

    const currentDefaults =
      getValues("providers.sonarr.defaults") ?? createDefaultSonarrFormState();
    const firstRootFolder = formOptions.rootFolders[0];
    const firstQualityProfile = formOptions.qualityProfiles[0];
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
      DEFAULT_FIELD_OPTIONS,
    );
  }, [formOptions, getValues, setValue]);

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
        ...(tagIds ? { tags: tagIds } : {}),
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

  if (isFetching && !formOptions) {
    return (
      <SettingsSection
        title="Default add options"
        description={DEFAULT_OPTIONS_DESCRIPTION}
        icon={<ListPlus className="h-4 w-4" />}
        divider="top"
      >
        <p className="animate-pulse py-5 text-sm text-text-secondary">
          Loading Sonarr options...
        </p>
      </SettingsSection>
    );
  }

  if (!formOptions) return null;

  return (
    <SettingsSection
      title="Default add options"
      description={DEFAULT_OPTIONS_DESCRIPTION}
      icon={<ListPlus className="h-4 w-4" />}
      divider="top"
    >
      <SonarrDefaultsFields
        formOptions={formOptions}
        values={values}
        onChange={updateDefaults}
        onTagsChange={updateTags}
      />
    </SettingsSection>
  );
};
