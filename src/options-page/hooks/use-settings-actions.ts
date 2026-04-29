/** Composes options-page settings actions from smaller provider and save hooks. */
// src/options-page/hooks/use-settings-actions.ts

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import {
	parseExtensionOptions,
	useSaveOptions,
	type ExtensionOptions,
} from "@/options";
import { useTestProviderConnection } from "@/providers/hooks/provider-connection.queries";
import { logger } from "@/shared/utils/logger";
import { hasUnsavedSettingsChanges } from "./provider-settings-actions.shared";
import { useProviderConnectionActions } from "./use-provider-connection-actions";
import { useSettingsSaveActions } from "./use-settings-save-actions";

export function useSettingsActions({
	savedSettings,
}: {
	savedSettings?: ExtensionOptions;
}) {
	const methods = useFormContext<ExtensionOptions>();
	const queryClient = useQueryClient();
	const saveOptions = useSaveOptions();
	const sonarrTestConnectionState = useTestProviderConnection();
	const radarrTestConnectionState = useTestProviderConnection();
	const [saveError, setSaveError] = useState<string | null>(null);
	const externalSavedSettings = useMemo(
		() => (savedSettings ? parseExtensionOptions(savedSettings) : undefined),
		[savedSettings],
	);
	const [savedSettingsOverride, setSavedSettingsOverride] = useState<
		ExtensionOptions | undefined
	>();
	const savedSettingsState = useMemo(() => {
		if (
			savedSettingsOverride &&
			!hasUnsavedSettingsChanges(savedSettingsOverride, externalSavedSettings)
		) {
			return externalSavedSettings;
		}

		return savedSettingsOverride ?? externalSavedSettings;
	}, [externalSavedSettings, savedSettingsOverride]);
	const savedSettingsRef = useRef<ExtensionOptions | undefined>(
		savedSettingsState,
	);
	const currentFormValues = useWatch({ control: methods.control });

	const setSavedSettings = useCallback(
		(nextSettings: ExtensionOptions | undefined) => {
			savedSettingsRef.current = nextSettings;
			setSavedSettingsOverride(nextSettings);
		},
		[],
	);

	useEffect(() => {
		savedSettingsRef.current = savedSettingsState;
	}, [savedSettingsState]);

	useEffect(() => {
		const subscription = methods.watch(() => {
			setSaveError((current) => (current == null ? current : null));
		});

		return () => subscription.unsubscribe();
	}, [methods]);

	const persistSettings = useCallback(
		async (nextSettings: ExtensionOptions): Promise<boolean> => {
			try {
				await saveOptions.mutateAsync(nextSettings);
				return true;
			} catch (error) {
				logger.error("Failed to save settings.", error);
				setSaveError("Failed to save settings. Please try again.");
				return false;
			}
		},
		[saveOptions],
	);

	const baseBusy =
		saveOptions.isPending ||
		sonarrTestConnectionState.isPending ||
		radarrTestConnectionState.isPending;

	const { handleSave, handleReset, isResetPending } = useSettingsSaveActions({
		methods,
		queryClient,
		savedSettingsRef,
		setSavedSettings,
		isBusy: baseBusy,
		setSaveError,
		persistSettings,
		sonarrTestConnectionState,
		radarrTestConnectionState,
	});

	const connectionActionBusy = baseBusy || isResetPending;

	const { connectProvider, disconnectProvider, connectPendingState } =
		useProviderConnectionActions({
			methods,
			queryClient,
			savedSettingsRef,
			setSavedSettings,
			isBusy: connectionActionBusy,
			setSaveError,
			persistSettings,
			sonarrTestConnectionState,
			radarrTestConnectionState,
		});

	const isBusy =
		connectionActionBusy ||
		connectPendingState.sonarr ||
		connectPendingState.radarr;

	const hasUnsavedChanges = useMemo(
		() =>
			hasUnsavedSettingsChanges(
				parseExtensionOptions(currentFormValues),
				savedSettingsState,
			),
		[currentFormValues, savedSettingsState],
	);

	return {
		handleSave,
		connectProvider,
		disconnectProvider,
		handleReset,
		hasUnsavedChanges,
		isBusy,
		saveError,
		saveState: saveOptions,
		sonarrTestConnectionState,
		radarrTestConnectionState,
		connectPendingState,
	};
}

export type SettingsActions = ReturnType<typeof useSettingsActions>;

export default useSettingsActions;
