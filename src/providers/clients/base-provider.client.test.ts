/** Tests for schema-aware provider base transport behavior. */
// src/providers/clients/base-provider.client.test.ts

import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@/shared/errors";
import { TvdbIdSchema } from "@/providers/provider-id";
import type { ProviderCredentials } from "@/providers";
import { BaseProviderClient } from "./base-provider.client";

const credentials: ProviderCredentials = {
	url: "https://provider.example",
	apiKey: "secret",
};

class TestProviderClient extends BaseProviderClient {
	public constructor(
		hasUrlPermission: (url: string) => Promise<boolean> = async () => true,
	) {
		super({
			providerName: "Testarr",
			logScope: "TestProviderClient",
			cacheableEndpoints: ["resource"],
			hasUrlPermission,
		});
	}

	public requestResource<TSchema extends v.GenericSchema>(
		endpoint: string,
		schema: TSchema,
	): Promise<v.InferOutput<TSchema>> {
		return this.requestParsed(endpoint, credentials, schema);
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
	});

	it("parses successful JSON responses with the supplied schema", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ id: 123, title: null }));
		vi.stubGlobal("fetch", fetchMock);
		const client = new TestProviderClient();
		const schema = v.object({
			id: TvdbIdSchema,
			title: v.nullable(v.string()),
		});

		await expect(client.requestResource("resource", schema)).resolves.toEqual({
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

	it("caches parsed data for cacheable ETag responses", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse(
					{ version: " 1.0.0 " },
					{ headers: { ETag: '"resource-v1"' } },
				),
			)
			.mockResolvedValueOnce(new Response(null, { status: 304 }));
		vi.stubGlobal("fetch", fetchMock);
		const client = new TestProviderClient();
		const schema = v.pipe(
			v.object({ version: v.string() }),
			v.transform((input) => ({
				version: input.version.trim(),
				parsed: true as const,
			})),
		);

		const first = await client.requestResource("resource", schema);
		const second = await client.requestResource("resource", schema);

		expect(first).toEqual({ version: "1.0.0", parsed: true });
		expect(second).toEqual(first);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(
			(fetchMock.mock.calls[1]?.[1]?.headers as Headers).get("If-None-Match"),
		).toBe('"resource-v1"');
	});

	it("fails at the client boundary when response IDs do not match the schema", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ id: 0 }));
		vi.stubGlobal("fetch", fetchMock);
		const client = new TestProviderClient();
		const schema = v.object({ id: TvdbIdSchema });

		await expect(
			client.requestResource("resource", schema),
		).rejects.toMatchObject({
			code: ErrorCode.API_ERROR,
			userMessage: "Testarr returned an invalid API response.",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("allows no-body endpoints to return void", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);
		const client = new TestProviderClient();

		await expect(client.deleteResource("resource")).resolves.toBeUndefined();
	});
});
