import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import type { RadarrFormState } from "@/shared/types";
import { buildComputedMediaPath } from "@/services/helpers/path-utils";
import type { RadarrPanelBaseProps, RadarrPanelMode } from "../types";

export interface UseRadarrPanelControllerInput {
  mode: RadarrPanelMode;
  initialForm: RadarrFormState;
  defaultForm: RadarrFormState;
  metadata: RadarrPanelBaseProps["metadata"];
  folderSlug?: string | null;
  disabled: boolean | undefined;
  onSubmit(form: RadarrFormState): Promise<void>;
  onSaveDefaults(form: RadarrFormState): Promise<void>;
}

export interface UseRadarrPanelControllerResult {
  form: UseFormReturn<RadarrFormState>;
  current: RadarrFormState;

  isSubmitting: boolean;
  canSubmit: boolean;
  showSaveDefaults: boolean;
  isSavingDefaults: boolean;

  handleFieldChange<K extends keyof RadarrFormState>(
    key: K,
    value: RadarrFormState[K],
  ): void;
  handlePrimarySubmit(): Promise<void>;
  handleSaveDefaults(): Promise<void>;

  computedPath: string | null;
}

export function useRadarrPanelController(
  input: UseRadarrPanelControllerInput,
): UseRadarrPanelControllerResult {
  const {
    mode,
    initialForm,
    defaultForm,
    metadata,
    folderSlug,
    disabled,
    onSubmit,
    onSaveDefaults,
  } = input;

  const form = useForm<RadarrFormState>({
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
    () => buildComputedMediaPath(current.rootFolderPath, folderSlug),
    [current.rootFolderPath, folderSlug],
  );

  const handleFieldChange = useCallback(
    (key: keyof RadarrFormState, value: RadarrFormState[keyof RadarrFormState]) => {
      form.setValue(key as never, value as never, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [form],
  );

  const handlePrimarySubmit = useCallback(async () => {
    if (!canSubmit || disabled || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const values = current;
      await form.handleSubmit(async submittedValues => {
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
