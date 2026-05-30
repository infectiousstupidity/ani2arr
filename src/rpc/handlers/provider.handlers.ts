/** Shared RPC handlers and helpers for provider connection flows. */
// src/rpc/handlers/provider.handlers.ts

import * as v from "valibot";
import { radarrClient, sonarrClient } from "@/background/api-services";
import { getProviderConfig } from "@/background/provider-config";
import {
	GetProviderBaseUrlInputSchema,
	TestProviderConnectionInputSchema,
} from "@/rpc/schemas";
import { normalizeInputCredentials } from "./provider-credentials";

export const providerHandlers = {
	async getProviderBaseUrl(input: unknown) {
		const parsedInput = v.parse(GetProviderBaseUrlInputSchema, input);
		const credentials = await getProviderConfig(parsedInput.provider);
		return credentials?.url ?? "";
	},

	testProviderConnection(input: unknown) {
		const parsedInput = v.parse(TestProviderConnectionInputSchema, input);
		const credentials = normalizeInputCredentials(
			parsedInput.provider,
			parsedInput.credentials,
		);
		return parsedInput.provider === "sonarr"
			? sonarrClient.testConnection(credentials)
			: radarrClient.testConnection(credentials);
	},
};
