/** Pure normalization helpers for Sonarr, Radarr, and Seerr connections. */
// src/settings/connection-config.ts

import { getProviderHostPermissionPattern } from "@/providers/settings/host-permissions";
import {
	validateProviderConnectionApiKey,
	validateProviderConnectionUrl,
} from "@/providers/settings/provider-connection.validation";
import type {
	Provider,
	ProviderCredentials,
} from "@/providers/types";
import type { ExtensionOptions } from "./types";

export type ConnectionKind = Provider | "seerr";

export type NormalizedConnection = ProviderCredentials & {
	permissionPattern: string;
};

const CONNECTION_LABELS = {
	sonarr: "Sonarr",
	radarr: "Radarr",
	seerr: "Seerr",
} as const satisfies Record<ConnectionKind, string>;

function trimConnection(
	input: Partial<ProviderCredentials> | undefined,
): ProviderCredentials {
	return {
		url: String(input?.url ?? "").trim(),
		apiKey: String(input?.apiKey ?? "").trim(),
	};
}

function getConnectionSettings(
	settings: ExtensionOptions | undefined,
	kind: ConnectionKind,
): ProviderCredentials | undefined {
	return kind === "seerr" ? settings?.seerr : settings?.providers[kind];
}

export function getConnectionDraft(
	settings: ExtensionOptions | undefined,
	kind: ConnectionKind,
): ProviderCredentials {
	return trimConnection(getConnectionSettings(settings, kind));
}

export function getConnectionCredentials(
	settings: ExtensionOptions | undefined,
	kind: ConnectionKind,
): ProviderCredentials | null {
	const { url, apiKey } = getConnectionDraft(settings, kind);
	if (!url || !apiKey) return null;
	return { url, apiKey };
}

export function normalizeConnectionInput(
	input: Partial<ProviderCredentials> | undefined,
	kind: ConnectionKind,
): NormalizedConnection | null {
	const label = CONNECTION_LABELS[kind];
	const { url, apiKey } = trimConnection(input);

	if (!url && !apiKey) {
		return null;
	}

	if (!url || !apiKey) {
		throw new Error(
			`${label}: enter both URL and API key, or leave both blank.`,
		);
	}

	const normalizedUrl = validateProviderConnectionUrl(url);
	const normalizedApiKey = validateProviderConnectionApiKey(apiKey);
	if (!normalizedUrl.ok || !normalizedApiKey.ok) {
		throw new Error(`Please enter a valid ${label} URL and API key.`);
	}

	const permissionPattern = getProviderHostPermissionPattern(
		normalizedUrl.value,
	);
	if (!permissionPattern.ok) {
		throw new Error(
			`Failed to update ${label} host permissions. Please try again.`,
		);
	}

	return {
		url: normalizedUrl.value,
		apiKey: normalizedApiKey.value,
		permissionPattern: permissionPattern.value,
	};
}

export function normalizeConnectionSettings(
	settings: ExtensionOptions | undefined,
	kind: ConnectionKind,
): NormalizedConnection | null {
	return normalizeConnectionInput(getConnectionDraft(settings, kind), kind);
}

export function hasConfiguredConnectionCredentials(
	settings: ExtensionOptions | undefined,
	kind: ConnectionKind,
): boolean {
	return getConnectionCredentials(settings, kind) !== null;
}
