/** Shared RPC handlers and helpers for provider connection flows. */
// src/rpc/handlers/provider.handlers.ts

import { radarrClient, sonarrClient } from "@/background/api-services";
import { getProviderConfig } from "@/background/provider-config";
import type {
	GetProviderBaseUrlInput,
	ProviderConnectionTestInput,
} from "@/rpc/types";
import { normalizeInputCredentials } from "./provider-credentials";

export const providerHandlers = {
	async getProviderBaseUrl(input: GetProviderBaseUrlInput) {
		const credentials = await getProviderConfig(input.provider);
		return credentials?.url ?? "";
	},

	testSonarrConnection(input: ProviderConnectionTestInput) {
		const credentials = normalizeInputCredentials("sonarr", input.credentials);
		return sonarrClient.testConnection(credentials);
	},

	testRadarrConnection(input: ProviderConnectionTestInput) {
		const credentials = normalizeInputCredentials("radarr", input.credentials);
		return radarrClient.testConnection(credentials);
	},
};
