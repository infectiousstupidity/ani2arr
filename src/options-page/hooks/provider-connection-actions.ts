/** Provider connection action hooks for the options page. */
// src/options-page/hooks/provider-connection-actions.ts

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
	Provider,
	ProviderCredentials,
} from "@/providers/types";
import { resetAfterProviderConnectionChange } from "@/queries/invalidation";
import { queryKeys } from "@/queries/query-keys";
import {
	useExtensionOptions,
	useSaveProviderConnection,
	useSaveSeerrConnection,
} from "@/queries/options";
import { getAni2arrApi, type Ani2arrApi } from "@/rpc";
import {
	cleanupUnusedProviderHostPermission,
	requestProviderConnectionPermission,
} from "@/settings/provider-permissions";
import { normalizeConnectionInput } from "@/settings/connection-config";
import { getActionErrorMessage } from "./action-helpers";

type FetchFormResources = (
	api: Ani2arrApi,
	credentials: ProviderCredentials,
) => Promise<unknown>;

interface ProviderConnectionActionsOptions {
	provider: Provider;
	label: string;
	fetchFormResources: FetchFormResources;
}

const fetchSonarrFormResources: FetchFormResources = (api, credentials) =>
	api.getSonarrFormResources({ credentials });

const fetchRadarrFormResources: FetchFormResources = (api, credentials) =>
	api.getRadarrFormResources({ credentials });

function useProviderConnectionActions({
	provider,
	label,
	fetchFormResources,
}: ProviderConnectionActionsOptions) {
	const queryClient = useQueryClient();
	const { data: currentSettings } = useExtensionOptions();
	const saveProviderConnection = useSaveProviderConnection();

	const [isConnecting, setIsConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const connect = useCallback(
		async (draftUrl: string, draftApiKey: string) => {
			if (!currentSettings) return false;

			setIsConnecting(true);
			setError(null);

			try {
				const normalized = normalizeConnectionInput(
					{ url: draftUrl, apiKey: draftApiKey },
					provider,
				);
				if (!normalized) {
					throw new Error(`Please enter a valid ${label} URL and API key.`);
				}

				const permission = await requestProviderConnectionPermission(
					normalized.url,
				);
				if (!permission.ok || !permission.value.granted) {
					throw new Error("Host permission was denied.");
				}

				const api = getAni2arrApi();
				const formResources = await fetchFormResources(api, normalized);

				const newSettings = await saveProviderConnection.mutateAsync({
					provider,
					credentials: normalized,
				});

				resetAfterProviderConnectionChange(queryClient, provider);
				queryClient.setQueryData(
					queryKeys.providerFormResources(provider),
					formResources,
				);

				await api.notifyProviderConnectionChanged({
					changedProviders: [provider],
				});

				await cleanupUnusedProviderHostPermission(
					currentSettings.providers[provider].url,
					newSettings,
				);

				return true;
			} catch (error_) {
				setError(getActionErrorMessage(error_, `Failed to connect to ${label}.`));
				return false;
			} finally {
				setIsConnecting(false);
			}
		},
		[
			currentSettings,
			fetchFormResources,
			label,
			provider,
			queryClient,
			saveProviderConnection,
		],
	);

	const disconnect = useCallback(async () => {
		if (!currentSettings) return false;

		setIsConnecting(true);
		setError(null);

		try {
			const oldUrl = currentSettings.providers[provider].url;
			const newSettings = await saveProviderConnection.mutateAsync({
				provider,
				credentials: null,
			});

			resetAfterProviderConnectionChange(queryClient, provider);

			await getAni2arrApi().notifyProviderConnectionChanged({
				disconnectedProviders: [provider],
			});

			await cleanupUnusedProviderHostPermission(oldUrl, newSettings);

			return true;
		} catch (error_) {
			setError(
				getActionErrorMessage(error_, `Failed to disconnect ${label}.`),
			);
			return false;
		} finally {
			setIsConnecting(false);
		}
	}, [
		currentSettings,
		label,
		provider,
		queryClient,
		saveProviderConnection,
	]);

	return { connect, disconnect, isConnecting, error };
}

export function useSonarrActions() {
	const actions = useProviderConnectionActions({
		provider: "sonarr",
		label: "Sonarr",
		fetchFormResources: fetchSonarrFormResources,
	});

	return {
		connectSonarr: actions.connect,
		disconnectSonarr: actions.disconnect,
		isConnecting: actions.isConnecting,
		error: actions.error,
	};
}

export function useRadarrActions() {
	const actions = useProviderConnectionActions({
		provider: "radarr",
		label: "Radarr",
		fetchFormResources: fetchRadarrFormResources,
	});

	return {
		connectRadarr: actions.connect,
		disconnectRadarr: actions.disconnect,
		isConnecting: actions.isConnecting,
		error: actions.error,
	};
}

export function useSeerrActions() {
	const queryClient = useQueryClient();
	const { data: currentSettings } = useExtensionOptions();
	const saveSeerrConnection = useSaveSeerrConnection();

	const [isConnecting, setIsConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const connectSeerr = useCallback(
		async (draftUrl: string, draftApiKey: string) => {
			if (!currentSettings) return false;

			setIsConnecting(true);
			setError(null);

			try {
				const normalized = normalizeConnectionInput(
					{
						url: draftUrl,
						apiKey: draftApiKey,
					},
					"seerr",
				);
				if (!normalized) {
					throw new Error("Please enter a valid Seerr URL and API key.");
				}

				const permission = await requestProviderConnectionPermission(
					normalized.url,
				);
				if (!permission.ok || !permission.value.granted) {
					throw new Error("Host permission was denied.");
				}

				const credentials = {
					url: normalized.url,
					apiKey: normalized.apiKey,
				};
				const api = getAni2arrApi();
				await api.testSeerrConnection({ credentials });
				const newSettings = await saveSeerrConnection.mutateAsync({
					credentials,
				});

				queryClient.removeQueries({ queryKey: queryKeys.seerrRoot() });
				try {
					await api.refreshUpstreamMappings();
					queryClient.invalidateQueries({
						queryKey: queryKeys.mappingIdentitiesRoot(),
					});
					queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
					queryClient.invalidateQueries({ queryKey: queryKeys.seerrTargetsRoot() });
				} catch {
					// Seerr remains usable if the upstream mapping refresh is temporarily unavailable.
				}
				await cleanupUnusedProviderHostPermission(
					currentSettings.seerr.url,
					newSettings,
				);

				return true;
			} catch (error_) {
				setError(getActionErrorMessage(error_, "Failed to connect to Seerr."));
				return false;
			} finally {
				setIsConnecting(false);
			}
		},
		[currentSettings, queryClient, saveSeerrConnection],
	);

	const disconnectSeerr = useCallback(async () => {
		if (!currentSettings) return false;

		setIsConnecting(true);
		setError(null);

		try {
			const oldUrl = currentSettings.seerr.url;
			const newSettings = await saveSeerrConnection.mutateAsync({
				credentials: null,
			});

			queryClient.removeQueries({ queryKey: queryKeys.seerrRoot() });
			await cleanupUnusedProviderHostPermission(oldUrl, newSettings);

			return true;
		} catch (error_) {
			setError(getActionErrorMessage(error_, "Failed to disconnect Seerr."));
			return false;
		} finally {
			setIsConnecting(false);
		}
	}, [currentSettings, queryClient, saveSeerrConnection]);

	return {
		connectSeerr,
		disconnectSeerr,
		isConnecting,
		error,
	};
}
