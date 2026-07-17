/** Seerr API client with session-aware transport and request identity checks. */
// src/providers/seerr/client.ts

import { readProviderErrorMessage } from "@/providers/provider-error";
import { createError } from "@/shared/errors/error-utils";
import {
	ErrorCode,
	type ExtensionError,
} from "@/shared/errors/error.types";
import {
	readSeerrMediaDetails,
	readSeerrMediaStatus,
	readSeerrSearchResults,
} from "./request";
import { SEERR_XSRF_HEADER_NAME } from "./csrf-token";
import type {
	SeerrAccountSummary,
	SeerrConnection,
	SeerrMediaDetails,
	SeerrMediaStatusInput,
	SeerrMediaRequest,
	SeerrMediaStatus,
	SeerrRequestPayload,
	SeerrSearchResult,
} from "./types";

const REQUEST_TIMEOUT_MS = 15_000;

type SeerrRequestOptions = Omit<RequestInit, "body"> & {
	json?: unknown;
};

export class SeerrClient {
	private readonly hasUrlPermission: (url: string) => Promise<boolean>;
	private readonly getCsrfToken: (url: string) => Promise<string | null>;

	public constructor(options: {
		hasUrlPermission: (url: string) => Promise<boolean>;
		getCsrfToken?: (url: string) => Promise<string | null>;
	}) {
		this.hasUrlPermission = options.hasUrlPermission;
		this.getCsrfToken = options.getCsrfToken ?? (async () => null);
	}

	public async getCurrentUser(
		connection: SeerrConnection,
	): Promise<SeerrAccountSummary> {
		const response = await this.request("auth/me", connection);
		if (!response.ok) {
			if (isAccessDenied(response) && connection.auth.mode === "session") {
				throw createSeerrAuthRequiredError();
			}
			throw await createSeerrResponseError(response, connection);
		}

		const json = await readJsonResponse(response, "auth/me");
		return readSeerrAccountSummary(json);
	}

	public async validateConnection(
		connection: SeerrConnection,
	): Promise<{ account: SeerrAccountSummary }> {
		const account = await this.getCurrentUser(connection);
		if (connection.auth.mode === "session" && connection.account) {
			assertMatchingSeerrAccount(connection.account, account);
		}
		return { account };
	}

	public async requestMedia(
		payload: SeerrRequestPayload,
		connection: SeerrConnection,
	): Promise<SeerrMediaRequest> {
		if (connection.auth.mode === "session") {
			await this.assertVerifiedSessionAccount(connection);
		}

		const response = await this.request("request", connection, {
			method: "POST",
			json: payload,
		});
		if (!response.ok) {
			if (connection.auth.mode === "session" && isAccessDenied(response)) {
				await this.assertVerifiedSessionAccount(connection);
			}
			throw await createSeerrResponseError(response, connection);
		}

		return readJsonResponse(
			response,
			"request",
		) as Promise<SeerrMediaRequest>;
	}

	public async searchMedia(
		query: string,
		connection: SeerrConnection,
	): Promise<SeerrSearchResult[]> {
		const trimmed = query.trim();
		if (!trimmed) return [];

		const qs = new URLSearchParams({ query: trimmed })
			.toString()
			.replaceAll("+", "%20")
			.replaceAll("*", "%2A");
		const json = await this.requestJson(`search?${qs}`, connection);
		return readSeerrSearchResults(json);
	}

	public async getMediaDetails(
		input: Pick<SeerrMediaStatusInput, "mediaType" | "tmdbId">,
		connection: SeerrConnection,
	): Promise<SeerrMediaDetails> {
		const route = input.mediaType === "movie" ? "movie" : "tv";
		const details = await this.requestJson(
			`${route}/${input.tmdbId}`,
			connection,
		);
		return readSeerrMediaDetails(details, input.mediaType);
	}

	public async getMediaStatus(
		input: SeerrMediaStatusInput,
		connection: SeerrConnection,
	): Promise<SeerrMediaStatus> {
		const route = input.mediaType === "movie" ? "movie" : "tv";
		const details = await this.requestJson(
			`${route}/${input.tmdbId}`,
			connection,
		);
		return readSeerrMediaStatus(details, input);
	}

	private async assertVerifiedSessionAccount(
		connection: SeerrConnection,
	): Promise<void> {
		if (!connection.account) throw createSeerrAuthRequiredError();
		await this.validateConnection(connection);
	}

	private async requestJson(
		endpoint: string,
		connection: SeerrConnection,
		options: SeerrRequestOptions = {},
	): Promise<unknown> {
		const response = await this.request(endpoint, connection, options);
		if (!response.ok) {
			if (connection.auth.mode === "session" && isAccessDenied(response)) {
				await this.getCurrentUser(connection);
			}
			throw await createSeerrResponseError(response, connection);
		}

		return readJsonResponse(response, endpoint);
	}

	private async request(
		endpoint: string,
		connection: SeerrConnection,
		options: SeerrRequestOptions = {},
	): Promise<Response> {
		assertConfiguredConnection(connection);

		if (!(await this.hasUrlPermission(connection.url))) {
			throw createError(
				ErrorCode.PERMISSION_ERROR,
				"Missing permission for configured Seerr URL.",
				"Permission for the Seerr URL is required.",
			);
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const { json, ...fetchOptions } = options;
			const body = json === undefined ? undefined : JSON.stringify(json);
			const headers = new Headers(fetchOptions.headers);
			if (connection.auth.mode === "apiKey") {
				headers.set("X-Api-Key", connection.auth.apiKey);
			}
			if (
				connection.auth.mode === "session" &&
				isStateChangingMethod(fetchOptions.method)
			) {
				const csrfToken = await this.getCsrfToken(connection.url).catch(
					() => null,
				);
				if (csrfToken) headers.set(SEERR_XSRF_HEADER_NAME, csrfToken);
			}
			if (body !== undefined) headers.set("Content-Type", "application/json");

			const requestOptions: RequestInit = {
				...fetchOptions,
				headers,
				credentials:
					connection.auth.mode === "session" ? "include" : "omit",
				referrerPolicy: "no-referrer",
				signal: controller.signal,
				...(body === undefined ? {} : { body }),
			};

			return await fetch(buildSeerrApiUrl(connection.url, endpoint), requestOptions);
		} catch (error) {
			if (
				connection.auth.mode === "session" &&
				(controller.signal.aborted || error instanceof TypeError)
			) {
				throw createError(
					ErrorCode.SEERR_SESSION_UNAVAILABLE,
					controller.signal.aborted
						? "Seerr session request timed out."
						: "Seerr session request failed.",
					"Could not use your Seerr browser session. Check the server, network, and third-party-cookie settings, or use API-key mode when Seerr CSRF protection is disabled.",
				);
			}
			throw error;
		} finally {
			clearTimeout(timeout);
		}
	}
}

function assertConfiguredConnection(connection: SeerrConnection): void {
	const hasAuth =
		connection.auth.mode === "session" || connection.auth.apiKey.trim();
	if (connection.url.trim() && hasAuth) return;

	throw createError(
		ErrorCode.CONFIGURATION_ERROR,
		"Seerr connection is incomplete.",
		"Configure the Seerr connection in ani2arr options.",
	);
}

function buildSeerrApiUrl(baseUrl: string, endpoint: string): string {
	const base = baseUrl.trim().replace(/\/+$/, "");
	const path = endpoint.replace(/^\/+/, "");
	return `${base}/api/v1/${path}`;
}

function isAccessDenied(response: Response): boolean {
	return response.status === 401 || response.status === 403;
}

function isStateChangingMethod(method: string | undefined): boolean {
	const normalized = method?.toUpperCase();
	return ["POST", "PUT", "PATCH", "DELETE"].includes(normalized ?? "");
}

async function readJsonResponse(
	response: Response,
	endpoint: string,
): Promise<unknown> {
	if (response.status === 204) {
		throw createError(
			ErrorCode.API_ERROR,
			`Seerr returned no content for ${endpoint}.`,
			"Seerr returned an empty API response.",
		);
	}

	try {
		return await response.json();
	} catch {
		throw createError(
			ErrorCode.API_ERROR,
			`Seerr returned invalid JSON for ${endpoint}.`,
			"Seerr returned an invalid API response.",
		);
	}
}

function readSeerrAccountSummary(value: unknown): SeerrAccountSummary {
	if (!value || typeof value !== "object") {
		throw createInvalidAccountResponseError();
	}

	const record = value as Record<string, unknown>;
	const id = record.id;
	const displayName =
		typeof record.displayName === "string" ? record.displayName.trim() : "";
	if (
		typeof id !== "number" ||
		!Number.isInteger(id) ||
		id < 1 ||
		!displayName
	) {
		throw createInvalidAccountResponseError();
	}

	const avatar = typeof record.avatar === "string" ? record.avatar.trim() : "";
	return {
		id,
		displayName,
		...(avatar ? { avatar } : {}),
	};
}

function createInvalidAccountResponseError(): ExtensionError {
	return createError(
		ErrorCode.API_ERROR,
		"Seerr auth/me did not include a valid account summary.",
		"Seerr returned an invalid account response.",
	);
}

function createSeerrAuthRequiredError(): ExtensionError {
	return createError(
		ErrorCode.SEERR_AUTH_REQUIRED,
		"Seerr browser session is not authenticated.",
		"You are not signed into this Seerr server. Open Seerr, sign in, then check again.",
	);
}

function assertMatchingSeerrAccount(
	verifiedAccount: SeerrAccountSummary,
	currentAccount: SeerrAccountSummary,
): void {
	if (currentAccount.id === verifiedAccount.id) return;

	throw createError(
		ErrorCode.SEERR_ACCOUNT_CHANGED,
		`Seerr account changed from ${verifiedAccount.id} to ${currentAccount.id}.`,
		`The Seerr account changed from ${verifiedAccount.displayName} to ${currentAccount.displayName}. Re-check this account in ani2arr options before requesting.`,
		{
			previousAccount: verifiedAccount,
			currentAccount,
		},
	);
}

async function createSeerrResponseError(
	response: Response,
	connection: SeerrConnection,
): Promise<ExtensionError> {
	const providerMessage = await readProviderErrorMessage(response, {
		url: connection.url,
		...(connection.auth.mode === "apiKey"
			? { apiKey: connection.auth.apiKey }
			: {}),
	});
	const details = {
		status: response.status,
		statusText: response.statusText,
		...(providerMessage ? { providerMessage } : {}),
	};
	const normalizedMessage = providerMessage?.toLowerCase() ?? "";

	if (
		normalizedMessage.includes("invalid csrf token") ||
		normalizedMessage.includes("xsrf") ||
		normalizedMessage.includes("csrf")
	) {
		return createError(
			ErrorCode.SEERR_CSRF_REQUIRED,
			"Seerr rejected the request because CSRF validation is required.",
			connection.auth.mode === "apiKey"
				? "Seerr CSRF protection blocks API-key request creation. Switch to browser-session authentication and enable CSRF support to create requests."
				: "Seerr requires CSRF validation for this session. Enable CSRF support to let ani2arr read only this server's XSRF token.",
			details,
		);
	}

	if (normalizedMessage.includes("quota exceeded")) {
		return createError(
			ErrorCode.SEERR_QUOTA_EXCEEDED,
			"Seerr rejected the request because the user quota was exceeded.",
			providerMessage
				? `Seerr rejected the request: ${providerMessage}`
				: "Your Seerr request quota has been exceeded.",
			details,
		);
	}

	if (
		isAccessDenied(response) &&
		(normalizedMessage.includes("permission") ||
			connection.auth.mode === "apiKey")
	) {
		return createError(
			ErrorCode.SEERR_PERMISSION_DENIED,
			`Seerr denied the request with ${response.status}.`,
			providerMessage
				? `Seerr rejected the request: ${providerMessage}`
				: "Seerr denied this request.",
			details,
		);
	}

	return createError(
		ErrorCode.API_ERROR,
		`Seerr API returned ${response.status} ${response.statusText}.`,
		providerMessage
			? `Seerr rejected the request: ${providerMessage}`
			: "Seerr returned an API error.",
		details,
	);
}
