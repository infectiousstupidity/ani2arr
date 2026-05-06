/** Whole-form save and reset actions for the options page. */
// src/options-page/hooks/use-settings-save-actions.ts

import {
	useCallback,
	useState,
	type Dispatch,
	type RefObject,
	type SetStateAction,
} from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import { getAni2arrApi } from "@/rpc";
import {
	createDefaultExtensionOptions,
	parseExtensionOptions,
	type ExtensionOptions,
} from "@/options";
import { PROVIDERS } from "@/providers";
import type { Provider } from "@/providers";
import {
	invalidateAllSettingsQueries,
	invalidateProviderDependentQueries,
	invalidateProviderQueries,
} from "../provider-settings-effects";
import {
	buildNormalizedProviderSettings,
	cleanupPreviousPermission,
	getNormalizedConnectionOrSetError,
	hasConnectionChanged,
	hasUnsavedSettingsChanges,
	requestPermissionIfNeededOrSetError,
	resetProviderTestState,
	testProviderConnectionOrSetError,
	notifyProviderChanges,
	type ProviderTestConnectionState,
} from "./provider-settings-actions.shared";

type PersistSettings = (nextSettings: ExtensionOptions) => Promise<boolean>;
type SetSavedSettings = (nextSettings: ExtensionOptions | undefined) => void;

export function useSettingsSaveActions({
	methods,
	queryClient,
	savedSettingsRef,
	setSavedSettings,
	isBusy,
	setSaveError,
	persistSettings,
	sonarrTestConnectionState,
	radarrTestConnectionState,
}: {
	methods: UseFormReturn<ExtensionOptions>;
	queryClient: QueryClient;
	savedSettingsRef: RefObject<ExtensionOptions | undefined>;
	setSavedSettings: SetSavedSettings;
	isBusy: boolean;
	setSaveError: Dispatch<SetStateAction<string | null>>;
	persistSettings: PersistSettings;
	sonarrTestConnectionState: ProviderTestConnectionState;
	radarrTestConnectionState: ProviderTestConnectionState;
}) {
	const [isResetPending, setIsResetPending] = useState(false);

	const refreshChangedProviders = useCallback(
		async (
			changedProviders: Provider[],
			disconnectedProviders: Provider[],
		): Promise<boolean> => {
			return notifyProviderChanges(
				queryClient,
				{ changedProviders, disconnectedProviders },
				setSaveError,
			);
		},
		[queryClient, setSaveError],
	);

	const handleSave = useCallback(async (): Promise<boolean> => {
		const hasUnsavedChanges = hasUnsavedSettingsChanges(
			parseExtensionOptions(methods.getValues()),
			savedSettingsRef.current,
		);

		if (isBusy || !hasUnsavedChanges) {
			return false;
		}

		setSaveError(null);

		if (!(await methods.trigger())) {
			return false;
		}

		const nextSettings = parseExtensionOptions(methods.getValues());
		const previousSettings =
			savedSettingsRef.current ?? createDefaultExtensionOptions();

		// Use a loop so TypeScript naturally eliminates `undefined` types on early return
		const providerStates = [];
		for (const provider of PROVIDERS) {
			const current = getNormalizedConnectionOrSetError(
				setSaveError,
				nextSettings,
				provider,
			);
			const previous = getNormalizedConnectionOrSetError(
				setSaveError,
				previousSettings,
				provider,
			);

			if (current === undefined || previous === undefined) {
				return false; // Bails out instantly if normalization fails
			}

			providerStates.push({
				provider,
				current,
				previous,
				changed: hasConnectionChanged(current, previous),
			});
		}

		const changedProviders = providerStates
			.filter((s) => s.changed)
			.map((s) => s.provider);
		const disconnectedProviders = providerStates
			.filter((s) => s.changed && !s.current)
			.map((s) => s.provider);

		// Verify permissions and test newly configured connections
		for (const { provider, current, previous, changed } of providerStates) {
			if (
				!(await requestPermissionIfNeededOrSetError(
					provider,
					current,
					previous,
					setSaveError,
				))
			) {
				return false;
			}

			if (changed) {
				resetProviderTestState(
					provider,
					sonarrTestConnectionState,
					radarrTestConnectionState,
				);
				if (current) {
					const connectionInfo = await testProviderConnectionOrSetError({
						provider,
						credentials: {
							url: current.url,
							apiKey: current.apiKey,
						},
						sonarrTestConnectionState,
						radarrTestConnectionState,
						setSaveError,
					});
					if (!connectionInfo) return false;
				}
			}
		}

		// Dynamically build the nested provider settings object
		const updatedProviderSettings: ExtensionOptions["providers"] =
			{} as ExtensionOptions["providers"];
		for (const state of providerStates) {
			updatedProviderSettings[state.provider] = buildNormalizedProviderSettings(
				previousSettings,
				nextSettings,
				state.provider,
				state.current,
			);
		}

		const normalizedSettings: ExtensionOptions = {
			...nextSettings,
			providers: updatedProviderSettings,
		};

		const persisted = await persistSettings(normalizedSettings);
		if (!persisted) {
			return false;
		}

		setSavedSettings(normalizedSettings);
		methods.reset(normalizedSettings);

		const refreshed = await refreshChangedProviders(
			changedProviders,
			disconnectedProviders,
		);

		// Post-save cleanup and invalidation
		for (const { provider, previous, changed } of providerStates) {
			await cleanupPreviousPermission(
				provider,
				previous,
				normalizedSettings,
			);

			if (changed) {
				invalidateProviderQueries(queryClient, provider);
				invalidateProviderDependentQueries(queryClient, provider);
			}
		}

		return refreshed;
	}, [
		isBusy,
		methods,
		persistSettings,
		queryClient,
		refreshChangedProviders,
		savedSettingsRef,
		setSavedSettings,
		setSaveError,
		radarrTestConnectionState,
		sonarrTestConnectionState,
	]);

	const handleReset = useCallback(async (): Promise<void> => {
		if (isBusy || isResetPending) {
			return;
		}

		setSaveError(null);
		const defaults = createDefaultExtensionOptions();
		setIsResetPending(true);

		try {
			await getAni2arrApi().resetExtensionState();
			methods.reset(defaults);
			setSavedSettings(defaults);
		} finally {
			setIsResetPending(false);
			invalidateAllSettingsQueries(queryClient);
		}
	}, [
		isBusy,
		isResetPending,
		methods,
		queryClient,
		setSavedSettings,
		setSaveError,
	]);

	return {
		handleSave,
		handleReset,
		isResetPending,
	};
}
