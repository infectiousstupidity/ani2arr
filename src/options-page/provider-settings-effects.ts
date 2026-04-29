/** Provider-settings effects for query invalidation and background connection refresh. */
// src/options-page/provider-settings-effects.ts

import type { QueryClient } from "@tanstack/react-query";
import { getAni2arrApi } from "@/rpc";
import { queryKeys } from "@/shared/queries";
import type { Provider } from "@/providers";
import { logger } from "@/shared/utils/logger";

export type ProviderConnectionChangeInput = {
	changedProviders?: Provider[];
	disconnectedProviders?: Provider[];
};

function getProviderQueryKeys(provider: Provider) {
	return {
		metadata:
			provider === "sonarr"
				? queryKeys.sonarrMetadataRoot()
				: queryKeys.radarrMetadataRoot(),
		connection:
			provider === "sonarr"
				? queryKeys.sonarrConnectionRoot()
				: queryKeys.radarrConnectionRoot(),
		status: queryKeys.seriesStatusRoot(provider),
		search: queryKeys.mappingSearchRoot(provider),
	};
}

export function invalidateAllSettingsQueries(queryClient: QueryClient): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.options() });
	queryClient.invalidateQueries({ queryKey: queryKeys.publicOptions() });
	queryClient.invalidateQueries({ queryKey: queryKeys.sonarrMetadataRoot() });
	queryClient.invalidateQueries({ queryKey: queryKeys.sonarrConnectionRoot() });
	queryClient.invalidateQueries({ queryKey: queryKeys.radarrMetadataRoot() });
	queryClient.invalidateQueries({ queryKey: queryKeys.radarrConnectionRoot() });
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingSearchRoot("sonarr"),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingSearchRoot("radarr"),
	});
	queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspectionRoot(),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.seriesStatusRoot("sonarr"),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.seriesStatusRoot("radarr"),
	});
}

export function invalidateProviderQueries(
	queryClient: QueryClient,
	provider: Provider,
): void {
	const keys = getProviderQueryKeys(provider);
	queryClient.invalidateQueries({ queryKey: keys.metadata });
	queryClient.invalidateQueries({ queryKey: keys.connection });
	queryClient.invalidateQueries({ queryKey: keys.status });
	queryClient.invalidateQueries({ queryKey: keys.search });
}

export function removeProviderQueries(
	queryClient: QueryClient,
	provider: Provider,
): void {
	const keys = getProviderQueryKeys(provider);
	queryClient.removeQueries({ queryKey: keys.metadata });
	queryClient.removeQueries({ queryKey: keys.connection });
	queryClient.removeQueries({ queryKey: keys.status });
	queryClient.removeQueries({ queryKey: keys.search });
}

export function invalidateProviderDependentQueries(
	queryClient: QueryClient,
	_provider: Provider,
): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspectionRoot(),
	});
}

export async function notifyProviderConnectionChanged(
	queryClient: QueryClient,
	input: ProviderConnectionChangeInput | undefined,
	setSaveError: (message: string) => void,
): Promise<boolean> {
	const changedProviders = input?.changedProviders ?? [];
	if (changedProviders.length === 0) {
		return true;
	}

	try {
		await getAni2arrApi().notifyProviderConnectionChanged(input);
		return true;
	} catch (error) {
		logger.error("Settings were saved, but provider refresh failed.", error);
		setSaveError(
			"Settings were saved, but provider data failed to refresh. Reload and try again.",
		);

		for (const provider of changedProviders) {
			invalidateProviderQueries(queryClient, provider);
			invalidateProviderDependentQueries(queryClient, provider);
		}
		return false;
	}
}
