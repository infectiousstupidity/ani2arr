/** Seerr session and API-key connection actions for the options page. */

import { useState } from "react";
import { browser } from "wxt/browser";
import {
	type QueryClient,
	useQueryClient,
} from "@tanstack/react-query";
import type { SeerrConnection } from "@/providers/seerr/types";
import { queryKeys } from "@/queries/query-keys";
import {
	useExtensionOptions,
	useSaveSeerrConnection,
} from "@/queries/options";
import { getAni2arrApi, type Ani2arrApi } from "@/rpc";
import {
	cleanupUnusedProviderHostPermission,
	removeSeerrCsrfCookiePermission,
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

async function refreshSeerrMappings(
	api: Ani2arrApi,
	queryClient: QueryClient,
): Promise<void> {
	queryClient.removeQueries({ queryKey: queryKeys.seerrRoot() });
	try {
		await api.refreshMappingPipeline();
		queryClient.invalidateQueries({
			queryKey: queryKeys.mappingIdentitiesRoot(),
		});
		queryClient.invalidateQueries({ queryKey: queryKeys.mappings() });
		queryClient.invalidateQueries({ queryKey: queryKeys.seerrTargetsRoot() });
	} catch {
		// Seerr remains usable if the upstream mapping refresh is temporarily unavailable.
	}
}

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
	const queryClient = useQueryClient();
	const { data: currentSettings } = useExtensionOptions();
	const saveSeerrConnection = useSaveSeerrConnection();
	const [isConnecting, setIsConnecting] = useState(false);
	const [failure, setFailure] = useState<SeerrConnectionFailure | null>(null);
	const [openedLoginUrl, setOpenedLoginUrl] = useState<string | null>(null);
	const [isCsrfSupportEnabled, setIsCsrfSupportEnabled] = useState(false);

	const checkSeerrSession = async (draftUrl: string): Promise<void> => {
		if (!currentSettings) return;

		setIsConnecting(true);
		setFailure(null);

		try {
			const normalized = normalizeSeerrUrlInput(draftUrl);
			if (!normalized) throw new Error("Please enter a valid Seerr URL.");

			const permission = await requestProviderConnectionPermission(
				normalized.url,
			);
			if (!permission.ok || !permission.value.granted) {
				throw new Error("Host permission was denied.");
			}

			const api = getAni2arrApi();
			const { account } = await api.checkSeerrSession({
				url: normalized.url,
			});
			const connection: SeerrConnection = {
				url: normalized.url,
				auth: { mode: "session" },
				account,
			};
			const newSettings = await saveSeerrConnection.mutateAsync({
				connection,
			});

			await refreshSeerrMappings(api, queryClient);
			await cleanupUnusedProviderHostPermission(
				currentSettings.seerr.url,
				newSettings,
			);
			setOpenedLoginUrl(null);
		} catch (error) {
			const code = getExtensionErrorCode(error);
			const checkedUrl =
				code === ErrorCode.SEERR_AUTH_REQUIRED
					? normalizeSeerrUrlInput(draftUrl)?.url ?? null
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
		if (!currentSettings) return;

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
			const newSettings = await saveSeerrConnection.mutateAsync({
				connection: { url: normalized.url, auth: normalized.auth },
			});

			await refreshSeerrMappings(api, queryClient);
			await cleanupUnusedProviderHostPermission(
				currentSettings.seerr.url,
				newSettings,
			);
			await removeSeerrCsrfCookiePermission();
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
			const normalized = normalizeSeerrUrlInput(draftUrl);
			if (!normalized) throw new Error("Please enter a valid Seerr URL.");
			await browser.tabs.create({ url: buildSeerrLoginUrl(draftUrl) });
			setOpenedLoginUrl(normalized.url);
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
		if (!currentSettings) return false;

		setIsConnecting(true);
		setFailure(null);

		try {
			const oldUrl = currentSettings.seerr.url;
			const newSettings = await saveSeerrConnection.mutateAsync({
				connection: null,
			});

			queryClient.removeQueries({ queryKey: queryKeys.seerrRoot() });
			await cleanupUnusedProviderHostPermission(oldUrl, newSettings);
			await removeSeerrCsrfCookiePermission();
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
