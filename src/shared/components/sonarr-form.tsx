// src/shared/components/sonarr-form.tsx
import React, { useMemo, useCallback, useId } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import type {
  SonarrFormState,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrTag,
} from "@/shared/types";
import {
  FormField,
  Label,
  SelectField,
  SwitchField,
} from "./form";
import MultiTagInput from "./multi-tag-input";
import {
  MONITOR_OPTIONS_WITH_DESCRIPTIONS,
  SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS,
} from "@/shared/utils/constants";
import { cn } from "@/shared/utils/cn";

const DEFAULT_CONTAINER = "w-full rounded-xl bg-bg-secondary p-5";
export type SonarrFormLayout = "stacked" | "grid";

export interface SonarrFormMetadata {
  qualityProfiles: SonarrQualityProfile[];
  rootFolders: SonarrRootFolder[];
  tags: SonarrTag[];
}

export interface SonarrFormProps {
  form: UseFormReturn<SonarrFormState>;
  metadata: SonarrFormMetadata;
  disabled?: boolean;
  className?: string;
  portalContainer?: HTMLElement | ShadowRoot | null;
  initialFocusRef?: React.RefObject<HTMLButtonElement | null>;

  computedPath?: string | null;
  pathHintTitle?: string;
  pathHintTvdbId?: number | null;
  includeSearchToggle?: boolean;
  displayRootWithSlug?: boolean;
  folderSlug?: string | null;
  layout?: SonarrFormLayout;
}

// --- Helper Functions ---

function normalizePathSegment(segment: string): string {
  const replaced = segment.replace(/[\\/]+/g, " ");
  const trimmed = replaced.trim();
  return trimmed.replace(/\s+/g, " ");
}

function buildFolderSlug(
  folderSlug?: string | null,
  title?: string,
  tvdbId?: number | null,
): string | null {
  if (folderSlug && folderSlug.trim().length > 0) {
    return folderSlug.trim();
  }

  if (!title) return null;

  const normalizedTitle = normalizePathSegment(title);
  if (!normalizedTitle) return null;
  if (tvdbId == null) return normalizedTitle;

  return `${normalizedTitle} [tvdb-${tvdbId}]`;
}

function formatRootPath(rootPath: string, slug: string | null): string {
  if (!slug) return rootPath;

  const normalizedRoot =
    rootPath.endsWith("/") || rootPath.endsWith("\\")
      ? rootPath.slice(0, -1)
      : rootPath;

  return `${normalizedRoot}/${slug}`;
}

function ellipsize(value: string, maxLength = 60): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

function SonarrForm(props: SonarrFormProps): React.JSX.Element | null {
  const {
    form,
    metadata,
    disabled,
    className,
    portalContainer,
    initialFocusRef,
    computedPath,
    pathHintTitle,
    pathHintTvdbId,
    includeSearchToggle = true,
    displayRootWithSlug = false,
    folderSlug,
    layout = "stacked",
  } = props;

  const isGridLayout = layout === "grid";
  const fullWidthClass = isGridLayout ? "md:col-span-2" : undefined;
  const layoutClassName = isGridLayout
    ? "grid gap-4 md:grid-cols-2"
    : "flex flex-col gap-4";

  const effectiveMetadata: SonarrFormMetadata = metadata;
  const effectiveValues: SonarrFormState = form.watch();

  const setFieldValue = (
    field: keyof SonarrFormState,
    value: SonarrFormState[keyof SonarrFormState],
  ): void => {
    form.setValue(field, value, { shouldDirty: true, shouldValidate: true });
  };

  // --- Tag Logic ---

  const tagMaps = useMemo(() => {
    const idToLabel = new Map<number, string>();
    const labelToId = new Map<string, number>();

    for (const tag of metadata.tags) {
      if (tag.label && tag.label.trim().length > 0) {
        const trimmed = tag.label.trim();
        idToLabel.set(tag.id, trimmed);
        labelToId.set(trimmed, tag.id);
      }
    }

    return { idToLabel, labelToId };
  }, [metadata.tags]);

  const { idToLabel, labelToId } = tagMaps;

  const selectedExistingTagLabels = useMemo(
    () =>
      (effectiveValues.tags ?? [])
        .map(tagId => idToLabel.get(tagId))
        .filter(
          (label): label is string =>
            typeof label === "string" && label.length > 0,
        ),
    [effectiveValues.tags, idToLabel],
  );

  const freeformTagLabels = useMemo(
    () =>
      (effectiveValues.freeformTags ?? []).filter(
        (label): label is string =>
          typeof label === "string" && label.trim().length > 0,
      ),
    [effectiveValues.freeformTags],
  );

  const allSelectedTagLabels = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const label of [...selectedExistingTagLabels, ...freeformTagLabels]) {
      if (!seen.has(label)) {
        seen.add(label);
        result.push(label);
      }
    }

    return result;
  }, [selectedExistingTagLabels, freeformTagLabels]);

  const existingTagLabels = useMemo(
    () =>
      metadata.tags
        .map(t => t.label)
        .filter(
          (label): label is string =>
            typeof label === "string" && label.trim().length > 0,
        ),
    [metadata.tags],
  );

  const handleTagsChange = (labels: string[]) => {
    const uniqueLabels: string[] = [];
    const seen = new Set<string>();

    for (const label of labels) {
      if (!label) continue;
      if (seen.has(label)) continue;
      seen.add(label);
      uniqueLabels.push(label);
    }

    const tagIds: number[] = [];
    const freeform: string[] = [];

    for (const label of uniqueLabels) {
      const id = labelToId.get(label);
      if (typeof id === "number") {
        tagIds.push(id);
      } else {
        freeform.push(label);
      }
    }

    setFieldValue("tags", tagIds);
    setFieldValue("freeformTags", freeform);
  };

  // --- Display Logic ---

  const selectPortal = portalContainer ?? null;

  const computedSlug = useMemo(
    () => buildFolderSlug(folderSlug, pathHintTitle, pathHintTvdbId),
    [folderSlug, pathHintTitle, pathHintTvdbId],
  );

  const getRootDisplayPath = useCallback(
    (rootPath: string) => {
      if (!rootPath) return rootPath;
      return displayRootWithSlug ? formatRootPath(rootPath, computedSlug) : rootPath;
    },
    [computedSlug, displayRootWithSlug],
  );

  const formatFreeSpace = useCallback((bytes?: number | null): string | null => {
    if (bytes == null || Number.isNaN(bytes)) return null;
    const tebibyte = 1024 ** 4;
    const gibibyte = 1024 ** 3;
    if (bytes >= tebibyte) {
      return `${(bytes / tebibyte).toFixed(1)} TiB free`;
    }
    if (bytes >= gibibyte) {
      return `${(bytes / gibibyte).toFixed(1)} GiB free`;
    }
    return `${bytes.toLocaleString()} B free`;
  }, []);

  const showPathHint = Boolean(computedSlug);

  const selectedRootDisplay = useMemo(() => {
    if (!effectiveValues.rootFolderPath) return null;
    return getRootDisplayPath(effectiveValues.rootFolderPath) ?? effectiveValues.rootFolderPath;
  }, [effectiveValues.rootFolderPath, getRootDisplayPath]);

  const qualityProfileOptions = useMemo(() => {
    return effectiveMetadata.qualityProfiles.map((p) => ({
      value: String(p.id),
      label: p.name,
    }));
  }, [effectiveMetadata.qualityProfiles]);

  const containerClassName = cn(DEFAULT_CONTAINER, layoutClassName, className);
  const rootFolderFieldId = useId();

  // --- Render ---

  return (
    <div className={containerClassName}>
      {/* Root Folder */}
      <div className={cn("space-y-1", fullWidthClass)}>
        <label
          htmlFor={rootFolderFieldId}
          className="text-xs font-medium text-text-secondary"
        >
          Root Folder
        </label>
        <SelectPrimitive.Root
          disabled={!!disabled}
          value={effectiveValues.rootFolderPath}
          onValueChange={(v) => setFieldValue("rootFolderPath", v)}
        >
          <SelectPrimitive.Trigger
            id={rootFolderFieldId}
            ref={initialFocusRef as React.RefObject<HTMLButtonElement>}
            className="flex h-9 w-full min-w-0 items-center justify-between rounded-md bg-bg-primary px-3 py-2 text-sm text-left text-text-primary placeholder:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
          >
            <span className="flex min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap">
              <SelectPrimitive.Value placeholder="Select a folder...">
                {selectedRootDisplay ? (
                  <span
                    className="block min-w-0 truncate text-left"
                    title={selectedRootDisplay}
                  >
                    {ellipsize(selectedRootDisplay, 60)}
                  </span>
                ) : null}
              </SelectPrimitive.Value>
            </span>
            <SelectPrimitive.Icon asChild>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>
          <SelectPrimitive.Portal
            container={selectPortal as HTMLElement | ShadowRoot | null | undefined}
          >
            <SelectPrimitive.Content
              className="relative z-50 min-w-(--radix-select-trigger-width) max-w-[90vw] overflow-hidden rounded-md border border-bg-primary bg-bg-secondary text-text-primary shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
              position="popper"
            >
              <SelectPrimitive.Viewport className="w-full p-1">
                {effectiveMetadata.rootFolders.map((f) => {
                  const fullPath = getRootDisplayPath(f.path) ?? "";
                  const freeSpaceLabel = formatFreeSpace(f.freeSpace);
                  return (
                    <SelectPrimitive.Item
                      key={f.id}
                      value={f.path}
                      className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-bg-tertiary focus:text-text-primary data-[state=checked]:text-accent-primary"
                    >
                      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                        <SelectPrimitive.ItemIndicator>
                          <Check className="h-4 w-4" />
                        </SelectPrimitive.ItemIndicator>
                      </span>
                      <SelectPrimitive.ItemText asChild>
                        <div className="flex w-full items-center justify-between gap-4">
                          <span
                            className="min-w-0 truncate text-left"
                            title={fullPath || undefined}
                          >
                            {fullPath}
                          </span>
                          {freeSpaceLabel ? (
                            <span className="shrink-0 whitespace-nowrap text-xs text-text-tertiary">
                              {freeSpaceLabel}
                            </span>
                          ) : null}
                        </div>
                      </SelectPrimitive.ItemText>
                    </SelectPrimitive.Item>
                  );
                })}
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
      </div>

      {(Boolean(computedPath) || showPathHint) && showPathHint ? (
        <div className={cn("space-y-1", fullWidthClass)}>
          <p className="text-xs text-text-secondary">
            &apos;{computedSlug}&apos; subfolder will be created automatically.
          </p>
        </div>
      ) : null}

      {/* Monitor */}
      <SelectField
        label="Monitor"
        disabled={!!disabled}
        value={effectiveValues.monitorOption}
        onValueChange={(v) =>
          setFieldValue("monitorOption", v as SonarrFormState["monitorOption"])
        }
        options={MONITOR_OPTIONS_WITH_DESCRIPTIONS}
        container={selectPortal}
      />

      {/* Quality Profile */}
      <SelectField
        label="Quality Profile"
        disabled={!!disabled}
        value={String(effectiveValues.qualityProfileId)}
        onValueChange={(v) => setFieldValue("qualityProfileId", Number(v))}
        options={qualityProfileOptions}
        placeholder="Select a profile..."
        container={selectPortal}
      />

      {/* Series Type */}
      <SelectField
        label="Series Type"
        disabled={!!disabled}
        value={effectiveValues.seriesType}
        onValueChange={(v) =>
          setFieldValue("seriesType", v as SonarrFormState["seriesType"])
        }
        options={SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS}
        container={selectPortal}
      />

      {/* Tags */}
      <FormField>
        <div className="space-y-3">
          <Label>Tags</Label>
          <MultiTagInput
            value={allSelectedTagLabels}
            onChange={handleTagsChange}
            placeholder="Add tags..."
            disabled={!!disabled}
            existingTags={existingTagLabels}
          />
        </div>
      </FormField>

      {/* Toggles Grid */}
      <div className={cn("pt-1", fullWidthClass)}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SwitchField
            label="Season Folders"
            disabled={!!disabled}
            checked={effectiveValues.seasonFolder}
            onCheckedChange={(v) => setFieldValue("seasonFolder", v)}
            labelHelp={"Organize episodes into per-season subfolders created automatically."}
            labelHelpDelay={600}
            labelHelpContainer={selectPortal}
          />

          {includeSearchToggle ? (
            <>
              <SwitchField
                label="Search on Add"
                disabled={!!disabled}
                checked={effectiveValues.searchForMissingEpisodes}
                onCheckedChange={(v) =>
                  setFieldValue("searchForMissingEpisodes", v)
                }
                labelHelp={"Automatically trigger a search for any missing episodes once the series is added."}
                labelHelpDelay={600}
                labelHelpContainer={selectPortal}
              />

              <SwitchField
                label="Cutoff Unmet"
                disabled={!!disabled}
                checked={effectiveValues.searchForCutoffUnmet}
                onCheckedChange={(v) =>
                  setFieldValue("searchForCutoffUnmet", v)
                }
                labelHelp={"Trigger searches for episodes that are below the quality cutoff to find better releases."}
                labelHelpDelay={600}
                labelHelpContainer={selectPortal}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default SonarrForm;
