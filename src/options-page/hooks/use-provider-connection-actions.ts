/** Explicit provider connect and disconnect actions for settings panels. */
// src/options-page/hooks/use-provider-connection-actions.ts

import {
	useCallback,
	useRef,
	useState,
	type Dispatch,
	type RefObject,
	type SetStateAction,
} from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import {
	createDefaultExtensionOptions,
	parseExtensionOptions,
	type ExtensionOptions,
} from "@/options";
import { getProviderConnectionScope } from "@/providers/settings/provider-connection.validation";
import { queryKeys } from "@/shared/queries/query-keys";
import { getAni2arrApi } from "@/rpc";
import { getProviderLabel } from "@/providers/provider-labels";
import type {
	Provider,
	ProviderCredentials,
	ProviderFormOptions,
} from "@/providers";
import {
	invalidateProviderDependentQueries,
	invalidateProviderQueries,
	removeProviderQueries,
} from "../provider-settings-effects";
import {
	buildNormalizedProviderSettings,
	cleanupPreviousPermission,
	getNormalizedConnectionOrSetError,
	hasConnectionChanged,
	mergeProviderSettingsIntoForm,
	normalizeConnectionInputOrSetError,
	notifyProviderChanges,
	requestPermissionForCredentialsOrSetError,
	resetProviderTestState,
	testProviderConnectionOrSetError,
	type ProviderTestConnectionState,
} from "./provider-settings-actions.shared";
import { bootstrapProviderDefaults } from "./provider-default-bootstrapping.shared";

type PersistSettings = (nextSettings: ExtensionOptions) => Promise<boolean>;
type SetSavedSettings = (nextSettings: ExtensionOptions) => void;
type ProviderConnectPendingState = Record<Provider, boolean>;
type ProviderDefaults =
	| ExtensionOptions["providers"]["sonarr"]["defaults"]
	| ExtensionOptions["providers"]["radarr"]["defaults"];
type ProviderConnectionInfo = { version: string };

function seedProviderConnectionQueries(input: {
	queryClient: QueryClient;
	provider: Provider;
	credentials: ProviderCredentials;
	formOptions: ProviderFormOptions;
	connectionInfo: ProviderConnectionInfo;
}): void {
	const { queryClient, provider, credentials, formOptions, connectionInfo } =
		input;
	const scope = getProviderConnectionScope(credentials);

	if (provider === "sonarr") {
		queryClient.setQueryData(queryKeys.sonarrFormOptions(scope), formOptions);
		queryClient.setQueryData(queryKeys.sonarrConnection(scope), connectionInfo);
		return;
	}

	queryClient.setQueryData(queryKeys.radarrFormOptions(scope), formOptions);
	queryClient.setQueryData(queryKeys.radarrConnection(scope), connectionInfo);
}

export function useProviderConnectionActions({
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
	const [connectPendingState, setConnectPendingState] =
		useState<ProviderConnectPendingState>({
			sonarr: false,
			radarr: false,
		});
	const inFlightConnectRequestsRef = useRef<
		Partial<Record<Provider, Promise<boolean>>>
	>({});

	const setProviderConnectPending = useCallback(
		(provider: Provider, isPending: boolean) => {
			setConnectPendingState((current) => {
				if (current[provider] === isPending) {
					return current;
				}

				return {
					...current,
					[provider]: isPending,
				};
			});
		},
		[],
	);

	const fetchProviderFormOptions = useCallback(
		async (provider: Provider, credentials: ProviderCredentials) => {
			const api = getAni2arrApi();
			return provider === "sonarr"
				? api.getSonarrFormOptions({ credentials })
				: api.getRadarrFormOptions({ credentials });
		},
		[],
	);

	const saveProviderConnection = useCallback(
		async (
			provider: Provider,
			input?: {
				currentConnectionOverride?: ProviderCredentials;
				defaultsOverride?: ProviderDefaults;
				formOptionsOverride?: ProviderFormOptions;
				connectionInfoOverride?: ProviderConnectionInfo;
			},
		): Promise<boolean> => {
			if (isBusy) {
				return false;
			}

			setSaveError(null);

			const nextSettings = parseExtensionOptions(methods.getValues());
			const previousSettings =
				savedSettingsRef.current ?? createDefaultExtensionOptions();
			const currentConnection =
				input?.currentConnectionOverride === undefined
					? getNormalizedConnectionOrSetError(
							setSaveError,
							nextSettings,
							provider,
						)
					: normalizeConnectionInputOrSetError(
							setSaveError,
							input.currentConnectionOverride,
							provider,
						);
			const previousConnection = getNormalizedConnectionOrSetError(
				setSaveError,
				previousSettings,
				provider,
			);

			if (currentConnection === undefined || previousConnection === undefined) {
				return false;
			}

			if (currentConnection === null) {
				setSaveError(
					`Please enter a valid ${getProviderLabel(provider)} URL and API key.`,
				);
				return false;
			}

			const titleChanged =
				nextSettings.providers[provider].preferredAniListTitleLanguage !==
				previousSettings.providers[provider].preferredAniListTitleLanguage;
			const connectionChanged = hasConnectionChanged(
				currentConnection,
				previousConnection,
			);

			if (!connectionChanged && !titleChanged) {
				return true;
			}

			const normalizedSettings: ExtensionOptions = {
				...previousSettings,
				providers: {
					...previousSettings.providers,
					[provider]: {
						...buildNormalizedProviderSettings(
							previousSettings,
							nextSettings,
							provider,
							currentConnection,
						),
						defaults:
							input?.defaultsOverride ??
							nextSettings.providers[provider].defaults,
					},
				},
			};

			const persisted = await persistSettings(normalizedSettings);
			if (!persisted) {
				return false;
			}

			const mergedFormSettings = mergeProviderSettingsIntoForm(
				nextSettings,
				provider,
				normalizedSettings.providers[provider],
			);

			setSavedSettings(normalizedSettings);
			methods.reset(mergedFormSettings);

			if (input?.formOptionsOverride && input.connectionInfoOverride) {
				seedProviderConnectionQueries({
					queryClient,
					provider,
					credentials: {
						url: normalizedSettings.providers[provider].url,
						apiKey: normalizedSettings.providers[provider].apiKey,
					},
					formOptions: input.formOptionsOverride,
					connectionInfo: input.connectionInfoOverride,
				});
			}

			const refreshed = await notifyProviderChanges(
				queryClient,
				{
					changedProviders: connectionChanged ? [provider] : [],
				},
				setSaveError,
			);

			await cleanupPreviousPermission(
				provider,
				previousConnection,
				normalizedSettings,
				"save",
			);

			if (connectionChanged) {
				invalidateProviderQueries(queryClient, provider);
				invalidateProviderDependentQueries(queryClient, provider);
			}

			return refreshed;
		},
		[
			isBusy,
			methods,
			persistSettings,
			queryClient,
			savedSettingsRef,
			setSavedSettings,
			setSaveError,
		],
	);

	const connectProvider = useCallback(
		async (
			provider: Provider,
			credentials: ProviderCredentials,
		): Promise<boolean> => {
			if (isBusy) {
				return false;
			}

			const existingRequest = inFlightConnectRequestsRef.current[provider];
			if (existingRequest) {
				return existingRequest;
			}

			const connectRequest = (async (): Promise<boolean> => {
				setProviderConnectPending(provider, true);
				setSaveError(null);

				const normalizedConnection = normalizeConnectionInputOrSetError(
					setSaveError,
					credentials,
					provider,
				);
				if (!normalizedConnection) {
					return false;
				}

				const granted = await requestPermissionForCredentialsOrSetError(
					provider,
					normalizedConnection,
					setSaveError,
				);
				if (!granted) {
					return false;
				}

				const connectionInfo = await testProviderConnectionOrSetError({
					provider,
					credentials: normalizedConnection,
					sonarrTestConnectionState,
					radarrTestConnectionState,
					setSaveError,
				});
				if (!connectionInfo) {
					return false;
				}

				let formOptions;
				try {
					formOptions = await fetchProviderFormOptions(
						provider,
						normalizedConnection,
					);
				} catch {
					setSaveError(
						`Connected to ${getProviderLabel(provider)}, but failed to load provider defaults.`,
					);
					return false;
				}

				const nextSettings = parseExtensionOptions(methods.getValues());
				const bootstrappedDefaults =
					provider === "sonarr"
						? bootstrapProviderDefaults(
								"sonarr",
								nextSettings.providers.sonarr.defaults,
								formOptions,
							)
						: bootstrapProviderDefaults(
								"radarr",
								nextSettings.providers.radarr.defaults,
								formOptions,
							);

				return saveProviderConnection(provider, {
					currentConnectionOverride: normalizedConnection,
					defaultsOverride: bootstrappedDefaults,
					formOptionsOverride: formOptions,
					connectionInfoOverride: connectionInfo,
				});
			})().finally(() => {
				delete inFlightConnectRequestsRef.current[provider];
				setProviderConnectPending(provider, false);
			});

			inFlightConnectRequestsRef.current[provider] = connectRequest;

			return connectRequest;
		},
		[
			fetchProviderFormOptions,
			isBusy,
			methods,
			radarrTestConnectionState,
			saveProviderConnection,
			setProviderConnectPending,
			setSaveError,
			sonarrTestConnectionState,
		],
	);

	const disconnectProvider = useCallback(
		async (provider: Provider): Promise<boolean> => {
			if (isBusy) {
				return false;
			}

			setSaveError(null);

			const previousSettings =
				savedSettingsRef.current ?? createDefaultExtensionOptions();
			const previousConnection = getNormalizedConnectionOrSetError(
				setSaveError,
				previousSettings,
				provider,
			);
			if (previousConnection === undefined) {
				return false;
			}

			const normalizedSettings: ExtensionOptions = {
				...previousSettings,
				providers: {
					...previousSettings.providers,
					[provider]: {
						...previousSettings.providers[provider],
						url: "",
						apiKey: "",
					},
				},
			};

			resetProviderTestState(
				provider,
				sonarrTestConnectionState,
				radarrTestConnectionState,
			);

			const persisted = await persistSettings(normalizedSettings);
			if (!persisted) {
				return false;
			}

			const currentSettings = parseExtensionOptions(methods.getValues());
			const mergedFormSettings = mergeProviderSettingsIntoForm(
				currentSettings,
				provider,
				normalizedSettings.providers[provider],
			);

			setSavedSettings(normalizedSettings);
			methods.reset(mergedFormSettings);

			const refreshed = await notifyProviderChanges(
				queryClient,
				{
					changedProviders: [provider],
					disconnectedProviders: [provider],
				},
				setSaveError,
			);

			await cleanupPreviousPermission(
				provider,
				previousConnection,
				normalizedSettings,
				"disconnect",
			);
			removeProviderQueries(queryClient, provider);
			invalidateProviderDependentQueries(queryClient, provider);

			return refreshed;
		},
		[
			isBusy,
			methods,
			persistSettings,
			queryClient,
			radarrTestConnectionState,
			savedSettingsRef,
			setSavedSettings,
			setSaveError,
			sonarrTestConnectionState,
		],
	);

	return {
		connectProvider,
		disconnectProvider,
		connectPendingState,
	};
}
