/** Builds provider UI links for opening Sonarr and Radarr entries or prefilled add flows. */
// src/providers/provider-links.ts

import type { Provider } from "@/providers/types";

interface ProviderOpenUrlInput {
	provider: Provider;
	baseUrl: string; // Absolute provider root URL; trailing slash trimmed.
	isInLibrary: boolean;
	/** Provider detail-route slug for `/series/:slug` or `/movie/:slug`, not a filesystem folder name. */
	providerRouteSlug?: string;
	searchTerm?: string;
}

const detailRouteByProvider: Record<Provider, "series" | "movie"> = {
	sonarr: "series",
	radarr: "movie",
};

export function buildProviderOpenUrl({
	provider,
	baseUrl,
	isInLibrary,
	providerRouteSlug,
	searchTerm,
}: ProviderOpenUrlInput): string | null {
	const root = baseUrl.trim().replace(/\/+$/, "");
	if (!root) return null;

	if (isInLibrary && providerRouteSlug) {
		return `${root}/${detailRouteByProvider[provider]}/${providerRouteSlug}`;
	}

	const params = new URLSearchParams();
	if (searchTerm) params.set("term", searchTerm);

	const query = params.toString();
	return `${root}/add/new${query ? `?${query}` : ""}`;
}
