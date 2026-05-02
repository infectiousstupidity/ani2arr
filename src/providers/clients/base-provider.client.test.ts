/** Tests for provider base transport behavior. */
// src/providers/clients/base-provider.client.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@/shared/errors";
import type { ProviderCredentials } from "@/providers";
import { BaseProviderClient } from "./base-provider.client";

const credentials: ProviderCredentials = {
	url: "https://provider.example",
	apiKey: "secret",
};

class TestProviderClient extends BaseProviderClient {
	public constructor(
		hasUrlPermission: (url: string) => Promise<boolean> = async () => true,
		timeoutMs?: number,
	) {
		super({
			providerName: "Testarr",
			logScope: "TestProviderClient",
			hasUrlPermission,
			...(timeoutMs === undefined ? {} : { timeoutMs }),
		});
	}

	public requestResource(endpoint: string): Promise<unknown> {
		return this.requestJson(endpoint, credentials);
	}

	public deleteResource(endpoint: string): Promise<void> {
		return this.requestVoid(endpoint, credentials, { method: "DELETE" });
	}
}

function createJsonResponse(body: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "application/json");

	return Response.json(body, {
		...init,
		headers,
	});
}

describe("BaseProviderClient", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("returns JSON with API key and secure fetch options", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ id: 123, title: null }));
		vi.stubGlobal("fetch", fetchMock);
		const client = new TestProviderClient();

		await expect(client.requestResource("resource")).resolves.toEqual({
			id: 123,
			title: null,
		});

		const requestInit = fetchMock.mock.calls[0]?.[1];
		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://provider.example/api/v3/resource",
		);
		expect(requestInit).toMatchObject({
			credentials: "omit",
			referrerPolicy: "no-referrer",
		});
		expect((requestInit?.headers as Headers).get("X-Api-Key")).toBe("secret");
	});

	it("checks URL permission before fetching", async () => {
		const fetchMock = vi.fn<typeof fetch>();
		vi.stubGlobal("fetch", fetchMock);
		const hasUrlPermission = vi.fn().mockResolvedValue(false);
		const client = new TestProviderClient(hasUrlPermission);

		await expect(client.requestResource("resource")).rejects.toMatchObject({
			code: ErrorCode.PERMISSION_ERROR,
			userMessage:
				"Permission for the Testarr URL is required. Please grant access in the extension options.",
		});
		expect(hasUrlPermission).toHaveBeenCalledWith("https://provider.example");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects invalid and empty JSON responses", async () => {
		for (const response of [
			new Response("ok", { headers: { "Content-Type": "text/plain" } }),
			new Response("{", { headers: { "Content-Type": "application/json" } }),
		]) {
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(response);
			vi.stubGlobal("fetch", fetchMock);
			const client = new TestProviderClient();

			await expect(client.requestResource("resource")).rejects.toMatchObject({
				code: ErrorCode.API_ERROR,
				userMessage: "Testarr returned an invalid API response.",
			});

			vi.unstubAllGlobals();
		}

		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);
		const client = new TestProviderClient();

		await expect(client.deleteResource("resource")).resolves.toBeUndefined();
		await expect(client.requestResource("resource")).rejects.toMatchObject({
			code: ErrorCode.API_ERROR,
			userMessage: "Testarr returned an empty API response.",
		});
	});

	it("aborts requests after the configured timeout", async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn<typeof fetch>().mockImplementation(
			(_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => {
						reject(new Error("request aborted"));
					});
				}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const client = new TestProviderClient(async () => true, 10);

		const request = expect(
			client.requestResource("resource"),
		).rejects.toMatchObject({
			code: ErrorCode.UNKNOWN_ERROR,
			userMessage: "An unexpected error occurred. Please try again.",
		});
		await vi.advanceTimersByTimeAsync(10);

		await request;
	});
});
