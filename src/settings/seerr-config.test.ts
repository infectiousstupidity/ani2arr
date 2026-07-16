/** Tests for Seerr auth-mode normalization and base-path-safe login URLs. */
// src/settings/seerr-config.test.ts

import { describe, expect, it } from "vitest";
import { createDefaultExtensionOptions } from "./schema";
import {
	buildSeerrLoginUrl,
	getSeerrConnection,
	hasConfiguredSeerrConnection,
	normalizeSeerrApiKeyConnectionInput,
	normalizeSeerrConnectionInput,
	normalizeSeerrUrlInput,
} from "./seerr-config";

describe("Seerr connection config", () => {
	it("normalizes URL-only session inputs and derives host permission", () => {
		expect(
			normalizeSeerrUrlInput(" https://SEERR.example:443/base/// "),
		).toEqual({
			url: "https://seerr.example/base",
			permissionPattern: "https://seerr.example/*",
		});
	});

	it("requires a verified account before session mode is configured", () => {
		const settings = createDefaultExtensionOptions();
		settings.seerr = {
			url: "https://seerr.example",
			auth: { mode: "session" },
		};

		expect(getSeerrConnection(settings)).toBeNull();
		expect(hasConfiguredSeerrConnection(settings)).toBe(false);
		expect(() => normalizeSeerrConnectionInput(settings.seerr)).toThrow(
			"Verify the Seerr browser session before saving it.",
		);
	});

	it("normalizes minimal verified session account data", () => {
		const settings = createDefaultExtensionOptions();
		settings.seerr = {
			url: "https://seerr.example/",
			auth: { mode: "session" },
			account: {
				id: 12,
				displayName: " Friend ",
				avatar: " /avatar.png ",
			},
		};

		expect(getSeerrConnection(settings)).toEqual({
			url: "https://seerr.example",
			auth: { mode: "session" },
			account: {
				id: 12,
				displayName: "Friend",
				avatar: "/avatar.png",
			},
		});
	});

	it("keeps API-key mode explicit and trims its key", () => {
		expect(
			normalizeSeerrApiKeyConnectionInput({
				url: "https://seerr.example",
				apiKey: " secret ",
			}),
		).toMatchObject({
			url: "https://seerr.example",
			auth: { mode: "apiKey", apiKey: "secret" },
		});
	});

	it("appends login without discarding a reverse-proxy base path", () => {
		expect(buildSeerrLoginUrl("https://example.com/seerr/")).toBe(
			"https://example.com/seerr/login",
		);
	});
});
