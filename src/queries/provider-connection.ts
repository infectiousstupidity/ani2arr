/** React Query hooks and UI status derivation for provider connection checks. */
// src/queries/provider-connection.ts

import { useMutation, useQuery } from "@tanstack/react-query";
import { getProviderLabel } from "@/providers/provider-labels";
import { getAni2arrApi } from "@/rpc";
import type { TestProviderConnectionInput } from "@/rpc/schemas";
import { normalizeError, type ExtensionError } from "@/shared/errors";
import { getProviderQueryScope, queryKeys } from "@/shared/queries/query-keys";
import type { Provider, ProviderCredentials } from "@/providers";

export type ProviderConnectionStatusView = {
	isProviderConfigured: boolean;
	shortLabel: string;
	variantClassName?: string;
};

const testProviderConnection = async (input: TestProviderConnectionInput) => {
	try {
		return await getAni2arrApi().testProviderConnection(input);
	} catch (error) {
		throw normalizeError(error);
	}
};

const getConnectionQueryKey = (
	provider: Provider,
	credentials?: ProviderCredentials | null,
) =>
	provider === "sonarr"
		? queryKeys.sonarrConnection(getProviderQueryScope(credentials))
		: queryKeys.radarrConnection(getProviderQueryScope(credentials));

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

			return testProviderConnection({
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

export const useTestProviderConnection = () =>
	useMutation<{ version: string }, ExtensionError, TestProviderConnectionInput>({
		mutationFn: testProviderConnection,
	});

export const deriveProviderConnectionStatusView = (input: {
	isProviderConfigured: boolean;
	isProviderConnected: boolean;
	isCheckingProviderConnection: boolean;
}): ProviderConnectionStatusView => {
	if (!input.isProviderConfigured) {
		return {
			isProviderConfigured: false,
			shortLabel: "Not set",
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

export const useProviderConnectionStatus = (
	provider: Provider,
	credentials: ProviderCredentials | null,
): ProviderConnectionStatusView => {
	const isProviderConfigured = credentials !== null;
	const connectionQuery = useProviderConnectionCheck({
		provider,
		enabled: isProviderConfigured,
		credentials,
	});

	return deriveProviderConnectionStatusView({
		isProviderConfigured,
		isProviderConnected: connectionQuery.isSuccess,
		isCheckingProviderConnection:
			isProviderConfigured && connectionQuery.isFetching,
	});
};
