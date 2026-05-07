/** Focused tests for provider connection validation and cache scope normalization. */
// src/providers/settings/provider-connection.validation.test.ts

import { describe, expect, it } from "vitest";
import {
	getProviderConnectionScope,
	normalizeProviderConnectionUrl,
	validateProviderConnectionApiKey,
	validateProviderConnectionUrl,
} from "./provider-connection.validation";

describe("normalizeProviderConnectionUrl", () => {
	it("normalizes equivalent base URLs and exposes the origin", () => {
		expect(
			normalizeProviderConnectionUrl(" https://RADARR.example:443/api/// "),
		).toEqual({
			ok: true,
			value: {
				normalizedUrl: "https://radarr.example/api",
				origin: "https://radarr.example",
			},
		});
	});

	it("preserves non-default ports", () => {
		expect(validateProviderConnectionUrl("http://192.168.50.166:8181/")).toEqual(
			{
				ok: true,
				value: "http://192.168.50.166:8181",
			},
		);
	});

	it("rejects unsupported URL shapes", () => {
		expect(validateProviderConnectionUrl("")).toEqual({
			ok: false,
			error: "URL cannot be empty.",
		});
		expect(validateProviderConnectionUrl("ftp://arr.example")).toEqual({
			ok: false,
			error: "URL must use http or https.",
		});
		expect(validateProviderConnectionUrl("https://user:pass@arr.example")).toEqual(
			{
				ok: false,
				error: "Credentials in URL are not supported.",
			},
		);
		expect(validateProviderConnectionUrl("https://arr.example?apiKey=secret")).toEqual(
			{
				ok: false,
				error: "URL must not include query parameters or fragments.",
			},
		);
		expect(validateProviderConnectionUrl("https://arr.example/#settings")).toEqual(
			{
				ok: false,
				error: "URL must not include query parameters or fragments.",
			},
		);
		expect(validateProviderConnectionUrl("http://arr.example:0")).toEqual({
			ok: false,
			error: "Invalid port.",
		});
	});
});

describe("validateProviderConnectionApiKey", () => {
	it("trims non-empty API keys and rejects blank ones", () => {
		expect(validateProviderConnectionApiKey("  key-123  ")).toEqual({
			ok: true,
			value: "key-123",
		});
		expect(validateProviderConnectionApiKey("   ")).toEqual({
			ok: false,
			error: "API key cannot be empty.",
		});
	});
});

describe("getProviderConnectionScope", () => {
	it("uses normalized URL only and never leaks API keys", () => {
		const firstApiKey = "top-secret-key-one";
		const secondApiKey = "top-secret-key-two";

		const firstScope = getProviderConnectionScope({
			url: "https://EXAMPLE.com:443/api///",
			apiKey: firstApiKey,
		});
		const secondScope = getProviderConnectionScope({
			url: "https://example.com/api",
			apiKey: secondApiKey,
		});

		expect(firstScope).toBe("https://example.com/api");
		expect(secondScope).toBe(firstScope);

		const serializedScope = JSON.stringify(firstScope);
		expect(serializedScope).not.toContain(firstApiKey);
		expect(serializedScope).not.toContain(secondApiKey);
	});
});
