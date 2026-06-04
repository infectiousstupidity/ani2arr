/** Shared provider credential normalization for RPC handlers. */
// src/rpc/handlers/provider-credentials.ts

import type {
	Provider,
	ProviderCredentials,
} from "@/providers/types";
import { normalizeProviderConnectionInput } from "@/settings/provider-config";

export const normalizeInputCredentials = (
	provider: Provider,
	credentials: ProviderCredentials,
): ProviderCredentials => {
	const normalized = normalizeProviderConnectionInput(credentials, provider);
	if (!normalized) {
		throw new Error("Provider credentials are required.");
	}

	return {
		url: normalized.url,
		apiKey: normalized.apiKey,
	};
};
