/** Shared React Query client defaults for extension page entrypoints. */
// src/queries/query-client.ts

import { QueryClient } from "@tanstack/react-query";

type ExtensionQueryClientOptions = {
	staleTime?: number;
	retry?: boolean | number;
};

export function createExtensionQueryClient(
	options?: ExtensionQueryClientOptions,
): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: options?.staleTime ?? 5 * 60 * 1000,
				gcTime: 30 * 60 * 1000,
				refetchOnWindowFocus: false,
				retry: options?.retry ?? 1,
			},
		},
	});
}
