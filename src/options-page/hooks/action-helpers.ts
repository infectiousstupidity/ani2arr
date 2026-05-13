/** Shared helpers for options-page actions. */
// src/options-page/hooks/action-helpers.ts

import { removeProviderHostPermission } from "@/providers/settings/host-permissions";
import type { ExtensionOptions } from "@/settings";
import type { ExtensionError } from "@/shared/errors";

function isExtensionError(error: unknown): error is ExtensionError {
	if (!error || typeof error !== "object" || !("userMessage" in error)) {
		return false;
	}

	return typeof error.userMessage === "string";
}

export function getActionErrorMessage(error: unknown, fallback: string): string {
	if (isExtensionError(error) && error.userMessage.length > 0) {
		return error.userMessage;
	}

	if (error instanceof Error && error.message.length > 0) return error.message;
	if (typeof error === "string" && error.length > 0) return error;
	return fallback;
}

export async function cleanupOldHostPermission(
	oldUrl: string | undefined,
	newSettings: ExtensionOptions,
) {
	if (!oldUrl) return;

	try {
		const oldOrigin = new URL(oldUrl).origin;
		const sonarrOrigin = newSettings.providers.sonarr.url
			? new URL(newSettings.providers.sonarr.url).origin
			: null;
		const radarrOrigin = newSettings.providers.radarr.url
			? new URL(newSettings.providers.radarr.url).origin
			: null;

		// If the old origin is still used by either provider, keep the permission
		if (oldOrigin === sonarrOrigin || oldOrigin === radarrOrigin) {
			return;
		}

		await removeProviderHostPermission(oldUrl);
	} catch {
		// Ignore URL parsing errors for malformed old URLs
	}
}
