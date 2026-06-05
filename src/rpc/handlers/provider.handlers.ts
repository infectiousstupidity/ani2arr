/** Shared RPC handlers and helpers for provider connection flows. */
// src/rpc/handlers/provider.handlers.ts

import { browser } from "wxt/browser";
import { radarrClient, sonarrClient } from "@/background/api-services";
import { getProviderConfig } from "@/background/provider-config";
import { buildProviderOpenUrl } from "@/providers/provider-links";
import type {
	OpenProviderPageInput,
	OpenProviderPageOutput,
	ProviderConnectionTestInput,
} from "@/rpc/types";
import { normalizeInputCredentials } from "./provider-credentials";

export const providerHandlers = {
	async openProviderPage(
		input: OpenProviderPageInput,
	): Promise<OpenProviderPageOutput> {
		const credentials = await getProviderConfig(input.provider);
		if (!credentials) return { opened: false };

		if (
			input.target.type === "details" &&
			!input.target.providerRouteSlug.trim()
		) {
			return { opened: false };
		}

		const url = buildProviderOpenUrl({
			provider: input.provider,
			baseUrl: credentials.url,
			isInLibrary: input.target.type === "details",
			...(input.target.type === "details"
				? { providerRouteSlug: input.target.providerRouteSlug }
				: {}),
			...(input.target.searchTerm ? { searchTerm: input.target.searchTerm } : {}),
		});
		if (!url) return { opened: false };

		try {
			await browser.tabs.create({ url });
			return { opened: true };
		} catch {
			return { opened: false };
		}
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
