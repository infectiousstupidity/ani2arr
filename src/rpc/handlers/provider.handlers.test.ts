/** Tests for provider RPC connection handlers. */
// src/rpc/handlers/provider.handlers.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import type { ProviderCredentials } from "@/providers/types";
import { ErrorCode } from "@/shared/errors/error.types";
import { providerHandlers } from "./provider.handlers";

const credentials: ProviderCredentials = {
	url: "https://sonarr.example",
	apiKey: "secret",
};

const sonarrClientMock = vi.hoisted(() => ({
	testConnection: vi.fn(),
}));

const radarrClientMock = vi.hoisted(() => ({
	testConnection: vi.fn(),
}));
const seerrClientMock = vi.hoisted(() => ({
	validateConnection: vi.fn(),
}));
const getSeerrXsrfTokenMock = vi.hoisted(() => vi.fn());
const getProviderConfigMock = vi.hoisted(() => vi.fn());
const getSeerrConfigMock = vi.hoisted(() => vi.fn());

vi.mock("@/background/api-services", () => ({
	radarrClient: radarrClientMock,
	seerrClient: seerrClientMock,
	sonarrClient: sonarrClientMock,
}));

vi.mock("@/background/provider-config", () => ({
	getProviderConfig: getProviderConfigMock,
	getSeerrConfig: getSeerrConfigMock,
}));

vi.mock("@/providers/seerr/csrf-token", () => ({
	getSeerrXsrfToken: getSeerrXsrfTokenMock,
}));

describe("providerHandlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("tests Sonarr connections through the current Sonarr client", async () => {
		sonarrClientMock.testConnection.mockResolvedValue({ version: "4.0.1" });

		await expect(
			providerHandlers.testSonarrConnection({
				credentials,
			}),
		).resolves.toEqual({ version: "4.0.1" });

		expect(sonarrClientMock.testConnection).toHaveBeenCalledWith(credentials);
		expect(radarrClientMock.testConnection).not.toHaveBeenCalled();
	});

	it("tests Radarr connections through the current Radarr client", async () => {
		radarrClientMock.testConnection.mockResolvedValue({ version: "5.0.1" });

		await expect(
			providerHandlers.testRadarrConnection({
				credentials,
			}),
		).resolves.toEqual({ version: "5.0.1" });

		expect(radarrClientMock.testConnection).toHaveBeenCalledWith(credentials);
		expect(sonarrClientMock.testConnection).not.toHaveBeenCalled();
	});

	it("checks Seerr browser sessions through a URL-only RPC", async () => {
		seerrClientMock.validateConnection.mockResolvedValue({
			account: { id: 1, displayName: "Alice" },
		});

		await expect(
			providerHandlers.checkSeerrSession({
				url: "https://seerr.example/base/",
			}),
		).resolves.toEqual({
			account: { id: 1, displayName: "Alice" },
		});

		expect(seerrClientMock.validateConnection).toHaveBeenCalledWith({
			url: "https://seerr.example/base",
			auth: { mode: "session" },
		});
		expect(sonarrClientMock.testConnection).not.toHaveBeenCalled();
		expect(radarrClientMock.testConnection).not.toHaveBeenCalled();
	});

	it("tests advanced Seerr API-key mode explicitly", async () => {
		seerrClientMock.validateConnection.mockResolvedValue({
			account: { id: 1, displayName: "Admin" },
		});

		await providerHandlers.testSeerrApiKeyConnection({
			url: "https://seerr.example",
			apiKey: "secret",
		});

		expect(seerrClientMock.validateConnection).toHaveBeenCalledWith({
			url: "https://seerr.example",
			auth: { mode: "apiKey", apiKey: "secret" },
		});
	});

	it("checks the stored Seerr connection without accepting a URL", async () => {
		const connection = {
			url: "https://seerr.example",
			auth: { mode: "session" as const },
			account: { id: 1, displayName: "Alice" },
		};
		getSeerrConfigMock.mockResolvedValue(connection);
		seerrClientMock.validateConnection.mockResolvedValue({
			account: connection.account,
		});

		await expect(
			providerHandlers.checkConfiguredSeerrConnection(),
		).resolves.toEqual({
			account: connection.account,
		});
		expect(seerrClientMock.validateConnection).toHaveBeenCalledWith(connection);
	});

	it("confirms CSRF support only when the configured session token is readable", async () => {
		getSeerrConfigMock.mockResolvedValue({
			url: "https://seerr.example/base",
			auth: { mode: "session" },
			account: { id: 1, displayName: "Alice" },
		});
		getSeerrXsrfTokenMock.mockResolvedValue("xsrf-token");

		await expect(
			providerHandlers.checkConfiguredSeerrCsrfSupport(),
		).resolves.toEqual({ ok: true });
		expect(getSeerrXsrfTokenMock).toHaveBeenCalledWith(
			"https://seerr.example/base",
		);
	});

	it("rejects CSRF support when cookie permission exposes no token", async () => {
		getSeerrConfigMock.mockResolvedValue({
			url: "https://seerr.example",
			auth: { mode: "session" },
			account: { id: 1, displayName: "Alice" },
		});
		getSeerrXsrfTokenMock.mockResolvedValue(null);

		await expect(
			providerHandlers.checkConfiguredSeerrCsrfSupport(),
		).rejects.toMatchObject({
			code: ErrorCode.SEERR_CSRF_REQUIRED,
			userMessage:
				"Cookie access is enabled, but no Seerr XSRF token is available. Open or reload the configured Seerr server in the same browser profile, then try again. HTTPS may be required, and Firefox Containers can isolate the cookie.",
		});
	});

	it.each([
		{ name: "missing connection", connection: null },
		{
			name: "API-key connection",
			connection: {
				url: "https://seerr.example",
				auth: { mode: "apiKey" as const, apiKey: "secret" },
			},
		},
	])("rejects CSRF support for $name", async ({ connection }) => {
		getSeerrConfigMock.mockResolvedValue(connection);

		await expect(
			providerHandlers.checkConfiguredSeerrCsrfSupport(),
		).rejects.toMatchObject({
			code: ErrorCode.CONFIGURATION_ERROR,
		});
		expect(getSeerrXsrfTokenMock).not.toHaveBeenCalled();
	});

	it("opens configured provider pages privately", async () => {
		getProviderConfigMock.mockResolvedValue({
			url: "https://arr.example:8443/radarr",
			apiKey: "secret",
		});
		const createTab = vi
			.spyOn(browser.tabs, "create")
			.mockResolvedValue({} as never);

		await expect(
			providerHandlers.openProviderPage({
				provider: "radarr",
				target: { type: "add", searchTerm: "Example Movie" },
			}),
		).resolves.toEqual({ opened: true });

		expect(createTab).toHaveBeenCalledWith({
			url: "https://arr.example:8443/radarr/add/new?term=Example+Movie",
		});
	});

	it("does not open provider pages when the provider is not configured", async () => {
		getProviderConfigMock.mockResolvedValue(null);
		const createTab = vi.spyOn(browser.tabs, "create");

		await expect(
			providerHandlers.openProviderPage({
				provider: "sonarr",
				target: { type: "details", providerRouteSlug: "example-series" },
			}),
		).resolves.toEqual({ opened: false });

		expect(createTab).not.toHaveBeenCalled();
	});
});
