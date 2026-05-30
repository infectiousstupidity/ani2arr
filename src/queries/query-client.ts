/** Shared React Query client defaults for extension page entrypoints. */
// src/queries/query-client.ts

import { QueryClient } from "@tanstack/react-query";

export function createExtensionQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 1000 * 60 * 5,
				refetchOnWindowFocus: false,
				retry: 1,
			},
		},
	});
}
