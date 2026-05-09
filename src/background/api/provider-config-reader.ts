/** Background-owned provider configuration access for required and optional credentials. */
// src/background/api/provider-config-reader.ts

import {
	getExtensionOptionsSnapshot,
	getProviderCredentials,
	type ExtensionOptions,
} from "@/settings";
import type { Provider, ProviderCredentials } from "@/providers";
import { getProviderLabel } from "@/providers/provider-labels";
import { createError, ErrorCode, type ExtensionError } from "@/shared/errors";

export type ConfiguredProvider = {
	credentials: ProviderCredentials;
	options: ExtensionOptions;
};

export type ProviderConfigReader = {
	get(provider: Provider): Promise<ProviderCredentials | null>;
	require(provider: Provider): Promise<ConfiguredProvider>;
	requireCredentials(provider: Provider): Promise<ProviderCredentials>;
};

export function createProviderNotConfiguredError(
	provider: Provider,
): ExtensionError {
	const label = getProviderLabel(provider);
	const code =
		provider === "sonarr"
			? ErrorCode.SONARR_NOT_CONFIGURED
			: ErrorCode.CONFIGURATION_ERROR;

	return createError(
		code,
		`${label} credentials are not configured.`,
		`Configure your ${label} connection in ani2arr options.`,
	);
}

const requireProvider = async (
	provider: Provider,
): Promise<ConfiguredProvider> => {
	const options = await getExtensionOptionsSnapshot();
	const credentials = getProviderCredentials(options, provider);
	if (!credentials) throw createProviderNotConfiguredError(provider);
	return { credentials, options };
};

export function createProviderConfigReader(): ProviderConfigReader {
	return {
		async get(provider) {
			const options = await getExtensionOptionsSnapshot();
			return getProviderCredentials(options, provider);
		},
		require: requireProvider,
		async requireCredentials(provider) {
			const { credentials } = await requireProvider(provider);
			return credentials;
		},
	};
}
