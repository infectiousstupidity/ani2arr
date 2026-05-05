import type { ExtensionOptions } from "@/options";
import type { Provider, ProviderCredentials } from "@/providers";
import {
	validateProviderConnectionApiKey,
	validateProviderConnectionUrl,
} from "@/providers/settings/provider-connection.schema";
import { shouldEnableProviderFormOptions } from "../hooks/provider-settings-actions.shared";

function getSavedCredentials(
	savedSettings: ExtensionOptions | undefined,
	provider: Provider,
): ProviderCredentials | null {
	const providerSettings = savedSettings?.providers[provider];
	if (!providerSettings?.url || !providerSettings.apiKey) {
		return null;
	}

	return {
		url: String(providerSettings.url).trim(),
		apiKey: String(providerSettings.apiKey).trim(),
	};
}

function getFormCredentials(
	url: string,
	apiKey: string,
): { formCredentials: ProviderCredentials | null; normalizedUrl: string } {
	const normalizedApiKey = String(apiKey).trim();
	const urlValidation = validateProviderConnectionUrl(String(url));
	const apiKeyValidation = validateProviderConnectionApiKey(String(apiKey));
	const normalizedUrl = urlValidation.ok
		? urlValidation.value
		: String(url).trim();

	if (!urlValidation.ok || !apiKeyValidation.ok) {
		return {
			formCredentials: null,
			normalizedUrl,
		};
	}

	return {
		formCredentials: {
			url: normalizedUrl,
			apiKey: normalizedApiKey,
		},
		normalizedUrl,
	};
}

export function deriveProviderPanelConnectionState(input: {
	savedSettings: ExtensionOptions | undefined;
	provider: Provider;
	url: string;
	apiKey: string;
	forceEditing: boolean;
	isLoading: boolean;
}): {
	formCredentials: ProviderCredentials | null;
	savedCredentials: ProviderCredentials | null;
	isEditingConnection: boolean;
	isProviderConfigured: boolean;
	hasConnectionChanges: boolean;
	formOptionsEnabled: boolean;
	normalizedUrl: string;
	shouldAutofocusUrl: boolean;
} {
	const { savedSettings, provider, url, apiKey, forceEditing, isLoading } =
		input;
	const savedCredentials = getSavedCredentials(savedSettings, provider);
	const { formCredentials, normalizedUrl } = getFormCredentials(url, apiKey);
	const isProviderConfigured = savedCredentials !== null;
	const isEditingConnection = forceEditing || !isProviderConfigured;

	return {
		formCredentials,
		savedCredentials,
		isEditingConnection,
		isProviderConfigured,
		hasConnectionChanges:
			formCredentials !== null &&
			(savedCredentials === null ||
				formCredentials.url !== savedCredentials.url ||
				formCredentials.apiKey !== savedCredentials.apiKey),
		formOptionsEnabled: shouldEnableProviderFormOptions({
			savedCredentials,
			formCredentials,
			isEditingConnection,
		}),
		normalizedUrl,
		shouldAutofocusUrl:
			!isLoading && !isProviderConfigured && normalizedUrl.length === 0,
	};
}
