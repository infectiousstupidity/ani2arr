/** Shared Arr provider API client for common transport and connection checks. */
// src/providers/shared.client.ts

import { createError, ErrorCode } from "@/shared/errors";
import type { ProviderCredentials } from "./types";

const REQUEST_TIMEOUT_MS = 15_000;

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
				throw createError(
					ErrorCode.API_ERROR,
					`${this.providerName} API returned ${response.status} ${response.statusText}.`,
					`${this.providerName} returned an API error.`,
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
