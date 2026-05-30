/** Root settings form provider and global save affordance for options page values. */
// src/options-page/universal-form.tsx

import React, { useState } from "react";
import { FormProvider, useForm, useFormContext, useFormState } from "react-hook-form";
import { usePublicOptions, useSavePublicOptions } from "@/queries/options";
import type { PublicOptions } from "@/settings";
import { Button } from "./components/ui/button";

const InitializedFormProvider = ({
  savedSettings,
  children,
}: {
  savedSettings: PublicOptions;
  children: React.ReactNode;
}) => {
  const form = useForm<PublicOptions>({
    defaultValues: savedSettings,
    mode: "onChange",
  });

  return <FormProvider {...form}>{children}</FormProvider>;
};

export const UniversalFormProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: savedSettings, isLoading } = usePublicOptions();

  if (isLoading || !savedSettings) {
    return (
      <div className="flex h-screen items-center justify-center text-text-secondary">
        Loading settings...
      </div>
    );
  }

  return (
    <InitializedFormProvider savedSettings={savedSettings}>
      {children}
    </InitializedFormProvider>
  );
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
  const { handleSubmit, reset } = useFormContext<PublicOptions>();
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
