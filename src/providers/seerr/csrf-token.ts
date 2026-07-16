/** Reads only Seerr's readable XSRF token when optional cookie access exists. */
// src/providers/seerr/csrf-token.ts

import { browser } from "wxt/browser";
import { normalizeProviderConnectionUrl } from "@/providers/settings/provider-connection.validation";

export const SEERR_XSRF_COOKIE_NAME = "XSRF-TOKEN";
export const SEERR_XSRF_HEADER_NAME = "X-XSRF-TOKEN";

export async function getSeerrXsrfToken(url: string): Promise<string | null> {
	try {
		const hasCookiePermission = await browser.permissions.contains({
			permissions: ["cookies"],
		});
		if (!hasCookiePermission) return null;

		const normalized = normalizeProviderConnectionUrl(url);
		if (!normalized.ok) return null;

		const cookie = await browser.cookies.get({
			url: normalized.value.normalizedUrl,
			name: SEERR_XSRF_COOKIE_NAME,
		});
		const value = cookie?.value.trim();
		if (!value) return null;

		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	} catch {
		return null;
	}
}

export async function removeSeerrCsrfCookiePermission(): Promise<void> {
	try {
		await browser.permissions.remove({
			permissions: ["cookies"],
		});
	} catch {
		// Permission may already be absent or browser-managed.
	}
}
