/** Tests for shared Sonarr and Radarr provider transport and connection checks. */
// src/providers/shared.client.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@/shared/errors";
import type { ProviderCredentials } from "./types";
import { ProviderApiClient } from "./shared.client";

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

function createJsonResponse(body: unknown): Response {
	return Response.json(body, {
		headers: { "Content-Type": "application/json" },
	});
}

describe("ProviderApiClient", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("tests connection through system status", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ version: "4.0.1" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			new TestProviderClient().testConnection(credentials),
		).resolves.toEqual({ version: "4.0.1" });

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://provider.example/api/v3/system/status",
		);
		const request = fetchMock.mock.calls[0]?.[1];
		expect(request?.method).toBeUndefined();
		expect((request?.headers as Headers).get("X-Api-Key")).toBe("secret");
	});

	it("rejects system status responses without a version", async () => {
		for (const body of [{ version: "" }, { version: " " }, {}]) {
			const fetchMock = vi
				.fn<typeof fetch>()
				.mockResolvedValueOnce(createJsonResponse(body));
			vi.stubGlobal("fetch", fetchMock);

			await expect(
				new TestProviderClient().testConnection(credentials),
			).rejects.toMatchObject({
				code: ErrorCode.API_ERROR,
				userMessage: "Testarr returned an invalid system status response.",
			});

			vi.unstubAllGlobals();
		}
	});
});
