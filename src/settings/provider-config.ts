/** Pure helpers to extract provider credentials and configured state from ExtensionOptions. */
// src/settings/provider-config.ts

import { getProviderHostPermissionPattern } from "@/providers/settings/host-permissions";
import { getProviderLabel } from "@/providers/provider-labels";
import {
	validateProviderConnectionApiKey,
	validateProviderConnectionUrl,
} from "@/providers/settings/provider-connection.validation";
import type { Provider, ProviderCredentials } from "@/providers";
import type { ExtensionOptions, PublicOptions } from "./types";

export type NormalizedProviderConnection = ProviderCredentials & {
	permissionPattern: string;
};

const hasProviderShape = (
	options: unknown,
): options is Pick<PublicOptions, "providers"> => {
	if (!options || typeof options !== "object") return false;
	const maybeProviders = (options as { providers?: unknown }).providers;
	return Boolean(maybeProviders && typeof maybeProviders === "object");
};

export function getProviderConnectionDraft(
	settings: ExtensionOptions | undefined,
	provider: Provider,
): ProviderCredentials {
	const config = settings?.providers[provider];
	return {
		url: String(config?.url ?? "").trim(),
		apiKey: String(config?.apiKey ?? "").trim(),
	};
}

/**
 * Extract trimmed credentials for a provider, or `null` if either field is missing/empty.
 * Pure derivation — no side effects, no throws.
 */
export function getProviderCredentials(
	settings: ExtensionOptions | undefined,
	provider: Provider,
): ProviderCredentials | null {
	const { url, apiKey } = getProviderConnectionDraft(settings, provider);
	if (!url || !apiKey) return null;
	return { url, apiKey };
}

export function normalizeProviderConnectionInput(
	input: Partial<ProviderCredentials> | undefined,
	provider: Provider,
): NormalizedProviderConnection | null {
	const label = getProviderLabel(provider);
	const url = String(input?.url ?? "").trim();
	const apiKey = String(input?.apiKey ?? "").trim();

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

export function normalizeProviderConnectionSettings(
	settings: ExtensionOptions | undefined,
	provider: Provider,
): NormalizedProviderConnection | null {
	return normalizeProviderConnectionInput(
		getProviderConnectionDraft(settings, provider),
		provider,
	);
}

/** Convenience boolean: is the provider fully configured in the given settings? */
export function hasConfiguredProviderCredentials(
	settings: ExtensionOptions | undefined,
	provider: Provider,
): boolean {
	return getProviderCredentials(settings, provider) !== null;
}

export const getProviderBaseUrl = (
	provider: Provider,
	options: unknown,
): string => {
	if (!hasProviderShape(options)) return "";
	return options.providers?.[provider]?.url ?? "";
};
