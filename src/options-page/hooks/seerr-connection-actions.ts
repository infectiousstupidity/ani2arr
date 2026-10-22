/** Seerr session and API-key connection actions for the options page. */
// src/options-page/hooks/seerr-connection-actions.ts

import { useCallback, useState } from "react";
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
import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";
import { getActionErrorMessage } from "./action-helpers";

async function refreshSeerrMappings(
	api: Ani2arrApi,
	queryClient: QueryClient,
): Promise<void> {
	queryClient.removeQueries({ queryKey: queryKeys.seerrRoot() });
	try {
		await api.initMappings();
		queryClient.invalidateQueries({
			queryKey: queryKeys.mappingIdentitiesRoot(),
		});
		queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
		queryClient.invalidateQueries({ queryKey: queryKeys.seerrTargetsRoot() });
	} catch {
		// Seerr remains usable if the upstream mapping refresh is temporarily unavailable.
	}
}

function getExtensionErrorCode(error: unknown): ErrorCode | null {
	if (!error || typeof error !== "object" || !("code" in error)) return null;
	return typeof error.code === "string" ? (error.code as ErrorCode) : null;
}

export function useSeerrActions() {
	const queryClient = useQueryClient();
	const { data: currentSettings } = useExtensionOptions();
	const saveSeerrConnection = useSaveSeerrConnection();

	const [isConnecting, setIsConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
	const [openedLoginUrl, setOpenedLoginUrl] = useState<string | null>(null);
	const [isCsrfSupportEnabled, setIsCsrfSupportEnabled] = useState(false);

	const checkSeerrSession = useCallback(
		async (draftUrl: string) => {
			if (!currentSettings) return false;

			setIsConnecting(true);
			setError(null);
			setErrorCode(null);

			try {
				const normalized = normalizeSeerrUrlInput(draftUrl);
				if (!normalized) {
					throw new Error("Please enter a valid Seerr URL.");
				}

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
				return true;
			} catch (error_) {
				const code = getExtensionErrorCode(error_);
				const checkedUrl =
					code === ErrorCode.SEERR_AUTH_REQUIRED
						? normalizeSeerrUrlInput(draftUrl)?.url ?? null
						: null;
				if (
					code === ErrorCode.SEERR_AUTH_REQUIRED &&
					openedLoginUrl === checkedUrl
				) {
					setErrorCode(ErrorCode.SEERR_SESSION_UNAVAILABLE);
					setError(
						"Could not use your Seerr browser session. Make sure you signed in, check third-party-cookie settings for this server, or use API-key mode when Seerr CSRF protection is disabled.",
					);
				} else {
					setErrorCode(code);
					setError(
						getActionErrorMessage(
							error_,
							"Failed to check the Seerr browser session.",
						),
					);
				}
				return false;
			} finally {
				setIsConnecting(false);
			}
		},
		[
			currentSettings,
			openedLoginUrl,
			queryClient,
			saveSeerrConnection,
		],
	);

	const connectSeerrApiKey = useCallback(
		async (draftUrl: string, draftApiKey: string) => {
			if (!currentSettings) return false;

			setIsConnecting(true);
			setError(null);
			setErrorCode(null);

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
					connection: {
						url: normalized.url,
						auth: normalized.auth,
					},
				});

				await refreshSeerrMappings(api, queryClient);
				await cleanupUnusedProviderHostPermission(
					currentSettings.seerr.url,
					newSettings,
				);
				await removeSeerrCsrfCookiePermission();

				setOpenedLoginUrl(null);
				setIsCsrfSupportEnabled(false);
				return true;
			} catch (error_) {
				setErrorCode(getExtensionErrorCode(error_));
				setError(
					getActionErrorMessage(
						error_,
						"Failed to connect to Seerr with the API key.",
					),
				);
				return false;
			} finally {
				setIsConnecting(false);
			}
		},
		[currentSettings, queryClient, saveSeerrConnection],
	);

	const openSeerrLogin = useCallback(async (draftUrl: string) => {
		setIsConnecting(true);

		try {
			const normalized = normalizeSeerrUrlInput(draftUrl);
			if (!normalized) throw new Error("Please enter a valid Seerr URL.");
			await browser.tabs.create({ url: buildSeerrLoginUrl(draftUrl) });
			setOpenedLoginUrl(normalized.url);
			return true;
		} catch (error_) {
			setErrorCode(getExtensionErrorCode(error_));
			setError(
				getActionErrorMessage(error_, "Failed to open the Seerr login page."),
			);
			return false;
		} finally {
			setIsConnecting(false);
		}
	}, []);

	const enableSeerrCsrfSupport = useCallback(async () => {
		const connection = getSeerrConnection(currentSettings);
		if (!connection || connection.auth.mode !== "session") return false;

		setIsConnecting(true);
		setError(null);
		setErrorCode(null);

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
			return true;
		} catch (error_) {
			setErrorCode(getExtensionErrorCode(error_));
			setError(
				getActionErrorMessage(error_, "Failed to enable Seerr CSRF support."),
			);
			return false;
		} finally {
			setIsConnecting(false);
		}
	}, [currentSettings]);

	const disconnectSeerr = useCallback(async () => {
		if (!currentSettings) return false;

		setIsConnecting(true);
		setError(null);
		setErrorCode(null);

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
		} catch (error_) {
			setErrorCode(getExtensionErrorCode(error_));
			setError(getActionErrorMessage(error_, "Failed to disconnect Seerr."));
			return false;
		} finally {
			setIsConnecting(false);
		}
	}, [currentSettings, queryClient, saveSeerrConnection]);

	return {
		checkSeerrSession,
		connectSeerrApiKey,
		openSeerrLogin,
		enableSeerrCsrfSupport,
		disconnectSeerr,
		isConnecting,
		isCsrfSupportEnabled,
		error,
		errorCode,
	};
}
