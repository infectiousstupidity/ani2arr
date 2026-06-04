/** Settings-facing provider permission lifecycle helpers for options actions. */
// src/settings/provider-permissions.ts

import {
	removeProviderHostPermission,
	requestProviderHostPermission,
} from "@/providers/settings/host-permissions";
import type { ExtensionOptions } from "./types";

export const requestProviderConnectionPermission = (url: string) =>
	requestProviderHostPermission(url);

export async function cleanupUnusedProviderHostPermission(
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

		if (oldOrigin === sonarrOrigin || oldOrigin === radarrOrigin) {
			return;
		}

		await removeProviderHostPermission(oldUrl);
	} catch {
		// Ignore malformed old URLs; they cannot map to a removable permission.
	}
}
