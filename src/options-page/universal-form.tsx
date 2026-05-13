/** Root settings form provider and global save affordance for options page values. */
// src/options-page/universal-form.tsx

import React, { useEffect, useRef, useState } from "react";
import { FormProvider, useForm, useFormContext, useFormState } from "react-hook-form";
import { usePublicOptions, useSavePublicOptions } from "@/queries/options";
import {
	createDefaultExtensionOptions,
	toPublicOptions,
	type PublicOptions,
} from "@/settings";
import { Button } from "./components/ui/button";

export const UniversalFormProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: savedSettings, isLoading } = usePublicOptions();

  const form = useForm<PublicOptions>({
    defaultValues: toPublicOptions(createDefaultExtensionOptions()),
    mode: "onChange",
  });

  const hasHydratedFormRef = useRef(false);

  useEffect(() => {
    if (savedSettings && !hasHydratedFormRef.current) {
      form.reset(savedSettings);
      hasHydratedFormRef.current = true;
    }
  }, [savedSettings, form]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary text-text-secondary">
        Loading settings...
      </div>
    );
  }

  return <FormProvider {...form}>{children}</FormProvider>;
};

interface GlobalSaveButtonProps {
  className?: string;
  isCompact?: boolean;
  label?: string;
}

export const GlobalSaveButton = ({
  className,
  isCompact,
  label,
}: GlobalSaveButtonProps) => {
  const {
    handleSubmit,
    reset,
  } = useFormContext<PublicOptions>();
  const { isDirty } = useFormState<PublicOptions>();
  const saveOptions = useSavePublicOptions();
  const [error, setError] = useState<string | null>(null);
  const idleLabel = label ?? (isCompact ? "Save" : "Save changes");
  const pendingLabel = isCompact ? "..." : "Saving...";

  const onSubmit = handleSubmit(async (data) => {
    setError(null);
    try {
      const savedSettings = await saveOptions.mutateAsync(data);
      reset(savedSettings.publicOptions);
    } catch {
      setError("Failed to save settings.");
    }
  });

  return (
    <div className="flex items-center gap-3">
      {error && !isCompact && <span className="text-sm font-semibold text-error">{error}</span>}
      <Button
        variant="primary"
        onClick={onSubmit}
        disabled={!isDirty || saveOptions.isPending}
        className={className}
      >
        {saveOptions.isPending ? pendingLabel : idleLabel}
      </Button>
    </div>
  );
};
