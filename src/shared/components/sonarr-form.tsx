// src/shared/components/sonarr-form.tsx
import React, { useMemo, useCallback } from "react";
import type { UseFormReturn } from "react-hook-form";
import type {
  SonarrFormState,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrTag,
} from "@/shared/types";
import {
  FormField,
  FormLabel,
  FormControl,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Switch,
  FormItem,
} from "./form";
import MultiTagInput from "./multi-tag-input";
import {
  MONITOR_OPTIONS_WITH_DESCRIPTIONS,
  SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS,
} from "@/shared/utils/constants";

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
}

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

function ellipsize(text?: string | null, max = 60): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 3)) + "...";
}

function formatRootPath(rootPath: string, slug: string | null): string {
  if (!slug) return rootPath;

  const normalizedRoot =
    rootPath.endsWith("/") || rootPath.endsWith("\\")
      ? rootPath.slice(0, -1)
      : rootPath;

  return `${normalizedRoot}/${slug}`;
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
  } = props;

  const effectiveMetadata: SonarrFormMetadata = metadata;
  const effectiveValues: SonarrFormState = form.watch();

  const setFieldValue = (
    field: keyof SonarrFormState,
    value: SonarrFormState[keyof SonarrFormState],
  ): void => {
    form.setValue(field, value, { shouldDirty: true, shouldValidate: true });
  };

  // Map Sonarr tag ids <-> labels from metadata
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

  // Labels for tags that already exist in Sonarr (from numeric ids)
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

  // Labels the user entered that do not yet exist as Sonarr tags
  const freeformTagLabels = useMemo(
    () =>
      (effectiveValues.freeformTags ?? []).filter(
        (label): label is string =>
          typeof label === "string" && label.trim().length > 0,
      ),
    [effectiveValues.freeformTags],
  );

  // Combined list passed to MultiTagInput (deduplicated)
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

  // All existing tag labels (for suggestions)
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

  const selectedRootDisplay = effectiveValues.rootFolderPath
    ? getRootDisplayPath(effectiveValues.rootFolderPath)
    : undefined;

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

  // Split labels into existing tag ids and freeform labels
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

  const showComputedPath = Boolean(computedPath);
  const showPathHint = Boolean(computedSlug);

  const containerClassName =
    (className ? `${className} ` : "") +
    "w-full rounded-xl bg-bg-secondary p-5";

  const selectItemClassName =
    "cursor-pointer outline-none focus:bg-bg-tertiary focus:text-text-primary data-[state=checked]:bg-bg-secondary data-[state=checked]:text-text-primary";

  return (
    <div className={containerClassName}>
      <div className="space-y-4">
        {/* Root folder */}
        <div className="space-y-1">
          <FormField>
            <FormItem vertical>
              <FormLabel className="text-xs font-medium text-text-secondary">
                Root Folder
              </FormLabel>
              <FormControl className="w-full min-w-0">
                <Select
                  disabled={!!disabled}
                  value={effectiveValues.rootFolderPath}
                  onValueChange={v => setFieldValue("rootFolderPath", v)}
                >
                  <SelectTrigger
                    ref={initialFocusRef}
                    className="min-w-0 cursor-pointer text-left text-text-primary"
                  >
                    <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                      <SelectValue placeholder="Select a folder...">
                        {selectedRootDisplay ? (
                          <span
                            className="block min-w-0 truncate text-left"
                            title={selectedRootDisplay}
                          >
                            {ellipsize(selectedRootDisplay, 60)}
                          </span>
                        ) : null}
                      </SelectValue>
                    </span>
                  </SelectTrigger>
                  <SelectContent
                    container={selectPortal}
                    className="min-w-(--radix-select-trigger-width) max-w-[90vw]"
                  >
                    {effectiveMetadata.rootFolders.map(f => {
                      const fullPath = getRootDisplayPath(f.path) ?? "";
                      const freeSpaceLabel = formatFreeSpace(f.freeSpace);
                      return (
                        <SelectItem
                          key={f.id}
                          value={f.path}
                          className={selectItemClassName}
                        >
                          <div className="flex w-full items-center justify-between gap-4">
                            <span
                              className="whitespace-nowrap text-left"
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
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </FormControl>
            </FormItem>
          </FormField>

          {(showComputedPath && computedPath) || showPathHint ? (
            <div className="space-y-1">
              {showPathHint ? (
                <p className="text-xs text-text-secondary">
                  &apos;{computedSlug}&apos; subfolder will be created automatically.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Monitor */}
        <div className="space-y-1">
          <FormField>
            <FormItem vertical>
              <FormLabel className="text-xs font-medium text-text-secondary">Monitor</FormLabel>
              <FormControl className="w-full">
                <Select
                  disabled={!!disabled}
                  value={effectiveValues.monitorOption}
                  onValueChange={v =>
                    setFieldValue("monitorOption", v as SonarrFormState["monitorOption"])
                  }
                >
                  <SelectTrigger className="cursor-pointer text-text-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent container={selectPortal}>
                    {MONITOR_OPTIONS_WITH_DESCRIPTIONS.map(o => (
                      <SelectItem
                        key={o.value}
                        value={o.value}
                        className={selectItemClassName}
                      >
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
            </FormItem>
          </FormField>
        </div>

        {/* Quality profile */}
        <div className="space-y-1">
          <FormField>
            <FormItem vertical>
              <FormLabel className="text-xs font-medium text-text-secondary">
                Quality Profile
              </FormLabel>
              <FormControl className="w-full">
                <Select
                  disabled={!!disabled}
                  value={String(effectiveValues.qualityProfileId)}
                  onValueChange={v => setFieldValue("qualityProfileId", Number(v))}
                >
                  <SelectTrigger className="cursor-pointer text-text-primary">
                    <SelectValue placeholder="Select a profile..." />
                  </SelectTrigger>
                  <SelectContent container={selectPortal}>
                    {effectiveMetadata.qualityProfiles.map(p => (
                      <SelectItem
                        key={p.id}
                        value={String(p.id)}
                        className={selectItemClassName}
                      >
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
            </FormItem>
          </FormField>
        </div>

        {/* Series type */}
        <div className="space-y-1">
          <FormField>
            <FormItem vertical>
              <FormLabel className="text-xs font-medium text-text-secondary">
                Series Type
              </FormLabel>
              <FormControl className="w-full">
                <Select
                  disabled={!!disabled}
                  value={effectiveValues.seriesType}
                  onValueChange={v =>
                    setFieldValue("seriesType", v as SonarrFormState["seriesType"])
                  }
                >
                  <SelectTrigger className="cursor-pointer text-text-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent container={selectPortal}>
                    {SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS.map(o => (
                      <SelectItem
                        key={o.value}
                        value={o.value}
                        className={selectItemClassName}
                      >
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
            </FormItem>
          </FormField>
        </div>

        {/* Tags */}
        <div className="space-y-1">
          <FormField>
            <FormItem vertical>
              <FormLabel className="text-xs font-medium text-text-secondary">Tags</FormLabel>
              <FormControl className="w-full">
                <MultiTagInput
                  value={allSelectedTagLabels}
                  onChange={handleTagsChange}
                  placeholder="Add tags..."
                  disabled={!!disabled}
                  existingTags={existingTagLabels}
                />
              </FormControl>
            </FormItem>
          </FormField>
        </div>
        
        {/* Toggles */}
        <div className="space-y-1.5 pt-1">
          <FormField>
            <FormItem vertical>
              <FormLabel className="text-xs font-medium text-text-secondary">
                Season Folders
              </FormLabel>
              <FormControl className="flex justify-start">
                <Switch
                  disabled={!!disabled}
                  checked={effectiveValues.seasonFolder}
                  onCheckedChange={v => setFieldValue("seasonFolder", v)}
                />
              </FormControl>
            </FormItem>
          </FormField>

          {includeSearchToggle ? (
            <FormField>
              <FormItem vertical>
                <FormLabel className="text-xs font-medium text-text-secondary">
                  Search on Add
                </FormLabel>
                <FormControl className="flex justify-start">
                  <Switch
                    disabled={!!disabled}
                    checked={effectiveValues.searchForMissingEpisodes}
                    onCheckedChange={v => setFieldValue("searchForMissingEpisodes", v)}
                  />
                </FormControl>
              </FormItem>
            </FormField>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default SonarrForm;
