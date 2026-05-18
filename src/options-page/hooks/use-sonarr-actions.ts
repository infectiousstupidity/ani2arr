/** Coordinates Sonarr connection and disconnection actions from the options page. */
// src/options-page/hooks/use-sonarr-actions.ts

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

export function useSonarrActions() {
	const queryClient = useQueryClient();
	const { data: currentSettings } = useExtensionOptions();
	const saveProviderConnection = useSaveProviderConnection();

	const [isConnecting, setIsConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const connectSonarr = useCallback(
		async (draftUrl: string, draftApiKey: string) => {
			if (!currentSettings) return false;

			setIsConnecting(true);
			setError(null);

			try {
				// 1. Normalize
				const normalized = normalizeProviderConnectionInput(
					{ url: draftUrl, apiKey: draftApiKey },
					"sonarr",
				);
				if (!normalized)
					throw new Error("Please enter a valid Sonarr URL and API key.");

				// 2. Request exact host permission
				const permResult = await requestProviderHostPermission(normalized.url);
				if (!permResult.ok || !permResult.value.granted)
					throw new Error("Host permission was denied.");

				const api = getAni2arrApi();

				// 3. Test connection and fetch options to ensure credentials work.
				await api.getSonarrFormResources({
					credentials: normalized,
				});

				// 4. Persist private URL/API key only.
				const newSettings = await saveProviderConnection.mutateAsync({
					provider: "sonarr",
					credentials: normalized,
				});

				// 5. Invalidate provider-scoped queries
				queryClient.invalidateQueries({
					queryKey: queryKeys.sonarrFormResourcesRoot(),
				});
				queryClient.invalidateQueries({
					queryKey: queryKeys.sonarrConnectionRoot(),
				});
				queryClient.invalidateQueries({
					queryKey: queryKeys.providerBaseUrl("sonarr"),
				});
				queryClient.invalidateQueries({
					queryKey: queryKeys.seriesStatusRoot("sonarr"),
				});
				queryClient.invalidateQueries({
					queryKey: queryKeys.mappingSearchRoot("sonarr"),
				});
				queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });

				// 6. Notify provider connection changed
				await api.notifyProviderConnectionChanged({
					changedProviders: ["sonarr"],
				});

				// 7. Cleanup old host permission if unused
				await cleanupOldHostPermission(
					currentSettings.providers.sonarr.url,
					newSettings,
				);

				return true;
			} catch (error_) {
				setError(getActionErrorMessage(error_, "Failed to connect to Sonarr."));
				return false;
			} finally {
				setIsConnecting(false);
			}
		},
		[currentSettings, saveProviderConnection, queryClient],
	);

	const disconnectSonarr = useCallback(async () => {
		if (!currentSettings) return false;

		setIsConnecting(true);
		setError(null);

		try {
			const oldUrl = currentSettings.providers.sonarr.url;

			// 1. Clear private credentials only.
			const newSettings = await saveProviderConnection.mutateAsync({
				provider: "sonarr",
				credentials: null,
			});

			// 2. Clear queries
			queryClient.removeQueries({
				queryKey: queryKeys.sonarrFormResourcesRoot(),
			});
			queryClient.removeQueries({ queryKey: queryKeys.sonarrConnectionRoot() });
			queryClient.removeQueries({ queryKey: queryKeys.providerBaseUrl("sonarr") });
			queryClient.removeQueries({
				queryKey: queryKeys.seriesStatusRoot("sonarr"),
			});
			queryClient.removeQueries({
				queryKey: queryKeys.mappingSearchRoot("sonarr"),
			});
			queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });

			// 3. Notify
			await getAni2arrApi().notifyProviderConnectionChanged({
				disconnectedProviders: ["sonarr"],
			});

			// 4. Cleanup unused permission
			await cleanupOldHostPermission(oldUrl, newSettings);

			return true;
		} catch (error_) {
			setError(getActionErrorMessage(error_, "Failed to disconnect Sonarr."));
			return false;
		} finally {
			setIsConnecting(false);
		}
	}, [currentSettings, saveProviderConnection, queryClient]);

	return { connectSonarr, disconnectSonarr, isConnecting, error };
}
