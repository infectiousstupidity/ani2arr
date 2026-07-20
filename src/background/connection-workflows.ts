/** Commits provider connections and applies their background-owned effects. */

import type { SeerrConnection } from "@/providers/seerr/types";
import type { Provider, ProviderCredentials } from "@/providers/types";
import {
	cleanupUnusedProviderHostPermission,
	removeSeerrCsrfCookiePermission,
} from "@/settings/provider-permissions";
import {
	getProviderCredentials,
	hasConfiguredProviderCredentials,
} from "@/settings/provider-config";
import {
	getSeerrConnection,
	hasConfiguredSeerrConnection,
} from "@/settings/seerr-config";
import {
	getExtensionOptionsSnapshot,
	saveProviderConnectionSnapshot,
	saveSeerrConnectionSnapshot,
} from "@/settings/store";
import type { ExtensionOptions } from "@/settings/types";
import { logError, normalizeError } from "@/shared/errors/error-utils";
import {
	bumpLibraryRevision,
	bumpMappingsRevision,
	refreshProviderLibrary,
} from "./api-services";
import { refreshMappingPipeline } from "./mapping-refresh";

async function attempt(effect: () => Promise<unknown>, scope: string) {
	try {
		await effect();
	} catch (error) {
		logError(normalizeError(error), `ConnectionWorkflow:${scope}`);
	}
}

function hasAnyConfiguredConnection(options: ExtensionOptions): boolean {
	return (
		hasConfiguredProviderCredentials(options, "sonarr") ||
		hasConfiguredProviderCredentials(options, "radarr") ||
		hasConfiguredSeerrConnection(options)
	);
}

async function refreshMappings(options: ExtensionOptions): Promise<void> {
	let revisionBumped = false;
	if (hasAnyConfiguredConnection(options)) {
		try {
			revisionBumped = await refreshMappingPipeline();
		} catch (error) {
			logError(normalizeError(error), "ConnectionWorkflow:refreshMappings");
		}
	}

	if (!revisionBumped) {
		await attempt(() => bumpMappingsRevision(), "bumpMappingsRevision");
	}
}

function sameProviderCredentials(
	left: ProviderCredentials | null,
	right: ProviderCredentials | null,
): boolean {
	return left?.url === right?.url && left?.apiKey === right?.apiKey;
}

function sameSeerrConnection(
	left: SeerrConnection | null,
	right: SeerrConnection | null,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export async function commitProviderConnection(
	provider: Provider,
	credentials: ProviderCredentials | null,
): Promise<void> {
	const previousOptions = await getExtensionOptionsSnapshot();
	const previousConnection = getProviderCredentials(previousOptions, provider);
	const savedOptions = await saveProviderConnectionSnapshot(provider, credentials);
	const savedConnection = getProviderCredentials(savedOptions, provider);
	if (sameProviderCredentials(previousConnection, savedConnection)) return;

	await refreshMappings(savedOptions);
	await attempt(
		() => refreshProviderLibrary(provider, savedOptions),
		`${provider}:refreshLibrary`,
	);
	await attempt(
		() => bumpLibraryRevision(provider),
		`${provider}:bumpLibraryRevision`,
	);
	await attempt(
		() =>
			cleanupUnusedProviderHostPermission(
				previousConnection?.url,
				savedOptions,
			),
		`${provider}:cleanupHostPermission`,
	);
}

export async function commitSeerrConnection(
	connection: SeerrConnection | null,
): Promise<void> {
	const previousOptions = await getExtensionOptionsSnapshot();
	const previousConnection = getSeerrConnection(previousOptions);
	const savedOptions = await saveSeerrConnectionSnapshot(connection);
	const savedConnection = getSeerrConnection(savedOptions);
	if (sameSeerrConnection(previousConnection, savedConnection)) return;

	await refreshMappings(savedOptions);
	await attempt(
		() =>
			cleanupUnusedProviderHostPermission(
				previousConnection?.url,
				savedOptions,
			),
		"seerr:cleanupHostPermission",
	);
	if (savedConnection?.auth.mode !== "session") {
		await attempt(
			() => removeSeerrCsrfCookiePermission(),
			"seerr:removeCookiePermission",
		);
	}
}
