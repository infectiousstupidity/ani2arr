/** Builds provider UI links for opening Sonarr and Radarr entries or prefilled add flows. */
// src/providers/provider-links.ts

import type { Provider } from "@/providers/types";

export type ProviderOpenTarget =
	| { type: "add"; searchTerm?: string }
	| { type: "details"; providerRouteSlug: string; searchTerm?: string };

interface ProviderOpenTargetInput {
	isInLibrary: boolean;
	providerRouteSlug?: string | null | undefined;
	searchTerm?: string | null | undefined;
}

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

export function getProviderOpenTarget({
	isInLibrary,
	providerRouteSlug,
	searchTerm,
}: ProviderOpenTargetInput): ProviderOpenTarget {
	const trimmedSlug = providerRouteSlug?.trim();
	const trimmedSearchTerm = searchTerm?.trim();

	if (isInLibrary && trimmedSlug) {
		return {
			type: "details",
			providerRouteSlug: trimmedSlug,
			...(trimmedSearchTerm ? { searchTerm: trimmedSearchTerm } : {}),
		};
	}

	return {
		type: "add",
		...(trimmedSearchTerm ? { searchTerm: trimmedSearchTerm } : {}),
	};
}

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
