/** Tests for shared Sonarr and Radarr provider transport and connection checks. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@/shared/errors/error.types";
import { ProviderApiClient } from "./shared.client";
import type { ProviderCredentials } from "./types";

const credentials: ProviderCredentials = {
	url: "https://provider.example",
	apiKey: "secret",
};

class TestProviderClient extends ProviderApiClient {
	public constructor() {
		super({
			providerName: "Testarr",
			apiBasePath: "/api/v3",
			hasUrlPermission: async () => true,
		});
	}

	public async sendVoid(): Promise<void> {
		await this.requestVoid("action", credentials);
	}
}

const client = new TestProviderClient();

function stubFetch(response: Response) {
	const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(response);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function createErrorResponse(body: unknown, status = 400): Response {
	return new Response(typeof body === "string" ? body : JSON.stringify(body), {
		status,
		statusText: "Bad Request",
		headers: { "Content-Type": "application/json" },
	});
}

describe("ProviderApiClient", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each([200, 500])(
		"times out a stalled response body (HTTP %s)",
		async (status) => {
			vi.useFakeTimers();
			vi.stubGlobal(
				"fetch",
				vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
					const response = new Response(null, { status });
					const read = () =>
						new Promise<never>((_resolve, reject) => {
							init?.signal?.addEventListener("abort", () =>
								reject(new DOMException("Aborted", "AbortError")),
							);
						});
					vi.spyOn(
						response,
						status === 200 ? "json" : "text",
					).mockImplementation(read);
					return response;
				}),
			);
			let error: unknown;
			const request = client
				.testConnection(credentials)
				.catch((error_: unknown) => {
					error = error_;
				});
			await vi.advanceTimersByTimeAsync(14_999);
			expect(error).toBeUndefined();
			await vi.advanceTimersByTimeAsync(1);
			expect(error).toMatchObject({ code: ErrorCode.NETWORK_ERROR });
			await request;
			expect(vi.getTimerCount()).toBe(0);
		},
	);

	it("tests connection through system status", async () => {
		const fetchMock = stubFetch(Response.json({ version: "4.0.1" }));

		await expect(client.testConnection(credentials)).resolves.toEqual({
			version: "4.0.1",
		});

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://provider.example/api/v3/system/status",
		);
		const request = fetchMock.mock.calls[0]?.[1];
		if (!request) throw new Error("Expected fetch request options.");
		expect(request.method).toBeUndefined();
		expect(new Headers(request.headers).get("X-Api-Key")).toBe("secret");
	});

	it("cleans up deadlines for success, malformed JSON, empty and HTTP error responses", async () => {
		vi.useFakeTimers();
		stubFetch(Response.json({ version: "4" }));
		await expect(client.testConnection(credentials)).resolves.toEqual({
			version: "4",
		});
		expect(vi.getTimerCount()).toBe(0);

		stubFetch(new Response("not json"));
		await expect(client.testConnection(credentials)).rejects.toMatchObject({
			code: ErrorCode.API_ERROR,
			userMessage: "Testarr returned an invalid API response.",
		});
		expect(vi.getTimerCount()).toBe(0);

		stubFetch(new Response(null, { status: 204 }));
		await expect(client.testConnection(credentials)).rejects.toMatchObject({
			code: ErrorCode.API_ERROR,
			userMessage: "Testarr returned an empty API response.",
		});
		expect(vi.getTimerCount()).toBe(0);

		stubFetch(new Response(null, { status: 204 }));
		await expect(client.sendVoid()).resolves.toBeUndefined();
		expect(vi.getTimerCount()).toBe(0);

		stubFetch(createErrorResponse({ message: "Bad request" }));
		await expect(client.testConnection(credentials)).rejects.toMatchObject({
			code: ErrorCode.API_ERROR,
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	it("rejects system status responses without a version", async () => {
		for (const body of [{ version: " " }, {}]) {
			stubFetch(Response.json(body));

			await expect(client.testConnection(credentials)).rejects.toMatchObject({
				code: ErrorCode.API_ERROR,
				userMessage: "Testarr returned an invalid system status response.",
			});
		}
	});

	it("uses useful provider API error messages from JSON responses", async () => {
		stubFetch(
			createErrorResponse([
				{
					propertyName: "rootFolderPath",
					errorMessage: "Root folder does not exist.",
				},
			]),
		);

		await expect(client.testConnection(credentials)).rejects.toMatchObject({
			code: ErrorCode.API_ERROR,
			userMessage: "Testarr rejected the request: Root folder does not exist.",
			details: {
				status: 400,
				statusText: "Bad Request",
				providerMessage: "Root folder does not exist.",
			},
		});
	});

	it("sanitizes provider API error messages", async () => {
		stubFetch(
			createErrorResponse({
				message:
					"Bad request for https://provider.example/api/v3/movie using secret",
			}),
		);

		await expect(client.testConnection(credentials)).rejects.toMatchObject({
			userMessage:
				"Testarr rejected the request: Bad request for [redacted url] using [redacted]",
			details: {
				providerMessage: "Bad request for [redacted url] using [redacted]",
			},
		});
	});

	it("falls back when provider API errors have no useful body", async () => {
		stubFetch(new Response("", { status: 500 }));

		await expect(client.testConnection(credentials)).rejects.toMatchObject({
			code: ErrorCode.API_ERROR,
			userMessage: "Testarr returned an API error.",
			details: {
				status: 500,
			},
		});
	});
});
