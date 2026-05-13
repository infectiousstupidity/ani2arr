/** Coordinates saving extension settings from the options page. */
// src/options-page/hooks/use-save-settings.ts

import { useState, useCallback } from "react";
import { useSavePublicOptions } from "@/queries/options";
import type { PublicOptions } from "@/settings";
import { getActionErrorMessage } from "./action-helpers";

export function useSaveSettings() {
	const saveOptions = useSavePublicOptions();

	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const saveSettings = useCallback(
		async (formValues: PublicOptions) => {
			setIsSaving(true);
			setError(null);

			try {
				await saveOptions.mutateAsync(formValues);
				return true;
			} catch (error_) {
				setError(getActionErrorMessage(error_, "Failed to save settings."));
				return false;
			} finally {
				setIsSaving(false);
			}
		},
		[saveOptions],
	);

	return { saveSettings, isSaving, error };
}
