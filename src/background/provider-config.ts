/** Background-owned provider configuration access for required and optional credentials. */
// src/background/provider-config.ts

import { getExtensionOptionsSnapshot } from "@/settings/store";
import { getProviderCredentials } from "@/settings/provider-config";
import { getSeerrCredentials } from "@/settings/seerr-config";
import type { ExtensionOptions } from "@/settings/types";
import type {
	Provider,
	ProviderCredentials,
} from "@/providers/types";
import { getProviderLabel } from "@/providers/provider-labels";
import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";
import type { ExtensionError } from "@/shared/errors/error.types";

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

export function createSeerrNotConfiguredError(): ExtensionError {
	return createError(
		ErrorCode.CONFIGURATION_ERROR,
		"Seerr credentials are not configured.",
		"Configure your Seerr connection in ani2arr options.",
	);
}

export async function getSeerrConfig(): Promise<ProviderCredentials | null> {
	const options = await getExtensionOptionsSnapshot();
	return getSeerrCredentials(options);
}

export async function requireSeerrCredentials(): Promise<ProviderCredentials> {
	const options = await getExtensionOptionsSnapshot();
	const credentials = getSeerrCredentials(options);
	if (!credentials) throw createSeerrNotConfiguredError();

	return credentials;
}
