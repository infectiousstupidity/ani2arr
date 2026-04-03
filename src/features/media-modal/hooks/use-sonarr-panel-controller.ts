/** Controls Sonarr add/edit panel form state, submission, and computed path preview. */
// src/features/media-modal/hooks/use-sonarr-panel-controller.ts

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import type { SonarrFormState } from "@/shared/schemas/providers/sonarr-settings.schema";
import {
  buildProviderFolderSlugFromTitle,
  buildProviderMediaPath,
} from "@/shared/utils/provider-library-paths";
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

  // Only reset when mode or tvdbId changes, not on every initialForm change.
  // Intentionally excludes initialForm to prevent form reset when defaults change
  // in options page while modal is open in edit mode.
  useEffect(() => {
    form.reset(initialForm);
  }, [form, initialForm, mode, tvdbId]);

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
    () => {
      const slug =
        mode === "edit" && folderSlug
          ? folderSlug
          : buildProviderFolderSlugFromTitle(title, { tvdbId });
      return buildProviderMediaPath(current.rootFolderPath, slug);
    },
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
