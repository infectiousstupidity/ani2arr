/** Arr provider connection actions for the options page. */

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
	Provider,
	ProviderCredentials,
} from "@/providers/types";
import { queryKeys } from "@/queries/query-keys";
import { useSaveProviderConnection } from "@/queries/options";
import { getAni2arrApi, type Ani2arrApi } from "@/rpc";
import { getUserErrorMessage } from "@/shared/errors/error-utils";
import { requestProviderConnectionPermission } from "@/settings/provider-permissions";
import { normalizeProviderConnectionInput } from "@/settings/provider-config";

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
	const saveProviderConnection = useSaveProviderConnection();

	const [isConnecting, setIsConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const connect = useCallback(
		async (draftUrl: string, draftApiKey: string) => {
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
				await saveProviderConnection.mutateAsync({
					provider,
					credentials: normalized,
				});

				queryClient.setQueryData(
					queryKeys.providerFormResources(provider),
					formResources,
				);

				return true;
			} catch (error_) {
				setError(
					getUserErrorMessage(error_, `Failed to connect to ${label}.`),
				);
				return false;
			} finally {
				setIsConnecting(false);
			}
		},
		[
			fetchFormResources,
			label,
			provider,
			queryClient,
			saveProviderConnection,
		],
	);

	const disconnect = useCallback(async () => {
		setIsConnecting(true);
		setError(null);

		try {
			await saveProviderConnection.mutateAsync({
				provider,
				credentials: null,
			});

			return true;
		} catch (error_) {
			setError(
				getUserErrorMessage(error_, `Failed to disconnect ${label}.`),
			);
			return false;
		} finally {
			setIsConnecting(false);
		}
	}, [label, provider, saveProviderConnection]);

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
