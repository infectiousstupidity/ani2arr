/** Settings-facing provider permission lifecycle helpers for options actions. */
// src/settings/provider-permissions.ts

import { browser } from "wxt/browser";
import {
	getProviderHostPermissionPattern,
	removeProviderHostPermission,
	requestProviderHostPermission,
} from "@/providers/settings/host-permissions";
import type { ExtensionOptions } from "./types";

export const requestProviderConnectionPermission = (url: string) =>
	requestProviderHostPermission(url);

export async function removeSeerrCsrfCookiePermission(): Promise<void> {
	try {
		await browser.permissions.remove({
			permissions: ["cookies"],
		});
	} catch {
		// Permission may already be absent or browser-managed.
	}
}

function getPermissionPattern(url: string | undefined): string | null {
	if (!url) return null;

	const pattern = getProviderHostPermissionPattern(url);
	return pattern.ok ? pattern.value : null;
}

export async function cleanupUnusedProviderHostPermission(
	oldUrl: string | undefined,
	newSettings: ExtensionOptions,
) {
	if (!oldUrl) return;

	const oldPattern = getPermissionPattern(oldUrl);
	if (!oldPattern) return;

	const activePatterns = [
		getPermissionPattern(newSettings.providers.sonarr.url),
		getPermissionPattern(newSettings.providers.radarr.url),
		getPermissionPattern(newSettings.seerr.url),
	];
	if (activePatterns.includes(oldPattern)) {
		return;
	}

	await removeProviderHostPermission(oldUrl);
}
