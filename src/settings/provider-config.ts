/** Pure helpers for Arr provider connection normalization and configured state. */

import { getProviderLabel } from "@/providers/provider-labels";
import {
	validateProviderConnectionApiKey,
	validateProviderConnectionUrl,
} from "@/providers/settings/provider-connection.validation";
import type {
	Provider,
	ProviderCredentials,
} from "@/providers/types";
import type { ExtensionOptions } from "./types";

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
): ProviderCredentials | null {
	const label = getProviderLabel(provider);
	const url = String(input?.url ?? "").trim();
	const apiKey = String(input?.apiKey ?? "").trim();

	if (!url && !apiKey) return null;

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

	return {
		url: normalizedUrl.value,
		apiKey: normalizedApiKey.value,
	};
}

export function normalizeProviderConnectionSettings(
	settings: ExtensionOptions | undefined,
	provider: Provider,
): ProviderCredentials | null {
	return normalizeProviderConnectionInput(
		getProviderConnectionDraft(settings, provider),
		provider,
	);
}

export function hasConfiguredProviderCredentials(
	settings: ExtensionOptions | undefined,
	provider: Provider,
): boolean {
	return getProviderCredentials(settings, provider) !== null;
}
