/** Coordinates Radarr connection and disconnection actions from the options page. */
// src/options-page/hooks/use-radarr-actions.ts

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAni2arrApi } from "@/rpc";
import { normalizeProviderConnectionInput } from "@/settings";
import { requestProviderHostPermission } from "@/providers/settings/host-permissions";
import { queryKeys } from "@/queries/query-keys";
import {
	useExtensionOptions,
	useSaveProviderConnection,
} from "@/queries/options";
import {
	cleanupOldHostPermission,
	getActionErrorMessage,
} from "./action-helpers";

export function useRadarrActions() {
	const queryClient = useQueryClient();
	const { data: currentSettings } = useExtensionOptions();
	const saveProviderConnection = useSaveProviderConnection();

	const [isConnecting, setIsConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const connectRadarr = useCallback(
		async (draftUrl: string, draftApiKey: string) => {
			if (!currentSettings) return false;

			setIsConnecting(true);
			setError(null);

			try {
				// 1. Normalize
				const normalized = normalizeProviderConnectionInput(
					{ url: draftUrl, apiKey: draftApiKey },
					"radarr",
				);
				if (!normalized)
					throw new Error("Please enter a valid Radarr URL and API key.");

				// 2. Request exact host permission
				const permResult = await requestProviderHostPermission(normalized.url);
				if (!permResult.ok || !permResult.value.granted)
					throw new Error("Host permission was denied.");

				const api = getAni2arrApi();

				// 3. Test connection and fetch options to ensure credentials work.
				await api.getRadarrFormOptions({
					credentials: normalized,
				});

				// 4. Persist private URL/API key only.
				const newSettings = await saveProviderConnection.mutateAsync({
					provider: "radarr",
					credentials: normalized,
				});

				// 5. Invalidate provider-scoped queries
				queryClient.invalidateQueries({
					queryKey: queryKeys.radarrFormOptionsRoot(),
				});
				queryClient.invalidateQueries({
					queryKey: queryKeys.radarrConnectionRoot(),
				});
				queryClient.invalidateQueries({
					queryKey: queryKeys.providerBaseUrl("radarr"),
				});
				queryClient.invalidateQueries({
					queryKey: queryKeys.seriesStatusRoot("radarr"),
				});
				queryClient.invalidateQueries({
					queryKey: queryKeys.mappingSearchRoot("radarr"),
				});
				queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });

				// 6. Notify provider connection changed
				await api.notifyProviderConnectionChanged({
					changedProviders: ["radarr"],
				});

				// 7. Cleanup old host permission if unused
				await cleanupOldHostPermission(
					currentSettings.providers.radarr.url,
					newSettings,
				);

				return true;
			} catch (error_) {
				setError(getActionErrorMessage(error_, "Failed to connect to Radarr."));
				return false;
			} finally {
				setIsConnecting(false);
			}
		},
		[currentSettings, saveProviderConnection, queryClient],
	);

	const disconnectRadarr = useCallback(async () => {
		if (!currentSettings) return false;

		setIsConnecting(true);
		setError(null);

		try {
			const oldUrl = currentSettings.providers.radarr.url;

			// 1. Clear private credentials only.
			const newSettings = await saveProviderConnection.mutateAsync({
				provider: "radarr",
				credentials: null,
			});

			// 2. Clear queries
			queryClient.removeQueries({
				queryKey: queryKeys.radarrFormOptionsRoot(),
			});
			queryClient.removeQueries({ queryKey: queryKeys.radarrConnectionRoot() });
			queryClient.removeQueries({ queryKey: queryKeys.providerBaseUrl("radarr") });
			queryClient.removeQueries({
				queryKey: queryKeys.seriesStatusRoot("radarr"),
			});
			queryClient.removeQueries({
				queryKey: queryKeys.mappingSearchRoot("radarr"),
			});
			queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });

			// 3. Notify
			await getAni2arrApi().notifyProviderConnectionChanged({
				disconnectedProviders: ["radarr"],
			});

			// 4. Cleanup unused permission
			await cleanupOldHostPermission(oldUrl, newSettings);

			return true;
		} catch (error_) {
			setError(getActionErrorMessage(error_, "Failed to disconnect Radarr."));
			return false;
		} finally {
			setIsConnecting(false);
		}
	}, [currentSettings, saveProviderConnection, queryClient]);

	return { connectRadarr, disconnectRadarr, isConnecting, error };
}
