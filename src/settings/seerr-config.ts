/** Pure helpers for Seerr credentials and configured state. */
// src/settings/seerr-config.ts

import { getProviderHostPermissionPattern } from "@/providers/settings/host-permissions";
import {
	validateProviderConnectionApiKey,
	validateProviderConnectionUrl,
} from "@/providers/settings/provider-connection.validation";
import type { ProviderCredentials } from "@/providers/types";
import type { ExtensionOptions } from "./types";

export type NormalizedSeerrConnection = ProviderCredentials & {
	permissionPattern: string;
};

export function getSeerrConnectionDraft(
	settings: ExtensionOptions | undefined,
): ProviderCredentials {
	return {
		url: String(settings?.seerr.url ?? "").trim(),
		apiKey: String(settings?.seerr.apiKey ?? "").trim(),
	};
}

export function getSeerrCredentials(
	settings: ExtensionOptions | undefined,
): ProviderCredentials | null {
	const { url, apiKey } = getSeerrConnectionDraft(settings);
	if (!url || !apiKey) return null;
	return { url, apiKey };
}

export function normalizeSeerrConnectionInput(
	input: Partial<ProviderCredentials> | undefined,
): NormalizedSeerrConnection | null {
	const url = String(input?.url ?? "").trim();
	const apiKey = String(input?.apiKey ?? "").trim();

	if (!url && !apiKey) return null;

	if (!url || !apiKey) {
		throw new Error("Seerr: enter both URL and API key, or leave both blank.");
	}

	const normalizedUrl = validateProviderConnectionUrl(url);
	const normalizedApiKey = validateProviderConnectionApiKey(apiKey);
	if (!normalizedUrl.ok || !normalizedApiKey.ok) {
		throw new Error("Please enter a valid Seerr URL and API key.");
	}

	const permissionPattern = getProviderHostPermissionPattern(
		normalizedUrl.value,
	);
	if (!permissionPattern.ok) {
		throw new Error("Failed to update Seerr host permissions. Please try again.");
	}

	return {
		url: normalizedUrl.value,
		apiKey: normalizedApiKey.value,
		permissionPattern: permissionPattern.value,
	};
}

export function normalizeSeerrConnectionSettings(
	settings: ExtensionOptions | undefined,
): NormalizedSeerrConnection | null {
	return normalizeSeerrConnectionInput(getSeerrConnectionDraft(settings));
}

export function hasConfiguredSeerrCredentials(
	settings: ExtensionOptions | undefined,
): boolean {
	return getSeerrCredentials(settings) !== null;
}
