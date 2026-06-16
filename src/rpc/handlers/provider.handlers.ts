/** Shared RPC handlers and helpers for provider connection flows. */
// src/rpc/handlers/provider.handlers.ts

import { browser } from "wxt/browser";
import {
	radarrClient,
	seerrClient,
	sonarrClient,
} from "@/background/api-services";
import {
	getProviderConfig,
	getSeerrConfig,
} from "@/background/provider-config";
import { buildProviderOpenUrl } from "@/providers/provider-links";
import type {
	OpenProviderPageInput,
	OpenProviderPageOutput,
	OpenSeerrPageInput,
	OpenSeerrPageOutput,
	ProviderConnectionTestInput,
} from "@/rpc/types";
import { normalizeSeerrConnectionInput } from "@/settings/seerr-config";
import { normalizeInputCredentials } from "./provider-credentials";

async function openTab(url?: string | null): Promise<{ opened: boolean }> {
	if (!url) return { opened: false };

	try {
		await browser.tabs.create({ url });
		return { opened: true };
	} catch {
		return { opened: false };
	}
}

export const providerHandlers = {
	async openProviderPage({
		provider,
		target,
	}: OpenProviderPageInput): Promise<OpenProviderPageOutput> {
		const config = await getProviderConfig(provider);
		const isDetails = target.type === "details";

		if (!config || (isDetails && !target.providerRouteSlug?.trim())) {
			return { opened: false };
		}

		return openTab(
			buildProviderOpenUrl({
				provider,
				baseUrl: config.url,
				isInLibrary: isDetails,
				...(isDetails ? { providerRouteSlug: target.providerRouteSlug } : {}),
				...("searchTerm" in target && target.searchTerm
					? { searchTerm: target.searchTerm }
					: {}),
			}),
		);
	},

	async openSeerrPage({
		mediaType,
		tmdbId,
	}: OpenSeerrPageInput): Promise<OpenSeerrPageOutput> {
		const config = await getSeerrConfig();
		const root = config?.url.trim().replace(/\/+$/, "");

		if (!root) return { opened: false };

		return openTab(
			`${root}/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}`,
		);
	},

	testSonarrConnection: ({ credentials }: ProviderConnectionTestInput) =>
		sonarrClient.testConnection(
			normalizeInputCredentials("sonarr", credentials),
		),

	testRadarrConnection: ({ credentials }: ProviderConnectionTestInput) =>
		radarrClient.testConnection(
			normalizeInputCredentials("radarr", credentials),
		),

	testSeerrConnection({ credentials }: ProviderConnectionTestInput) {
		const creds = normalizeSeerrConnectionInput(credentials);
		if (!creds) throw new Error("Seerr credentials are required.");

		return seerrClient.validateConnection({
			url: creds.url,
			apiKey: creds.apiKey,
		});
	},
};
