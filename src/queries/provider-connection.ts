/** React Query hooks and UI status derivation for provider connection checks. */
// src/queries/provider-connection.ts

import { useQuery } from "@tanstack/react-query";
import { getProviderLabel } from "@/providers/provider-labels";
import { getAni2arrApi } from "@/rpc";
import { normalizeError } from "@/shared/errors/error-utils";
import type { ExtensionError } from "@/shared/errors/error.types";
import { getProviderConnectionScope } from "@/providers/settings/provider-connection.validation";
import { queryKeys } from "@/queries/query-keys";
import type {
	Provider,
	ProviderCredentials,
} from "@/providers/types";

type TestProviderConnectionInput = {
	provider: Provider;
	credentials: ProviderCredentials;
};

export type ProviderConnectionStatusView = {
	isProviderConfigured: boolean;
	shortLabel: string;
	variantClassName?: string;
};

const testConnection = (input: TestProviderConnectionInput) => {
	const api = getAni2arrApi();
	return input.provider === "sonarr"
		? api.testSonarrConnection({ credentials: input.credentials })
		: api.testRadarrConnection({ credentials: input.credentials });
};

const getConnectionQueryKey = (
	provider: Provider,
	credentials?: ProviderCredentials | null,
) => queryKeys.providerConnection(provider, getProviderConnectionScope(credentials));

export const useProviderConnectionCheck = (options: {
	provider: Provider;
	credentials?: ProviderCredentials | null;
	enabled?: boolean;
}) =>
	useQuery<{ version: string }, ExtensionError>({
		queryKey: getConnectionQueryKey(options.provider, options.credentials),
		queryFn: async () => {
			if (!options.credentials) {
				const providerLabel = getProviderLabel(options.provider);
				throw normalizeError(
					new Error(
						`${providerLabel} credentials are required to verify the connection.`,
					),
				);
			}

			return testConnection({
				provider: options.provider,
				credentials: options.credentials,
			});
		},
		enabled:
			(options.enabled ?? true) &&
			Boolean(options.credentials?.url && options.credentials.apiKey),
		staleTime: 60 * 1000,
		refetchOnWindowFocus: false,
		refetchOnMount: "always",
		retry: 0,
	});

export const deriveProviderConnectionStatusView = (input: {
	isProviderConfigured: boolean;
	isProviderConnected: boolean;
	isCheckingProviderConnection: boolean;
}): ProviderConnectionStatusView => {
	if (!input.isProviderConfigured) {
		return {
			isProviderConfigured: false,
			shortLabel: "Not configured",
		};
	}

	if (input.isCheckingProviderConnection) {
		return {
			isProviderConfigured: true,
			shortLabel: "Checking",
			variantClassName: "a2a-provider-status--connecting",
		};
	}

	if (input.isProviderConnected) {
		return {
			isProviderConfigured: true,
			shortLabel: "Connected",
			variantClassName: "a2a-provider-status--connected",
		};
	}

	return {
		isProviderConfigured: true,
		shortLabel: "Configured",
		variantClassName: "a2a-provider-status--configured",
	};
};

export const useStoredProviderConnectionStatus = (options: {
	provider: Provider;
	credentials: ProviderCredentials | null;
	isProviderConfigured: boolean;
}): ProviderConnectionStatusView => {
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
};
