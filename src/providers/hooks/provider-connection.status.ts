/** Provider status derivation and shared stored-settings read hook. */
// src/providers/hooks/provider-connection.status.ts

import { getProviderCredentials, useExtensionOptions } from "@/options";
import type { Provider } from "@/providers";
import { useProviderConnectionCheck } from "./provider-connection.queries";

export type ProviderConnectionStatus =
	| "connected"
	| "configured"
	| "connecting"
	| "not-configured";

const PROVIDER_CONNECTION_STATUS_META: Record<
	ProviderConnectionStatus,
	{
		label: string;
		shortLabel: string;
		variantClassName?: string;
	}
> = {
	connected: {
		label: "Connected",
		shortLabel: "Connected",
		variantClassName: "a2a-provider-status--connected",
	},
	configured: {
		label: "Configured",
		shortLabel: "Configured",
		variantClassName: "a2a-provider-status--configured",
	},
	connecting: {
		label: "Checking connection",
		shortLabel: "Checking",
		variantClassName: "a2a-provider-status--connecting",
	},
	"not-configured": {
		label: "Not configured",
		shortLabel: "Not set",
	},
};

export type ProviderStatusView = {
	isProviderConfigured: boolean;
	isProviderConnected: boolean;
	isCheckingProviderConnection: boolean;
	status: ProviderConnectionStatus;
	label: string;
	shortLabel: string;
	variantClassName?: string;
};

export const deriveProviderStatus = (input: {
	isProviderConfigured: boolean;
	isProviderConnected: boolean;
	isCheckingProviderConnection: boolean;
}): ProviderStatusView => {
	let status: ProviderConnectionStatus;

	if (!input.isProviderConfigured) {
		status = "not-configured";
	} else if (input.isCheckingProviderConnection) {
		status = "connecting";
	} else if (input.isProviderConnected) {
		status = "connected";
	} else {
		status = "configured";
	}

	return {
		...input,
		status,
		...PROVIDER_CONNECTION_STATUS_META[status],
	};
};

export const useStoredProviderStatus = (
	provider: Provider,
): ProviderStatusView => {
	const optionsQuery = useExtensionOptions();
	const credentials = getProviderCredentials(optionsQuery.data, provider);
	const isProviderConfigured = credentials !== null;
	const connectionQuery = useProviderConnectionCheck({
		provider,
		enabled: isProviderConfigured,
		credentials,
	});

	return deriveProviderStatus({
		isProviderConfigured,
		isProviderConnected: connectionQuery.isSuccess,
		isCheckingProviderConnection:
			isProviderConfigured && connectionQuery.isFetching,
	});
};
