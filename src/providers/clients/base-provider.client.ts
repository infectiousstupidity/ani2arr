/** Base transport client for provider API requests with permission checks, retries, timeouts, and ETag caching. */
// src/providers/clients/base-provider.client.ts

import * as v from "valibot";
import {
	createError,
	ErrorCode,
	logError,
	normalizeError,
} from "@/shared/errors";
import { logger } from "@/shared/utils/logger";
import { AbortError, withRetry } from "@/shared/utils/retry";
import type { ProviderCredentials } from "@/providers";
import { ProviderSystemStatusApiSchema } from "@/providers/schemas/provider-shared.schemas";

interface BaseProviderClientOptions {
	providerName: string;
	logScope?: string;
	apiBasePath?: string;
	timeoutMs?: number;
	cacheableEndpoints?: Iterable<string>;
	hasUrlPermission: (url: string) => Promise<boolean>;
}

type CachedResponse = {
	etag: string;
	data: unknown;
};

type ProviderResponse = {
	response: Response;
	isCacheable: boolean;
	cacheKey: string;
};

export class BaseProviderClient {
	protected readonly log;

	private readonly providerName: string;
	private readonly apiBasePath: string;
	private readonly timeoutMs: number;
	private readonly hasUrlPermission: (url: string) => Promise<boolean>;
	private readonly etagCache = new Map<string, CachedResponse>();
	private readonly cacheableEndpoints: Set<string>;

	public constructor(options: BaseProviderClientOptions) {
		this.providerName = options.providerName;
		this.apiBasePath = this.normalizeApiBasePath(
			options.apiBasePath ?? "/api/v3",
		);
		this.timeoutMs = options.timeoutMs ?? 15_000;
		this.hasUrlPermission = options.hasUrlPermission;
		this.cacheableEndpoints = new Set(options.cacheableEndpoints);
		this.log = logger.create(
			options.logScope ?? `${options.providerName}Client`,
		);
	}

	public clearEtagCache(): void {
		this.etagCache.clear();
	}

	public async testConnection(
		credentials: ProviderCredentials,
	): Promise<{ version: string }> {
		const status = await this.requestParsed(
			"system/status",
			credentials,
			ProviderSystemStatusApiSchema,
		);
		const version = status.version?.trim();

		if (!version) {
			throw createError(
				ErrorCode.API_ERROR,
				`${this.providerName} system status did not include a version.`,
				`${this.providerName} returned an invalid system status response.`,
			);
		}

		return { version };
	}

	protected invalidateCachedEndpoint(endpoint: string, baseUrl?: string): void {
		const normalizedEndpoint = this.normalizeEndpoint(endpoint);

		if (baseUrl) {
			this.etagCache.delete(
				this.createEtagCacheKey(baseUrl, normalizedEndpoint),
			);
			return;
		}

		for (const key of this.etagCache.keys()) {
			if (key.endsWith(`|${normalizedEndpoint}`)) {
				this.etagCache.delete(key);
			}
		}
	}

	protected async requestParsed<TSchema extends v.GenericSchema>(
		endpoint: string,
		credentials: ProviderCredentials,
		schema: TSchema,
		fetchOptions: RequestInit = {},
	): Promise<v.InferOutput<TSchema>> {
		const { response, isCacheable, cacheKey } =
			await this.fetchProviderResponse(endpoint, credentials, fetchOptions);

		if (response.status === 304 && isCacheable) {
			const cached = this.etagCache.get(cacheKey)?.data as
				| v.InferOutput<TSchema>
				| undefined;
			if (cached !== undefined) return cached;

			throw createError(
				ErrorCode.API_ERROR,
				`${this.providerName} returned 304 for ${endpoint}, but no cached response is available.`,
				`${this.providerName} returned an invalid cached response.`,
				{ endpoint },
			);
		}

		if (response.status === 204) {
			throw createError(
				ErrorCode.API_ERROR,
				`${this.providerName} returned no content for ${endpoint}.`,
				`${this.providerName} returned an empty API response.`,
				{ endpoint },
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
				{ endpoint, contentType: response.headers.get("content-type") },
			);
		}

		let json: unknown;
		try {
			json = await response.json();
		} catch (error) {
			throw createError(
				ErrorCode.API_ERROR,
				`${this.providerName} returned malformed JSON for ${endpoint}.`,
				`${this.providerName} returned an invalid API response.`,
				{
					endpoint,
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}

		const parsed = this.parseResponse(schema, json, endpoint);

		if (isCacheable) {
			const nextEtag = response.headers.get("ETag");
			if (nextEtag) {
				this.etagCache.set(cacheKey, { etag: nextEtag, data: parsed });
			}
		}

		return parsed;
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
	): Promise<ProviderResponse> {
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

		try {
			return await withRetry(
				async () => {
					const controller = new AbortController();
					const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

					const method = (fetchOptions.method ?? "GET")
						.toString()
						.toUpperCase();
					const normalizedEndpoint = this.normalizeEndpoint(endpoint);
					const cacheKey = this.createEtagCacheKey(
						credentials.url,
						normalizedEndpoint,
					);
					const isCacheable =
						method === "GET" &&
						this.cacheableEndpoints.has(normalizedEndpoint) &&
						endpoint === normalizedEndpoint;

					const headers = new Headers(fetchOptions.headers ?? undefined);
					if (fetchOptions.body) {
						headers.set("Content-Type", "application/json");
					}
					headers.set("X-Api-Key", credentials.apiKey);
					if (isCacheable && this.etagCache.has(cacheKey)) {
						headers.set("If-None-Match", this.etagCache.get(cacheKey)!.etag);
					}

					const init: RequestInit = {
						...fetchOptions,
						headers,
						referrerPolicy: "no-referrer",
						credentials: "omit",
						signal: controller.signal,
					};

					let response: Response;
					try {
						response = await fetch(requestUrl, init);
					} finally {
						clearTimeout(timeout);
					}

					if (response.status === 304 && isCacheable) {
						return { response, isCacheable, cacheKey };
					}

					if (!response.ok) {
						await this.throwResponseError(response);
					}

					return { response, isCacheable, cacheKey };
				},
				{
					retries: 3,
					extractRetryAfterMs: (error) =>
						(error as { retryAfterMs?: number })?.retryAfterMs,
				},
			);
		} catch (error) {
			const normalized = normalizeError(error);
			logError(normalized, `${this.providerName}Client:request:${endpoint}`);
			throw normalized;
		}
	}

	private async throwResponseError(response: Response): Promise<never> {
		const retryAfterMs = this.getRetryAfterMs(response);
		let detail: unknown;
		try {
			detail = await response.clone().json();
		} catch {
			// ignore non-JSON errors
		}

		const baseMessage = `${this.providerName} API Error: ${response.status} ${response.statusText}`;
		const err = new Error(baseMessage) as Error & {
			retryAfterMs?: number;
			detail?: unknown;
		};
		if (retryAfterMs !== undefined) err.retryAfterMs = retryAfterMs;
		if (detail !== undefined) err.detail = detail;

		if (
			response.status >= 400 &&
			response.status < 500 &&
			response.status !== 429
		) {
			throw new AbortError(err.message);
		}
		throw err;
	}

	private getRetryAfterMs(response: Response): number | undefined {
		const retryAfterHeader = response.headers.get("Retry-After");
		if (response.status !== 429 || !retryAfterHeader) return undefined;

		const seconds = Number(retryAfterHeader);
		if (Number.isFinite(seconds)) {
			return Math.max(0, seconds * 1000);
		}

		const parsedDate = Date.parse(retryAfterHeader);
		if (Number.isNaN(parsedDate)) return undefined;

		return Math.max(0, parsedDate - Date.now());
	}

	private parseResponse<TSchema extends v.GenericSchema>(
		schema: TSchema,
		json: unknown,
		endpoint: string,
	): v.InferOutput<TSchema> {
		try {
			return v.parse(schema, json);
		} catch (error) {
			throw createError(
				ErrorCode.API_ERROR,
				`${this.providerName} returned an invalid response for ${endpoint}.`,
				`${this.providerName} returned an invalid API response.`,
				{
					endpoint,
					issues: (error as { issues?: unknown }).issues,
				},
			);
		}
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

	private normalizeEndpoint(endpoint: string): string {
		const [path] = endpoint.split("?");
		return path ?? endpoint;
	}

	private createEtagCacheKey(
		baseUrl: string,
		normalizedEndpoint: string,
	): string {
		const origin = new URL(baseUrl).origin;
		return `${origin}|${normalizedEndpoint}`;
	}
}
