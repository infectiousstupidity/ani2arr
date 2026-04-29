/** Provider connection query and mutation hooks for testing provider connectivity. */
// src/providers/hooks/provider-connection.queries.ts
import { useMutation, useQuery } from "@tanstack/react-query";
import { getProviderLabel } from "@/providers/provider-labels";
import { getAni2arrApi } from "@/rpc";
import type { TestProviderConnectionInput } from "@/rpc/schemas";
import { normalizeError, type ExtensionError } from "@/shared/errors";
import { getProviderQueryScope, queryKeys } from "@/shared/queries/query-keys";
import type { Provider, ProviderCredentials } from "@/providers";

export const useProviderConnectionCheck = (options: {
	provider: Provider;
	credentials?: ProviderCredentials | null;
	enabled?: boolean;
}) =>
	useQuery<{ version: string }, ExtensionError>({
		queryKey:
			options.provider === "sonarr"
				? queryKeys.sonarrConnection(getProviderQueryScope(options.credentials))
				: queryKeys.radarrConnection(
						getProviderQueryScope(options.credentials),
					),
		queryFn: async () => {
			if (!options.credentials) {
				const providerLabel = getProviderLabel(options.provider);
				throw normalizeError(
					new Error(
						`${providerLabel} credentials are required to verify the connection.`,
					),
				);
			}

			try {
				return await getAni2arrApi().testProviderConnection({
					provider: options.provider,
					credentials: options.credentials,
				});
			} catch (error) {
				throw normalizeError(error);
			}
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
	useMutation<{ version: string }, ExtensionError, TestProviderConnectionInput>(
		{
			mutationFn: async (input: TestProviderConnectionInput) => {
				try {
					return await getAni2arrApi().testProviderConnection(input);
				} catch (error) {
					throw normalizeError(error);
				}
			},
		},
	);

export default useProviderConnectionCheck;
