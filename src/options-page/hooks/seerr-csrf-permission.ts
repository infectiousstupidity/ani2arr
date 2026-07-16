/** User-triggered optional permission controls for Seerr CSRF support. */
// src/options-page/hooks/seerr-csrf-permission.ts

import { browser } from "wxt/browser";

export async function requestSeerrCsrfCookiePermission(): Promise<boolean> {
	try {
		return await browser.permissions.request({
			permissions: ["cookies"],
		});
	} catch {
		return false;
	}
}
