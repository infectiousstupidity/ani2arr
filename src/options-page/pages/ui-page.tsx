/** Options-page controls for browse-card and anime-page UI enablement and visibility settings. */
// src/options-page/pages/ui-page.tsx

import { useState } from "react";
import {
  AppWindow,
  Check,
  ChevronDown,
  ExternalLink,
  Heart,
  Languages,
  LayoutGrid,
} from "lucide-react";
import {
  ANILIST_TITLE_LANGUAGES,
  isAniListTitleLanguage,
  type AniListTitleLanguage,
} from "@/anilist/title";
import { usePublicOptions, useSavePublicOptions } from "@/queries/options";
import type {
	PublicOptions,
	BadgeVisibility,
} from "@/settings/types";
import { cn } from "@/shared/utils/cn";

import { SettingsSection } from "../components/settings-section";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { RadarrIcon, SonarrIcon } from "../components/icons";
import { getActionErrorMessage } from "../hooks/action-helpers";

type BrowseCardMode = BadgeVisibility | "hidden";
type BrowseCardProvider = keyof PublicOptions["ui"]["browseCards"];
type BrowseCardSettings = PublicOptions["ui"]["browseCards"][BrowseCardProvider];
type SegmentedOption<TValue extends string> = {
  label: string;
  value: TValue;
};

const BROWSE_CARD_MODE_OPTIONS: { label: string; value: BrowseCardMode }[] = [
  { label: "Always", value: "always" },
  { label: "On hover", value: "hover" },
  { label: "Hidden", value: "hidden" },
];

const TITLE_LANGUAGE_LABELS: Record<AniListTitleLanguage, string> = {
  english: "English",
  romaji: "Romaji",
  native: "Native",
};

const TITLE_LANGUAGE_OPTIONS = ANILIST_TITLE_LANGUAGES.map((language) => ({
  label: TITLE_LANGUAGE_LABELS[language],
  value: language,
}));

const isBrowseCardMode = (mode: string): mode is BrowseCardMode =>
  BROWSE_CARD_MODE_OPTIONS.some((option) => option.value === mode);

const getBrowseCardMode = (options: BrowseCardSettings): BrowseCardMode =>
  options.enabled ? options.visibility : "hidden";

const SEGMENTED_ITEM_CLASS =
  "min-h-10 cursor-pointer rounded-sm px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary";

function SegmentedControl<TValue extends string>({
  ariaLabel,
  ariaLabelledBy,
  className,
  disabled,
  onChange,
  options,
  value,
}: {
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
  disabled?: boolean;
  onChange: (value: TValue) => void;
  options: readonly SegmentedOption<TValue>[];
  value: TValue;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn(
        "grid grid-cols-3 rounded-md border border-border-primary bg-bg-secondary p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            className={cn(
              SEGMENTED_ITEM_CLASS,
              selected
                ? "bg-accent-primary text-white"
                : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
              disabled && "cursor-not-allowed opacity-60",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export const UiPage = () => {
  const { data: publicOptions } = usePublicOptions();
  const saveOptions = useSavePublicOptions();
  const [saveError, setSaveError] = useState<string | null>(null);
  const uiOptions = publicOptions?.ui;
  const isSaving = saveOptions.isPending;

  const updateSettings = async (
    updater: (current: PublicOptions) => PublicOptions,
  ): Promise<void> => {
    if (!publicOptions || isSaving) return;
    setSaveError(null);

    try {
      await saveOptions.mutateAsync(updater(publicOptions));
    } catch (error) {
      setSaveError(getActionErrorMessage(error, "Failed to save UI settings."));
    }
  };

  const updateTitleLanguage = (language: string) => {
    if (!isAniListTitleLanguage(language)) return;

    void updateSettings((current) => ({
      ...current,
      ui: {
        ...current.ui,
        preferredAniListTitleLanguage: language,
      },
    }));
  };

  const updateBrowseProvider = (
    provider: BrowseCardProvider,
    patch: Partial<BrowseCardSettings>
  ) => {
    void updateSettings((current) => ({
      ...current,
      ui: {
        ...current.ui,
        browseCards: {
          ...current.ui.browseCards,
          [provider]: { ...current.ui.browseCards[provider], ...patch },
        },
      },
    }));
  };

  const updateBrowseProviderMode = (
    provider: BrowseCardProvider,
    mode: string
  ) => {
    if (!isBrowseCardMode(mode)) return;

    if (mode === "hidden") {
      updateBrowseProvider(provider, { enabled: false });
      return;
    }

    updateBrowseProvider(provider, {
      enabled: true,
      visibility: mode,
    });
  };

  const updateAnimeProvider = <P extends keyof PublicOptions["ui"]["animePages"]>(
    provider: P,
    patch: Partial<PublicOptions["ui"]["animePages"][P]>
  ) => {
    void updateSettings((current) => ({
      ...current,
      ui: {
        ...current.ui,
        animePages: {
          ...current.ui.animePages,
          [provider]: { ...current.ui.animePages[provider], ...patch },
        },
      },
    }));
  };

  if (!uiOptions) return null;

  return (
    <div className="space-y-10">
      {saveError ? (
        <p className="text-sm font-semibold text-error" role="alert">
          {saveError}
        </p>
      ) : null}

      <SettingsSection
        title="AniList display title language"
        description="Choose the AniList title language used in the media modal."
        icon={<Languages className="h-4 w-4" />}
        divider="none"
      >
        <SegmentedControl
          value={uiOptions.preferredAniListTitleLanguage}
          onChange={updateTitleLanguage}
          options={TITLE_LANGUAGE_OPTIONS}
          ariaLabel="Preferred AniList title language"
          className="w-full max-w-md"
          disabled={isSaving}
        />
      </SettingsSection>

      <SettingsSection
        title="AniList and AniChart browse cards"
        description="Enable browse and search card injection per provider, then choose whether enabled cards stay visible or only appear on hover."
        icon={<LayoutGrid className="h-4 w-4" />}
        divider="top"
      >
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[auto_auto_auto] lg:gap-8">
          <div className="flex h-30 items-start justify-center lg:w-20 lg:justify-start">
            <div
              aria-hidden="true"
              className="relative aspect-2/3 h-full shrink-0 overflow-hidden rounded-md shadow-sm"
            >
              <img
                src="https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-qQTzQnEJJ3oB.jpg"
                alt=""
                draggable={false}
                className="h-full w-full select-none object-cover"
              />
              <div className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#151f2e] bg-[#43d477]">
                <Check className="h-3.5 w-3.5 stroke-3 text-white" />
              </div>
            </div>
          </div>

          <div className="flex min-h-30 flex-col justify-center gap-4 lg:w-96">
            <div className="flex items-center gap-2.5 text-text-primary">
              <SonarrIcon className="h-5 w-5 shrink-0" />
              <Label id="ui-browse-sonarr-label" className="text-sm font-semibold">
                Show on Sonarr browse cards?
              </Label>
            </div>

            <SegmentedControl
              value={getBrowseCardMode(uiOptions.browseCards.sonarr)}
              onChange={(mode) => updateBrowseProviderMode("sonarr", mode)}
              options={BROWSE_CARD_MODE_OPTIONS}
              ariaLabelledBy="ui-browse-sonarr-label"
              disabled={isSaving}
            />
          </div>

          <div className="flex min-h-30 flex-col justify-center gap-4 lg:w-96">
            <div className="flex items-center gap-2.5 text-text-primary">
              <RadarrIcon className="h-5 w-5 shrink-0" />
              <Label id="ui-browse-radarr-label" className="text-sm font-semibold">
                Show on Radarr browse cards?
              </Label>
            </div>

            <SegmentedControl
              value={getBrowseCardMode(uiOptions.browseCards.radarr)}
              onChange={(mode) => updateBrowseProviderMode("radarr", mode)}
              options={BROWSE_CARD_MODE_OPTIONS}
              ariaLabelledBy="ui-browse-radarr-label"
              disabled={isSaving}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="AniList anime pages"
        description="Enable/disable the action bar above AniList's native page buttons for each provider."
        icon={<AppWindow className="h-4 w-4" />}
        divider="top"
      >
        <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-h-23 items-center justify-center rounded-lg border border-border-primary/40 bg-bg-tertiary/10 p-4 lg:w-56 lg:justify-start">
            <div
              aria-hidden="true"
              className="flex shrink-0 select-none flex-col gap-2"
            >
              <div className="flex h-8 w-45 gap-1.5">
                <div className="flex flex-1 items-center justify-between rounded bg-[#2b2d42] px-3 shadow-sm">
                  <span className="text-[11px] font-semibold text-[#8ba0b2]">In Provider</span>
                  <ChevronDown className="h-3.5 w-3.5 text-white opacity-80" />
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#3db4f2] shadow-sm">
                  <ExternalLink className="h-3.5 w-3.5 text-white opacity-90" />
                </div>
              </div>
              <div className="flex h-8 w-45 gap-1.5 opacity-70">
                <div className="flex flex-1 items-center justify-between rounded bg-[#3db4f2] px-3 shadow-sm">
                  <span className="text-[11px] font-semibold text-white">Add to List</span>
                  <ChevronDown className="h-3.5 w-3.5 text-white opacity-80" />
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#e13357] shadow-sm">
                  <Heart className="h-3.5 w-3.5 fill-current text-white" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-23 items-center rounded-lg border border-border-primary/40 bg-bg-tertiary/10 p-4">
            <div className="flex min-h-11 w-full items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2.5 text-text-primary">
                <SonarrIcon className="h-5 w-5 shrink-0" />
                <Label
                  htmlFor="ui-anime-sonarr"
                  className="cursor-pointer text-sm font-semibold"
                >
                  Show on Sonarr anime pages
                </Label>
              </div>
              <Switch
                id="ui-anime-sonarr"
                className="shrink-0"
                checked={uiOptions.animePages.sonarr.enabled}
                disabled={isSaving}
                onCheckedChange={(checked) =>
                  updateAnimeProvider("sonarr", { enabled: checked })
                }
              />
            </div>
          </div>

          <div className="flex min-h-23 items-center rounded-lg border border-border-primary/40 bg-bg-tertiary/10 p-4">
            <div className="flex min-h-11 w-full items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2.5 text-text-primary">
                <RadarrIcon className="h-5 w-5 shrink-0" />
                <Label
                  htmlFor="ui-anime-radarr"
                  className="cursor-pointer text-sm font-semibold"
                >
                  Show on Radarr anime pages
                </Label>
              </div>
              <Switch
                id="ui-anime-radarr"
                className="shrink-0"
                checked={uiOptions.animePages.radarr.enabled}
                disabled={isSaving}
                onCheckedChange={(checked) =>
                  updateAnimeProvider("radarr", { enabled: checked })
                }
              />
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
};
