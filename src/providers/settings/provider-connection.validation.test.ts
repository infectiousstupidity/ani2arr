/** Focused tests for provider connection validation and cache scope normalization. */
/* eslint-disable unicorn/prefer-https */

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

	it.each([
		["http://192.168.50.166:8181/", "http://192.168.50.166:8181"],
		["https://arr.example:8443/radarr///", "https://arr.example:8443/radarr"],
	])("normalizes %s", (input, expected) => {
		expect(validateProviderConnectionUrl(input)).toEqual({
			ok: true,
			value: expected,
		});
	});

	it.each([
		["", "URL cannot be empty."],
		["ftp://arr.example", "URL must use http or https."],
		["https://user:pass@arr.example", "Credentials in URL are not supported."],
		[
			"https://arr.example?apiKey=secret",
			"URL must not include query parameters or fragments.",
		],
		[
			"https://arr.example/#settings",
			"URL must not include query parameters or fragments.",
		],
		["http://arr.example:0", "Invalid port."],
	])("rejects unsupported URL %s", (input, error) => {
		expect(validateProviderConnectionUrl(input)).toEqual({ ok: false, error });
	});
});

describe("validateProviderConnectionApiKey", () => {
	it("trims non-empty API keys and rejects blank ones", () => {
		expect(validateProviderConnectionApiKey("  key-123  ")).toEqual({
			ok: true,
			value: "key-123",
		});
		expect(validateProviderConnectionApiKey(" ".repeat(3))).toEqual({
			ok: false,
			error: "API key cannot be empty.",
		});
	});
});

describe("getProviderConnectionScope", () => {
	it("uses normalized URL only and never leaks API keys", () => {
		const firstScope = getProviderConnectionScope({
			url: "https://EXAMPLE.com:443/api///",
			apiKey: "top-secret-key-one",
		});
		const secondScope = getProviderConnectionScope({
			url: "https://example.com/api",
			apiKey: "top-secret-key-two",
		});

		expect(firstScope).toBe("https://example.com/api");
		expect(secondScope).toBe(firstScope);
	});
});
