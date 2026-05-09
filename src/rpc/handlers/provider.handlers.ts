/** Shared RPC handlers and helpers for provider connection flows. */
// src/rpc/handlers/provider.handlers.ts

import * as v from "valibot";
import type { Ani2arrApi } from "@/rpc";
import type { Provider, ProviderCredentials } from "@/providers";
import { normalizeProviderConnectionInput } from "@/settings";
import { TestProviderConnectionInputSchema } from "@/rpc/schemas";
import type { ApiHandlerDeps } from "./handler-deps";

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

export function createProviderHandlers(
	deps: ApiHandlerDeps,
): Pick<Ani2arrApi, "testProviderConnection"> {
	const { sonarrClient, radarrClient } = deps;

	const testProviderConnectionInternal: Ani2arrApi["testProviderConnection"] =
		async (input) => {
			return input.provider === "sonarr"
				? sonarrClient.testConnection(input.credentials)
				: radarrClient.testConnection(input.credentials);
		};

	return {
		testProviderConnection(input) {
			const parsedInput = v.parse(TestProviderConnectionInputSchema, input);
			return testProviderConnectionInternal({
				provider: parsedInput.provider,
				credentials: normalizeInputCredentials(
					parsedInput.provider,
					parsedInput.credentials,
				),
			});
		},
	} satisfies Pick<Ani2arrApi, "testProviderConnection">;
}
