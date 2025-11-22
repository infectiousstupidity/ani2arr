// src/features/media-modal/hooks/use-sonarr-panel-controller.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import type { SonarrFormState } from "@/shared/types";
import type { SonarrPanelBaseProps, SonarrPanelMode } from "../types";

export interface UseSonarrPanelControllerInput {
  mode: SonarrPanelMode;
  initialForm: SonarrFormState;
  defaultForm: SonarrFormState;
  metadata: SonarrPanelBaseProps["metadata"];
  title: string;
  tvdbId: number | null;
  folderSlug?: string | null;
  disabled: boolean | undefined;
  onSubmit(form: SonarrFormState): Promise<void>;
  onSaveDefaults(form: SonarrFormState): Promise<void>;
}

export interface UseSonarrPanelControllerResult {
  form: UseFormReturn<SonarrFormState>;
  current: SonarrFormState;

  isSubmitting: boolean;
  canSubmit: boolean;
  showSaveDefaults: boolean;
  isSavingDefaults: boolean;

  handleFieldChange<K extends keyof SonarrFormState>(
    key: K,
    value: SonarrFormState[K],
  ): void;
  handlePrimarySubmit(): Promise<void>;
  handleSaveDefaults(): Promise<void>;

  computedPath: string | null;
}

function normalizePathSegment(segment: string): string {
  const replaced = segment.replace(/[\\/]+/g, " ");
  const trimmed = replaced.trim();
  return trimmed.replace(/\s+/g, " ");
}

function buildSlug(title: string, tvdbId: number | null): string | null {
  if (!title) return null;
  const normalizedTitle = normalizePathSegment(title);
  if (!normalizedTitle) return null;
  if (tvdbId == null) return normalizedTitle;
  return `${normalizedTitle} [tvdb-${tvdbId}]`;
}

function computePath(
  rootFolderPath: string,
  title: string,
  tvdbId: number | null,
  mode: SonarrPanelMode,
  folderSlug?: string | null,
): string | null {
  if (!rootFolderPath || !title || tvdbId == null) {
    return null;
  }

  const normalizedRoot =
    rootFolderPath.endsWith("/") || rootFolderPath.endsWith("\\")
      ? rootFolderPath.slice(0, -1)
      : rootFolderPath;

  const slug = mode === "edit" && folderSlug ? folderSlug : buildSlug(title, tvdbId);
  if (!slug) return null;

  return `${normalizedRoot}/${slug}`;
}

export function useSonarrPanelController(
  input: UseSonarrPanelControllerInput,
): UseSonarrPanelControllerResult {
  const {
    mode,
    initialForm,
    defaultForm,
    metadata,
    title,
    tvdbId,
    folderSlug,
    disabled,
    onSubmit,
    onSaveDefaults,
  } = input;

  const form = useForm<SonarrFormState>({
    defaultValues: initialForm,
    mode: "onChange",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);

  useEffect(() => {
    form.reset(initialForm);
  }, [form, initialForm, mode]);

  const current = form.watch();

  const hasRequiredMetadata = Boolean(metadata && metadata.qualityProfiles && metadata.rootFolders);

  const canSubmit = useMemo(() => {
    if (disabled || !hasRequiredMetadata) {
      return false;
    }

    const hasRootFolder =
      typeof current.rootFolderPath === "string" && current.rootFolderPath.length > 0;
    const hasQualityProfile = Boolean(current.qualityProfileId);

    if (!hasRootFolder || !hasQualityProfile) {
      return false;
    }

    if (mode === "edit") {
      return form.formState.isDirty;
    }

    return true;
  }, [
    current.qualityProfileId,
    current.rootFolderPath,
    disabled,
    form.formState.isDirty,
    hasRequiredMetadata,
    mode,
  ]);

  const showSaveDefaults = useMemo(() => {
    const currentJson = JSON.stringify(current);
    const defaultJson = JSON.stringify(defaultForm);
    return currentJson !== defaultJson;
  }, [current, defaultForm]);

  const computedPath = useMemo(
    () => computePath(current.rootFolderPath, title, tvdbId, mode, folderSlug),
    [current.rootFolderPath, folderSlug, mode, title, tvdbId],
  );

  const handleFieldChange = useCallback(
    (key: keyof SonarrFormState, value: SonarrFormState[keyof SonarrFormState]) => {
      form.setValue(key as never, value as never, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [form],
  );

  const handlePrimarySubmit = useCallback(async () => {
    if (!canSubmit || disabled) {
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const values = current;
      await form.handleSubmit(async (submittedValues) => {
        await onSubmit(submittedValues);
      })();
      form.reset(values);
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, current, disabled, form, isSubmitting, onSubmit]);

  const handleSaveDefaults = useCallback(async () => {
    if (!showSaveDefaults || isSavingDefaults) {
      return;
    }

    setIsSavingDefaults(true);
    try {
      await onSaveDefaults(current);
    } finally {
      setIsSavingDefaults(false);
    }
  }, [current, isSavingDefaults, onSaveDefaults, showSaveDefaults]);

  return {
    form,
    current,
    isSubmitting,
    canSubmit,
    showSaveDefaults,
    isSavingDefaults,
    handleFieldChange,
    handlePrimarySubmit,
    handleSaveDefaults,
    computedPath,
  };
}
