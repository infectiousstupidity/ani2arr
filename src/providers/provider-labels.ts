/** Provider display labels for service names and external provider IDs. */
// src/providers/provider-labels.ts

import type { ProviderIdentity } from "./provider-id";
import type { Provider } from "./types";

const PROVIDER_LABELS = {
	sonarr: "Sonarr",
	radarr: "Radarr",
} as const satisfies Record<Provider, Capitalize<Provider>>;

const PROVIDER_ID_LABELS = {
	sonarr: "TVDB",
	radarr: "TMDB",
} as const satisfies Record<Provider, "TMDB" | "TVDB">;

export const getProviderLabel = (provider: Provider): Capitalize<Provider> =>
	PROVIDER_LABELS[provider];

export const getProviderIdLabel = (provider: Provider): "TMDB" | "TVDB" =>
	PROVIDER_ID_LABELS[provider];

export const getProviderIdentityIdLabel = (
	identity: ProviderIdentity,
): string => `${getProviderIdLabel(identity.provider)} #${identity.providerId}`;

export const getProviderIdentityLabel = (identity: ProviderIdentity): string =>
	`${getProviderLabel(identity.provider)} · ${getProviderIdentityIdLabel(identity)}`;
