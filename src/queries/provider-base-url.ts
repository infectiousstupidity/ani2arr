/** React Query hook for private provider base URLs exposed through RPC. */
// src/queries/provider-base-url.ts

import { useQuery } from "@tanstack/react-query";
import type { Provider } from "@/providers";
import { getAni2arrApi } from "@/rpc";
import { normalizeError, type ExtensionError } from "@/shared/errors";
import { queryKeys } from "./query-keys";

export const useProviderBaseUrl = (
	provider: Provider,
	options?: { enabled?: boolean },
) =>
	useQuery<string, ExtensionError>({
		queryKey: queryKeys.providerBaseUrl(provider),
		queryFn: async () => {
			try {
				return await getAni2arrApi().getProviderBaseUrl({ provider });
			} catch (error) {
				throw normalizeError(error);
			}
		},
		enabled: options?.enabled ?? true,
		staleTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
