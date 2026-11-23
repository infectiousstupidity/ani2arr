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
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

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
