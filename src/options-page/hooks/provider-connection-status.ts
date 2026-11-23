/** Options-page display status for stored provider connections. */

import type { Provider, ProviderCredentials } from "@/providers/types";
import { useProviderConnectionCheck } from "@/queries/provider-connection";

export type ProviderConnectionStatusView = {
	isProviderConfigured: boolean;
	shortLabel: string;
};

export function deriveProviderConnectionStatusView(input: {
	isProviderConfigured: boolean;
	isProviderConnected: boolean;
	isCheckingProviderConnection: boolean;
}): ProviderConnectionStatusView {
	if (!input.isProviderConfigured) {
		return { isProviderConfigured: false, shortLabel: "Not configured" };
	}
	if (input.isCheckingProviderConnection) {
		return { isProviderConfigured: true, shortLabel: "Checking" };
	}
	if (input.isProviderConnected) {
		return { isProviderConfigured: true, shortLabel: "Connected" };
	}
	return { isProviderConfigured: true, shortLabel: "Configured" };
}

export function useStoredProviderConnectionStatus(options: {
	provider: Provider;
	credentials: ProviderCredentials | null;
	isProviderConfigured: boolean;
}): ProviderConnectionStatusView {
	const connectionQuery = useProviderConnectionCheck({
		provider: options.provider,
		credentials: options.credentials,
		enabled: options.isProviderConfigured && options.credentials !== null,
	});

	return deriveProviderConnectionStatusView({
		isProviderConfigured: options.isProviderConfigured,
		isProviderConnected: connectionQuery.isSuccess,
		isCheckingProviderConnection:
			options.isProviderConfigured &&
			options.credentials !== null &&
			connectionQuery.isFetching,
	});
}
