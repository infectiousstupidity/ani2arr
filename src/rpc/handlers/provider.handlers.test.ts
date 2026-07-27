import { describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import type { ProviderCredentials } from "@/providers/types";
import { ErrorCode } from "@/shared/errors/error.types";
import { providerHandlers } from "./provider.handlers";

const credentials: ProviderCredentials = {
	url: "https://sonarr.example",
	apiKey: "secret",
};
const seerrSessionConnection = {
	url: "https://seerr.example",
	auth: { mode: "session" as const },
	account: { id: 1, displayName: "Alice" },
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
	it("tests Sonarr connections through its client", async () => {
		const result = { version: "4.0.1" };
		sonarrClientMock.testConnection.mockResolvedValue(result);

		await expect(
			providerHandlers.testSonarrConnection({ credentials }),
		).resolves.toBe(result);
		expect(sonarrClientMock.testConnection).toHaveBeenCalledWith(credentials);
	});

	it("tests Radarr connections through its client", async () => {
		const result = { version: "5.0.1" };
		radarrClientMock.testConnection.mockResolvedValue(result);

		await expect(
			providerHandlers.testRadarrConnection({ credentials }),
		).resolves.toBe(result);
		expect(radarrClientMock.testConnection).toHaveBeenCalledWith(credentials);
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
		getSeerrConfigMock.mockResolvedValue(seerrSessionConnection);
		seerrClientMock.validateConnection.mockResolvedValue({
			account: seerrSessionConnection.account,
		});

		await expect(
			providerHandlers.checkConfiguredSeerrConnection(),
		).resolves.toEqual({
			account: seerrSessionConnection.account,
		});
		expect(seerrClientMock.validateConnection).toHaveBeenCalledWith(
			seerrSessionConnection,
		);
	});

	it("confirms CSRF support only when the configured session token is readable", async () => {
		getSeerrConfigMock.mockResolvedValue({
			...seerrSessionConnection,
			url: "https://seerr.example/base",
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
		getSeerrConfigMock.mockResolvedValue(seerrSessionConnection);
		getSeerrXsrfTokenMock.mockResolvedValue(null);

		await expect(
			providerHandlers.checkConfiguredSeerrCsrfSupport(),
		).rejects.toMatchObject({
			code: ErrorCode.SEERR_CSRF_REQUIRED,
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
