/** Coordinates full extension reset from the options page and refreshes local UI state. */
// src/options-page/hooks/use-reset-extension-state.ts

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAni2arrApi } from "@/rpc";
import { queryKeys } from "@/queries/query-keys";
import { createDefaultExtensionOptions } from "@/settings/schema";
import { toPublicOptions } from "@/settings/store";
import { getActionErrorMessage } from "./action-helpers";

export function useResetExtensionState() {
	const queryClient = useQueryClient();
	const [isResetting, setIsResetting] = useState(false);
	const [resetError, setResetError] = useState<string | null>(null);
	const [resetSuccess, setResetSuccess] = useState(false);

	const resetExtensionState = useCallback(async () => {
		setIsResetting(true);
		setResetError(null);
		setResetSuccess(false);

		try {
			await getAni2arrApi().resetExtensionState();

			const extensionOptions = createDefaultExtensionOptions();
			const publicOptions = toPublicOptions(extensionOptions);

			queryClient.setQueryData(queryKeys.options(), extensionOptions);
			queryClient.setQueryData(queryKeys.publicOptions(), publicOptions);
			await queryClient.invalidateQueries({ queryKey: queryKeys.all });

			setResetSuccess(true);
			return true;
		} catch (error) {
			setResetError(
				getActionErrorMessage(error, "Failed to reset extension state."),
			);
			return false;
		} finally {
			setIsResetting(false);
		}
	}, [queryClient]);

	return {
		resetExtensionState,
		isResetting,
		resetError,
		resetSuccess,
	};
}
