/** Base transport client for provider API requests. Boring HTTP wrapper. */
// src/providers/clients/base-provider.client.ts

import {
	createError,
	ErrorCode,
	logError,
	normalizeError,
} from "@/shared/errors";
import { logger } from "@/shared/utils/logger";
import type { ProviderCredentials } from "@/providers";

interface BaseProviderClientOptions {
	providerName: string;
	logScope?: string;
	apiBasePath?: string;
	timeoutMs?: number;
	hasUrlPermission: (url: string) => Promise<boolean>;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}

function trimmedString(value: unknown): string | undefined {
	return typeof value === "string" ? value.trim() || undefined : undefined;
}

export class BaseProviderClient {
	protected readonly log;
	private readonly providerName: string;
	private readonly apiBasePath: string;
	private readonly timeoutMs: number;
	private readonly hasUrlPermission: (url: string) => Promise<boolean>;

	public constructor(options: BaseProviderClientOptions) {
		this.providerName = options.providerName;
		this.apiBasePath = this.normalizeApiBasePath(
			options.apiBasePath ?? "/api/v3",
		);
		this.timeoutMs = options.timeoutMs ?? 15_000;
		this.hasUrlPermission = options.hasUrlPermission;
		this.log = logger.create(
			options.logScope ?? `${options.providerName}Client`,
		);
	}

	public async testConnection(
		credentials: ProviderCredentials,
	): Promise<{ version: string }> {
		const json = await this.requestJson("system/status", credentials);
		const version = trimmedString(asRecord(json).version);

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
		fetchOptions: RequestInit = {},
	): Promise<unknown> {
		const response = await this.fetchProviderResponse(
			endpoint,
			credentials,
			fetchOptions,
		);

		if (response.status === 204) {
			throw createError(
				ErrorCode.API_ERROR,
				`${this.providerName} returned no content for ${endpoint}.`,
				`${this.providerName} returned an empty API response.`,
			);
		}

		const isJson = response.headers
			.get("content-type")
			?.includes("application/json");
		if (!isJson) {
			throw createError(
				ErrorCode.API_ERROR,
				`${this.providerName} returned a non-JSON response for ${endpoint}.`,
				`${this.providerName} returned an invalid API response.`,
			);
		}

		try {
			return await response.json();
		} catch {
			throw createError(
				ErrorCode.API_ERROR,
				`${this.providerName} returned malformed JSON for ${endpoint}.`,
				`${this.providerName} returned an invalid API response.`,
			);
		}
	}

	protected async requestVoid(
		endpoint: string,
		credentials: ProviderCredentials,
		fetchOptions: RequestInit = {},
	): Promise<void> {
		await this.fetchProviderResponse(endpoint, credentials, fetchOptions);
	}

	private async fetchProviderResponse(
		endpoint: string,
		credentials: ProviderCredentials,
		fetchOptions: RequestInit = {},
	): Promise<Response> {
		if (!credentials.url || !credentials.apiKey) {
			throw createError(
				ErrorCode.CONFIGURATION_ERROR,
				`${this.providerName} URL or API Key not provided.`,
				`${this.providerName} URL or API Key is missing.`,
			);
		}

		if (!(await this.hasUrlPermission(credentials.url))) {
			throw createError(
				ErrorCode.PERMISSION_ERROR,
				`Missing permission for ${this.providerName} URL: ${credentials.url}`,
				`Permission for the ${this.providerName} URL is required. Please grant access in the extension options.`,
			);
		}

		const requestUrl = this.buildRequestUrl(credentials.url, endpoint);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

		const headers = new Headers(fetchOptions.headers);
		if (fetchOptions.body) headers.set("Content-Type", "application/json");
		headers.set("X-Api-Key", credentials.apiKey);

		try {
			const response = await fetch(requestUrl, {
				...fetchOptions,
				headers,
				referrerPolicy: "no-referrer",
				credentials: "omit",
				signal: controller.signal,
			});

			if (!response.ok) {
				await this.throwResponseError(response);
			}

			return response;
		} catch (error) {
			const normalized = normalizeError(error);
			logError(normalized, `${this.providerName}Client:request:${endpoint}`);
			throw normalized;
		} finally {
			clearTimeout(timeout);
		}
	}

	private async throwResponseError(response: Response): Promise<never> {
		let detail: unknown;
		try {
			detail = await response.clone().json();
		} catch {
			/* ignore */
		}

		const baseMessage = `${this.providerName} API Error: ${response.status} ${response.statusText}`;
		const err = new Error(baseMessage) as Error & { detail?: unknown };
		if (detail !== undefined) err.detail = detail;

		throw err;
	}

	private buildRequestUrl(baseUrl: string, endpoint: string): string {
		const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
		const normalizedEndpoint = endpoint.replace(/^\/+/, "");
		return `${normalizedBaseUrl}${this.apiBasePath}/${normalizedEndpoint}`;
	}

	private normalizeApiBasePath(apiBasePath: string): string {
		const trimmed = apiBasePath.trim();
		const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
		return withLeadingSlash.replace(/\/+$/, "");
	}
}
