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

export async function requestSeerrCsrfCookiePermission(): Promise<boolean> {
	try {
		return await browser.permissions.request({
			permissions: ["cookies"],
		});
	} catch {
		return false;
	}
}

export async function removeOptionalPermission(
	permission: Parameters<typeof browser.permissions.remove>[0],
): Promise<boolean> {
	try {
		if (await browser.permissions.remove(permission)) return true;
	} catch {
		// Some browsers reject removal of a permission that is already absent.
	}
	try {
		return !(await browser.permissions.contains(permission));
	} catch {
		return false;
	}
}

export function removeSeerrCsrfCookiePermission(): Promise<boolean> {
	return removeOptionalPermission({ permissions: ["cookies"] });
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
