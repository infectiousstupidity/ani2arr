/** Provider display labels for service names and external provider IDs. */
// src/providers/provider-labels.ts

import type { Provider } from "./types";

const PROVIDER_LABELS = {
	sonarr: "Sonarr",
	radarr: "Radarr",
} as const satisfies Record<Provider, Capitalize<Provider>>;

const PROVIDER_EXTERNAL_ID_LABELS = {
	sonarr: "TVDB",
	radarr: "TMDB",
} as const satisfies Record<Provider, "TMDB" | "TVDB">;

export const getProviderLabel = (provider: Provider): Capitalize<Provider> =>
	PROVIDER_LABELS[provider];

export const getProviderExternalIdLabel = (
	provider: Provider,
): "TMDB" | "TVDB" => PROVIDER_EXTERNAL_ID_LABELS[provider];

export const formatProviderExternalId = (
	provider: Provider,
	providerId: number,
): string => `${getProviderExternalIdLabel(provider)} #${providerId}`;
