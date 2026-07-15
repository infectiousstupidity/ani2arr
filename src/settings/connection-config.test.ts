/** Table-driven tests for unified connection normalization and configured state. */
// src/settings/connection-config.test.ts

import { describe, expect, it } from "vitest";
import type { ProviderCredentials } from "@/providers/types";
import { createDefaultExtensionOptions } from "@/settings/schema";
import type { ExtensionOptions } from "@/settings/types";
import {
	getConnectionCredentials,
	getConnectionDraft,
	hasConfiguredConnectionCredentials,
	normalizeConnectionInput,
	normalizeConnectionSettings,
	type ConnectionKind,
} from "./connection-config";

const CONNECTION_CASES = [
	{ kind: "sonarr", label: "Sonarr" },
	{ kind: "radarr", label: "Radarr" },
	{ kind: "seerr", label: "Seerr" },
] as const satisfies ReadonlyArray<{
	kind: ConnectionKind;
	label: string;
}>;

function setConnection(
	settings: ExtensionOptions,
	kind: ConnectionKind,
	credentials: ProviderCredentials,
): void {
	const connection =
		kind === "seerr" ? settings.seerr : settings.providers[kind];
	connection.url = credentials.url;
	connection.apiKey = credentials.apiKey;
}

describe.each(CONNECTION_CASES)("$label connection", ({ kind, label }) => {
	it("returns null when both fields are blank", () => {
		expect(
			normalizeConnectionInput({ url: "  ", apiKey: "  " }, kind),
		).toBeNull();
	});

	it("rejects a URL without an API key", () => {
		expect(() =>
			normalizeConnectionInput(
				{ url: `https://${kind}.example`, apiKey: "  " },
				kind,
			),
		).toThrow(`${label}: enter both URL and API key, or leave both blank.`);
	});

	it("rejects an API key without a URL", () => {
		expect(() =>
			normalizeConnectionInput({ url: "  ", apiKey: "key-123" }, kind),
		).toThrow(`${label}: enter both URL and API key, or leave both blank.`);
	});

	it("rejects invalid connection values", () => {
		expect(() =>
			normalizeConnectionInput(
				{ url: `ftp://${kind}.example`, apiKey: "key-123" },
				kind,
			),
		).toThrow(`Please enter a valid ${label} URL and API key.`);
	});

	it("normalizes valid values and derives the permission pattern", () => {
		expect(
			normalizeConnectionInput(
				{
					url: ` https://${kind.toUpperCase()}.example:443/api/// `,
					apiKey: ` key-${kind} `,
				},
				kind,
			),
		).toEqual({
			url: `https://${kind}.example/api`,
			apiKey: `key-${kind}`,
			permissionPattern: `https://${kind}.example/*`,
		});
	});

	it("reads and normalizes the correct settings connection", () => {
		const settings = createDefaultExtensionOptions();
		setConnection(settings, kind, {
			url: ` https://${kind}.example/base/ `,
			apiKey: " key-123 ",
		});

		expect(getConnectionDraft(settings, kind)).toEqual({
			url: `https://${kind}.example/base/`,
			apiKey: "key-123",
		});
		expect(getConnectionCredentials(settings, kind)).toEqual({
			url: `https://${kind}.example/base/`,
			apiKey: "key-123",
		});
		expect(hasConfiguredConnectionCredentials(settings, kind)).toBe(true);
		expect(normalizeConnectionSettings(settings, kind)).toEqual({
			url: `https://${kind}.example/base`,
			apiKey: "key-123",
			permissionPattern: `https://${kind}.example/*`,
		});
	});

	it("returns empty and unconfigured values for undefined settings", () => {
		expect(getConnectionDraft(undefined, kind)).toEqual({
			url: "",
			apiKey: "",
		});
		expect(getConnectionCredentials(undefined, kind)).toBeNull();
		expect(normalizeConnectionSettings(undefined, kind)).toBeNull();
		expect(hasConfiguredConnectionCredentials(undefined, kind)).toBe(false);
	});
});
