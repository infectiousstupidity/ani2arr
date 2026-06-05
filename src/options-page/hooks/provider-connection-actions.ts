/** Provider connection action hooks for the options page. */
// src/options-page/hooks/provider-connection-actions.ts

import { useCallback, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type {
	Provider,
	ProviderCredentials,
} from "@/providers/types";
import { queryKeys } from "@/queries/query-keys";
import {
	useExtensionOptions,
	useSaveProviderConnection,
} from "@/queries/options";
import { getAni2arrApi, type Ani2arrApi } from "@/rpc";
import {
	cleanupUnusedProviderHostPermission,
	requestProviderConnectionPermission,
} from "@/settings/provider-permissions";
import { normalizeProviderConnectionInput } from "@/settings/provider-config";
import { getActionErrorMessage } from "./action-helpers";

type FetchFormResources = (
	api: Ani2arrApi,
	credentials: ProviderCredentials,
) => Promise<unknown>;

interface ProviderConnectionActionsOptions {
	provider: Provider;
	label: string;
	fetchFormResources: FetchFormResources;
	queryRoots: readonly QueryKey[];
}

const SONARR_QUERY_ROOTS = [
	queryKeys.sonarrConnectionRoot(),
	queryKeys.mediaStatusProvider("sonarr"),
	queryKeys.mappingSearchRoot("sonarr"),
] as const;

const RADARR_QUERY_ROOTS = [
	queryKeys.radarrConnectionRoot(),
	queryKeys.mediaStatusProvider("radarr"),
	queryKeys.mappingSearchRoot("radarr"),
] as const;

const fetchSonarrFormResources: FetchFormResources = (api, credentials) =>
	api.getSonarrFormResources({ credentials });

const fetchRadarrFormResources: FetchFormResources = (api, credentials) =>
	api.getRadarrFormResources({ credentials });

function useProviderConnectionActions({
	provider,
	label,
	fetchFormResources,
	queryRoots,
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
				const normalized = normalizeProviderConnectionInput(
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

				if (provider === "sonarr") {
					queryClient.setQueryData(queryKeys.sonarrFormResources(), formResources);
				} else {
					queryClient.setQueryData(queryKeys.radarrFormResources(), formResources);
				}

				for (const queryRoot of queryRoots) {
					queryClient.invalidateQueries({ queryKey: queryRoot });
				}
				queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });

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
			queryRoots,
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

			for (const queryRoot of queryRoots) {
				queryClient.removeQueries({ queryKey: queryRoot });
			}
			queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });

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
		queryRoots,
		saveProviderConnection,
	]);

	return { connect, disconnect, isConnecting, error };
}

export function useSonarrActions() {
	const actions = useProviderConnectionActions({
		provider: "sonarr",
		label: "Sonarr",
		fetchFormResources: fetchSonarrFormResources,
		queryRoots: SONARR_QUERY_ROOTS,
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
		queryRoots: RADARR_QUERY_ROOTS,
	});

	return {
		connectRadarr: actions.connect,
		disconnectRadarr: actions.disconnect,
		isConnecting: actions.isConnecting,
		error: actions.error,
	};
}
