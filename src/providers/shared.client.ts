/** Shared Sonarr and Radarr API client for common transport and connection checks. */
// src/providers/shared.client.ts

import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";
import type { ProviderCredentials } from "./types";

const REQUEST_TIMEOUT_MS = 15_000;
const ERROR_BODY_LIMIT = 4000;
const ERROR_MESSAGE_LIMIT = 240;
const ERROR_MESSAGE_KEYS = [
	"errorMessage",
	"message",
	"error",
	"title",
	"detail",
] as const;

type ProviderRequestOptions = Omit<RequestInit, "body"> & {
	json?: unknown;
};

export class ProviderApiClient {
	private readonly providerName: string;
	private readonly apiBasePath: string;
	private readonly hasUrlPermission: (url: string) => Promise<boolean>;

	public constructor(options: {
		providerName: string;
		apiBasePath: string;
		hasUrlPermission: (url: string) => Promise<boolean>;
	}) {
		this.providerName = options.providerName;
		this.apiBasePath = normalizeApiBasePath(options.apiBasePath);
		this.hasUrlPermission = options.hasUrlPermission;
	}

	public async testConnection(
		credentials: ProviderCredentials,
	): Promise<{ version: string }> {
		const json = await this.requestJson("system/status", credentials);
		const version = readVersion(json);

		if (!version) {
			throw createError(
				ErrorCode.API_ERROR,
				`${this.providerName} system status did not include a version.`,
				`${this.providerName} returned an invalid system status response.`,
			);
		}

		return { version };
	}

	protected async requestJson(
		endpoint: string,
		credentials: ProviderCredentials,
		options: ProviderRequestOptions = {},
	): Promise<unknown> {
		const response = await this.request(endpoint, credentials, options);

		if (response.status === 204) {
			throw createError(
				ErrorCode.API_ERROR,
				`${this.providerName} returned no content for ${endpoint}.`,
				`${this.providerName} returned an empty API response.`,
			);
		}

		try {
			return await response.json();
		} catch {
			throw createError(
				ErrorCode.API_ERROR,
				`${this.providerName} returned invalid JSON for ${endpoint}.`,
				`${this.providerName} returned an invalid API response.`,
			);
		}
	}

	protected async requestVoid(
		endpoint: string,
		credentials: ProviderCredentials,
		options: ProviderRequestOptions = {},
	): Promise<void> {
		await this.request(endpoint, credentials, options);
	}

	private async request(
		endpoint: string,
		credentials: ProviderCredentials,
		options: ProviderRequestOptions,
	): Promise<Response> {
		if (!credentials.url || !credentials.apiKey) {
			throw createError(
				ErrorCode.CONFIGURATION_ERROR,
				`${this.providerName} URL or API key is missing.`,
				`${this.providerName} URL or API key is missing.`,
			);
		}

		if (!(await this.hasUrlPermission(credentials.url))) {
			throw createError(
				ErrorCode.PERMISSION_ERROR,
				`Missing permission for ${this.providerName} URL: ${credentials.url}`,
				`Permission for the ${this.providerName} URL is required.`,
			);
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const { json, ...fetchOptions } = options;
			const body = json === undefined ? undefined : JSON.stringify(json);
			const requestOptions: RequestInit = {
				...fetchOptions,
				headers: this.buildHeaders(credentials, fetchOptions, body),
				credentials: "omit",
				referrerPolicy: "no-referrer",
				signal: controller.signal,
			};
			if (body !== undefined) requestOptions.body = body;

			// Extension requests should not carry browser credentials to provider hosts.
			const response = await fetch(
				this.buildUrl(credentials.url, endpoint),
				requestOptions,
			);

			if (!response.ok) {
				const providerMessage = await readProviderErrorMessage(
					response,
					credentials,
				);
				throw createError(
					ErrorCode.API_ERROR,
					`${this.providerName} API returned ${response.status} ${response.statusText}.`,
					providerMessage
						? `${this.providerName} rejected the request: ${providerMessage}`
						: `${this.providerName} returned an API error.`,
					{
						status: response.status,
						statusText: response.statusText,
						...(providerMessage ? { providerMessage } : {}),
					},
				);
			}

			return response;
		} finally {
			clearTimeout(timeout);
		}
	}

	private buildHeaders(
		credentials: ProviderCredentials,
		fetchOptions: RequestInit,
		body: string | undefined,
	): Headers {
		const headers = new Headers(fetchOptions.headers);
		headers.set("X-Api-Key", credentials.apiKey);
		if (body) headers.set("Content-Type", "application/json");
		return headers;
	}

	private buildUrl(baseUrl: string, endpoint: string): string {
		const base = baseUrl.trim().replace(/\/+$/, "");
		const path = endpoint.replace(/^\/+/, "");
		return `${base}${this.apiBasePath}/${path}`;
	}
}

function normalizeApiBasePath(apiBasePath: string): string {
	const trimmed = apiBasePath.trim();
	const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
	return path.replace(/\/+$/, "");
}

function readVersion(value: unknown): string | undefined {
	if (!value || typeof value !== "object") return undefined;
	const version = (value as Record<string, unknown>).version;
	return typeof version === "string" ? version.trim() || undefined : undefined;
}

async function readProviderErrorMessage(
	response: Response,
	credentials: ProviderCredentials,
): Promise<string | null> {
	let body: string;
	try {
		const text = await response.text();
		body = text.slice(0, ERROR_BODY_LIMIT);
	} catch {
		return null;
	}

	const parsed = parseProviderErrorBody(body);
	const rawMessage = findProviderErrorMessage(parsed ?? body);

	return rawMessage && sanitizeProviderErrorMessage(rawMessage, credentials);
}

function parseProviderErrorBody(body: string): unknown | null {
	try {
		return JSON.parse(body) as unknown;
	} catch {
		return null;
	}
}

function findProviderErrorMessage(value: unknown, depth = 0): string | null {
	if (depth > 3 || value === null || value === undefined) return null;

	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed || null;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			const message = findProviderErrorMessage(item, depth + 1);
			if (message) return message;
		}
		return null;
	}

	if (typeof value !== "object") return null;

	const record = value as Record<string, unknown>;
	for (const key of ERROR_MESSAGE_KEYS) {
		const message = findProviderErrorMessage(record[key], depth + 1);
		if (message) return message;
	}

	return findProviderErrorMessage(record.errors, depth + 1);
}

function sanitizeProviderErrorMessage(
	message: string,
	credentials: ProviderCredentials,
): string | null {
	let sanitized = message;
	const apiKey = credentials.apiKey.trim();
	const baseUrl = credentials.url.trim();

	sanitized = sanitized
		.replaceAll(/https?:\/\/\S+/gi, "[redacted url]")
		.replaceAll(/[\da-f]{32,}/gi, "[redacted]");

	if (apiKey) sanitized = sanitized.replaceAll(apiKey, "[redacted]");
	if (baseUrl) sanitized = sanitized.replaceAll(baseUrl, "[redacted url]");

	sanitized = [...sanitized]
		.map((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code < 32 || code === 127 ? " " : character;
		})
		.join("")
		.replaceAll(/\s+/g, " ")
		.trim();

	if (!sanitized) return null;
	return sanitized.length > ERROR_MESSAGE_LIMIT
		? `${sanitized.slice(0, ERROR_MESSAGE_LIMIT - 3)}...`
		: sanitized;
}
