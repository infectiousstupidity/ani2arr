/** Radarr provider default add-options form section for the options page. */
// src/options-page/pages/radarr/radarr-defaults.tsx

import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { ListPlus } from "lucide-react";
import { parseProviderQualityProfileId } from "@/providers";
import {
  createDefaultRadarrFormState,
  type RadarrMinimumAvailability,
  type RadarrFormState,
  type RadarrMovieMonitor,
} from "@/providers/radarr/form-state";
import { usePublicOptions } from "@/queries/options";
import { useRadarrFormOptions } from "@/queries/radarr";
import type { PublicOptions } from "@/settings";
import { ProviderTagField } from "../../components/provider-tag-field";
import type { ProviderTagSelection } from "../../components/provider-tag-selection";
import { SettingsRow, SettingsSection } from "../../components/settings-section";
import { Select } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";

const DEFAULT_OPTIONS_DESCRIPTION =
  "Configures default add options reused when adding movies via the extension media modal and overlay.";

const DEFAULT_FIELD_OPTIONS = { shouldDirty: true, shouldTouch: true } as const;

export const RadarrDefaults = () => {
  const { data: savedSettings } = usePublicOptions();
  const isConfigured = savedSettings?.providers.radarr.isConfigured === true;

  const { data: formOptions, isFetching } = useRadarrFormOptions({
    enabled: isConfigured,
  });

  const { control, getValues, setValue } = useFormContext<PublicOptions>();
  const values =
    useWatch({ control, name: "providers.radarr.defaults" }) ??
    createDefaultRadarrFormState();

  useEffect(() => {
    if (!formOptions) return;

    const currentDefaults =
      getValues("providers.radarr.defaults") ?? createDefaultRadarrFormState();
    const firstRootFolder = formOptions.rootFolders[0];
    const firstQualityProfile = formOptions.qualityProfiles[0];
    const nextDefaults: RadarrFormState = { ...currentDefaults };

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
      "providers.radarr.defaults",
      nextDefaults,
      DEFAULT_FIELD_OPTIONS,
    );
  }, [formOptions, getValues, setValue]);

  const updateDefaults = <K extends keyof RadarrFormState>(
    field: K,
    value: RadarrFormState[K],
  ) => {
    const currentDefaults =
      getValues("providers.radarr.defaults") ?? createDefaultRadarrFormState();

    setValue(
      "providers.radarr.defaults",
      {
        ...currentDefaults,
        [field]: value,
      },
      DEFAULT_FIELD_OPTIONS,
    );
  };

  const updateTags = ({ tagIds, freeformTags }: ProviderTagSelection) => {
    const currentDefaults =
      getValues("providers.radarr.defaults") ?? createDefaultRadarrFormState();
    const nextDefaults: RadarrFormState = {
      ...currentDefaults,
      freeformTags,
    };
    delete nextDefaults.tags;

    setValue(
      "providers.radarr.defaults",
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
          Connect Radarr to configure defaults.
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
          Loading Radarr options...
        </p>
      </SettingsSection>
    );
  }

  if (!formOptions) return null;

  const rootFolderOptions = formOptions.rootFolders.map((rf) => ({
    label: rf.path,
    value: rf.path,
  }));

  const qualityProfileOptions = formOptions.qualityProfiles.map((qp) => ({
    label: qp.name,
    value: String(qp.id),
  }));

  return (
    <SettingsSection
      title="Default add options"
      description={DEFAULT_OPTIONS_DESCRIPTION}
      icon={<ListPlus className="h-4 w-4" />}
      divider="top"
    >
      <SettingsRow id="radarr-root-folder" label="Root folder">
        <Select
          id="radarr-root-folder"
          value={values.rootFolderPath ?? ""}
          onValueChange={(value) => updateDefaults("rootFolderPath", value)}
          options={rootFolderOptions}
          placeholder="Select root folder"
        />
      </SettingsRow>

      <SettingsRow id="radarr-quality-profile" label="Quality profile">
        <Select
          id="radarr-quality-profile"
          value={
            values.qualityProfileId === undefined
              ? ""
              : String(values.qualityProfileId)
          }
          onValueChange={(value) => {
            const num = Number(value);
            updateDefaults(
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

      <SettingsRow
        id="radarr-minimum-availability"
        label="Minimum availability"
      >
        <Select
          id="radarr-minimum-availability"
          value={values.minimumAvailability ?? ""}
          onValueChange={(value) =>
            updateDefaults(
              "minimumAvailability",
              value as RadarrMinimumAvailability,
            )
          }
          options={[
            { label: "Announced", value: "announced" },
            { label: "In Cinemas", value: "inCinemas" },
            { label: "Released", value: "released" },
            { label: "TBA", value: "tba" },
          ]}
        />
      </SettingsRow>

      <SettingsRow id="radarr-tags" label="Tags">
        <ProviderTagField
          id="radarr-tags"
          availableTags={formOptions.tags}
          selectedTagIds={values.tags}
          selectedFreeformTags={values.freeformTags}
          onChange={updateTags}
          placeholder="Add tags..."
        />
      </SettingsRow>

      <SettingsRow id="radarr-monitor" label="Monitor movie">
        <Select
          id="radarr-monitor"
          value={values.addOptions?.monitor ?? ""}
          onValueChange={(value) =>
            updateDefaults("addOptions", {
              ...values.addOptions,
              monitor: value as RadarrMovieMonitor,
            })
          }
          options={[
            { label: "Movie Only", value: "movieOnly" },
            { label: "Movie and Collection", value: "movieAndCollection" },
            { label: "None", value: "none" },
          ]}
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
              onCheckedChange={(checked) =>
                updateDefaults("addOptions", {
                  ...values.addOptions,
                  searchForMovie: checked,
                })
              }
            />
          </SettingsRow>
        </div>
      </div>
    </SettingsSection>
  );
};
