/** Seerr session and API-key connection actions for the options page. */

import { useState } from "react";
import { browser } from "wxt/browser";
import type { SeerrConnection } from "@/providers/seerr/types";
import {
	useExtensionOptions,
	useSaveSeerrConnection,
} from "@/queries/options";
import { getAni2arrApi } from "@/rpc";
import {
	requestProviderConnectionPermission,
	requestSeerrCsrfCookiePermission,
} from "@/settings/provider-permissions";
import {
	buildSeerrLoginUrl,
	getSeerrConnection,
	normalizeSeerrApiKeyConnectionInput,
	normalizeSeerrUrlInput,
} from "@/settings/seerr-config";
import { createError, getUserErrorMessage } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";

export type SeerrConnectionFailure = {
	message: string;
	code: ErrorCode | null;
};

function getExtensionErrorCode(error: unknown): ErrorCode | null {
	if (!error || typeof error !== "object" || !("code" in error)) return null;
	return typeof error.code === "string" ? (error.code as ErrorCode) : null;
}

function getFailure(
	error: unknown,
	fallbackMessage: string,
): SeerrConnectionFailure {
	return {
		message: getUserErrorMessage(error, fallbackMessage),
		code: getExtensionErrorCode(error),
	};
}

export function useSeerrConnectionActions() {
	const { data: currentSettings } = useExtensionOptions();
	const saveSeerrConnection = useSaveSeerrConnection();
	const [isConnecting, setIsConnecting] = useState(false);
	const [failure, setFailure] = useState<SeerrConnectionFailure | null>(null);
	const [openedLoginUrl, setOpenedLoginUrl] = useState<string | null>(null);
	const [isCsrfSupportEnabled, setIsCsrfSupportEnabled] = useState(false);

	const checkSeerrSession = async (draftUrl: string): Promise<void> => {
		setIsConnecting(true);
		setFailure(null);

		try {
			const normalizedUrl = normalizeSeerrUrlInput(draftUrl);
			if (!normalizedUrl) throw new Error("Please enter a valid Seerr URL.");

			const permission = await requestProviderConnectionPermission(
				normalizedUrl,
			);
			if (!permission.ok || !permission.value.granted) {
				throw new Error("Host permission was denied.");
			}

			const api = getAni2arrApi();
			const { account } = await api.checkSeerrSession({
				url: normalizedUrl,
			});
			const connection: SeerrConnection = {
				url: normalizedUrl,
				auth: { mode: "session" },
				account,
			};
			await saveSeerrConnection.mutateAsync({
				connection,
			});

			setOpenedLoginUrl(null);
		} catch (error) {
			const code = getExtensionErrorCode(error);
			const checkedUrl =
				code === ErrorCode.SEERR_AUTH_REQUIRED
					? normalizeSeerrUrlInput(draftUrl)
					: null;
			setFailure(
				code === ErrorCode.SEERR_AUTH_REQUIRED &&
				openedLoginUrl === checkedUrl
					? {
							code: ErrorCode.SEERR_SESSION_UNAVAILABLE,
							message:
								"Could not use your Seerr browser session. Make sure you signed in, check third-party-cookie settings for this server, or use API-key mode when Seerr CSRF protection is disabled.",
						}
					: getFailure(error, "Failed to check the Seerr browser session."),
			);
		} finally {
			setIsConnecting(false);
		}
	};

	const connectSeerrApiKey = async (
		draftUrl: string,
		draftApiKey: string,
	): Promise<void> => {
		setIsConnecting(true);
		setFailure(null);

		try {
			const normalized = normalizeSeerrApiKeyConnectionInput({
				url: draftUrl,
				apiKey: draftApiKey,
			});
			const permission = await requestProviderConnectionPermission(
				normalized.url,
			);
			if (!permission.ok || !permission.value.granted) {
				throw new Error("Host permission was denied.");
			}

			const api = getAni2arrApi();
			await api.testSeerrApiKeyConnection({
				url: normalized.url,
				apiKey: normalized.auth.apiKey,
			});
			await saveSeerrConnection.mutateAsync({
				connection: { url: normalized.url, auth: normalized.auth },
			});

			setOpenedLoginUrl(null);
			setIsCsrfSupportEnabled(false);
		} catch (error) {
			setFailure(
				getFailure(error, "Failed to connect to Seerr with the API key."),
			);
		} finally {
			setIsConnecting(false);
		}
	};

	const openSeerrLogin = async (draftUrl: string): Promise<void> => {
		setIsConnecting(true);

		try {
			const normalizedUrl = normalizeSeerrUrlInput(draftUrl);
			if (!normalizedUrl) throw new Error("Please enter a valid Seerr URL.");
			await browser.tabs.create({ url: buildSeerrLoginUrl(draftUrl) });
			setOpenedLoginUrl(normalizedUrl);
		} catch (error) {
			setFailure(getFailure(error, "Failed to open the Seerr login page."));
		} finally {
			setIsConnecting(false);
		}
	};

	const enableSeerrCsrfSupport = async (): Promise<void> => {
		const connection = getSeerrConnection(currentSettings);
		if (!connection || connection.auth.mode !== "session") return;

		setIsConnecting(true);
		setFailure(null);

		try {
			const granted = await requestSeerrCsrfCookiePermission();
			if (!granted) {
				throw createError(
					ErrorCode.PERMISSION_ERROR,
					"Optional cookie permission was denied.",
					"Cookie access was denied. Request creation remains unavailable while this Seerr server requires CSRF validation.",
				);
			}

			await getAni2arrApi().checkConfiguredSeerrCsrfSupport();
			setIsCsrfSupportEnabled(true);
		} catch (error) {
			setFailure(getFailure(error, "Failed to enable Seerr CSRF support."));
		} finally {
			setIsConnecting(false);
		}
	};

	const disconnectSeerr = async (): Promise<boolean> => {
		setIsConnecting(true);
		setFailure(null);

		try {
			await saveSeerrConnection.mutateAsync({
				connection: null,
			});

			setOpenedLoginUrl(null);
			setIsCsrfSupportEnabled(false);
			return true;
		} catch (error) {
			setFailure(getFailure(error, "Failed to disconnect Seerr."));
			return false;
		} finally {
			setIsConnecting(false);
		}
	};

	return {
		checkSeerrSession,
		connectSeerrApiKey,
		openSeerrLogin,
		enableSeerrCsrfSupport,
		disconnectSeerr,
		isConnecting,
		isCsrfSupportEnabled,
		failure,
	};
}
