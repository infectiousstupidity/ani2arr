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
import type { ProviderTagSelection } from "@/providers/provider-tag-selection";
import {
  RADARR_ADD_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS,
  RADARR_MOVIE_MONITOR_OPTIONS_WITH_DESCRIPTIONS,
} from "@/providers/radarr/form-options";
import { usePublicOptions, useSavePublicOptions } from "@/queries/options";
import { useRadarrFormResources } from "@/queries/radarr";
import type { PublicOptions } from "@/settings";
import { ProviderTagField } from "@/shared/ui/provider-tag-field";
import { SettingsRow, SettingsSection } from "../../components/settings-section";
import { Select } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";

const DEFAULT_OPTIONS_DESCRIPTION =
  "Configures default add options reused when adding movies via the extension media modal and overlay.";

const DEFAULT_FIELD_OPTIONS = { shouldDirty: true, shouldTouch: true } as const;
const AUTO_DEFAULT_FIELD_OPTIONS = {
  shouldDirty: false,
  shouldTouch: false,
} as const;

export const RadarrDefaults = () => {
  const { data: savedSettings } = usePublicOptions();
  const { mutateAsync: savePublicOptions } = useSavePublicOptions();
  const isConfigured = savedSettings?.providers.radarr.isConfigured === true;

  const { data: formResources, isFetching } = useRadarrFormResources({
    enabled: isConfigured,
  });
  const resourceFieldsDisabled = !formResources;

  const { control, getValues, setValue } = useFormContext<PublicOptions>();
  const values =
    useWatch({ control, name: "providers.radarr.defaults" }) ??
    createDefaultRadarrFormState();

  useEffect(() => {
    if (!formResources || !savedSettings) return;

    const currentDefaults =
      getValues("providers.radarr.defaults") ?? createDefaultRadarrFormState();
    const firstRootFolder = formResources.rootFolders[0];
    const firstQualityProfile = formResources.qualityProfiles[0];
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
      AUTO_DEFAULT_FIELD_OPTIONS,
    );
    void savePublicOptions({
      ...savedSettings,
      providers: {
        ...savedSettings.providers,
        radarr: {
          ...savedSettings.providers.radarr,
          defaults: nextDefaults,
        },
      },
    });
  }, [formResources, getValues, savedSettings, savePublicOptions, setValue]);

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
          Connect Radarr to configure defaults.
        </p>
      </SettingsSection>
    );
  }

  const rootFolderOptions = formResources?.rootFolders.map((rf) => ({
    label: rf.path,
    value: rf.path,
  })) ?? [];

  const qualityProfileOptions = formResources?.qualityProfiles.map((qp) => ({
    label: qp.name,
    value: String(qp.id),
  })) ?? [];

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
      <SettingsRow id="radarr-root-folder" label="Root folder">
        <Select
          id="radarr-root-folder"
          value={values.rootFolderPath ?? ""}
          onValueChange={(value) => updateDefaults("rootFolderPath", value)}
          options={rootFolderOptions}
          placeholder="Select root folder"
          disabled={resourceFieldsDisabled}
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
          disabled={resourceFieldsDisabled}
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
          options={RADARR_ADD_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS}
        />
      </SettingsRow>

      <SettingsRow id="radarr-tags" label="Tags">
        <ProviderTagField
          id="radarr-tags"
          availableTags={formResources?.tags ?? []}
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
          options={RADARR_MOVIE_MONITOR_OPTIONS_WITH_DESCRIPTIONS}
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
