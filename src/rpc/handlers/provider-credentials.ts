/** Shared provider credential normalization for RPC handlers. */
// src/rpc/handlers/provider-credentials.ts

import type { ProviderCredentials } from "@/providers/types";
import {
	normalizeConnectionInput,
	type ConnectionKind,
} from "@/settings/connection-config";

export const normalizeInputCredentials = (
	kind: ConnectionKind,
	credentials: ProviderCredentials,
): ProviderCredentials => {
	const normalized = normalizeConnectionInput(credentials, kind);
	if (!normalized) {
		throw new Error(
			kind === "seerr"
				? "Seerr credentials are required."
				: "Provider credentials are required.",
		);
	}

	return {
		url: normalized.url,
		apiKey: normalized.apiKey,
	};
};
