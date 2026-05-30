/** Background-owned provider configuration access for required and optional credentials. */
// src/background/api/provider-config.ts

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

export async function getProviderConfig(
	provider: Provider,
): Promise<ProviderCredentials | null> {
	const options = await getExtensionOptionsSnapshot();
	return getProviderCredentials(options, provider);
}

export async function requireProviderConfig(
	provider: Provider,
): Promise<ConfiguredProvider> {
	const options = await getExtensionOptionsSnapshot();
	const credentials = getProviderCredentials(options, provider);
	if (!credentials) throw createProviderNotConfiguredError(provider);

	return { credentials, options };
}

export async function requireProviderCredentials(
	provider: Provider,
): Promise<ProviderCredentials> {
	const { credentials } = await requireProviderConfig(provider);
	return credentials;
}
