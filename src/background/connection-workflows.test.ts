/** Tests settings commits with their background connection effects. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeerrConnection } from "@/providers/seerr/types";
import { createDefaultExtensionOptions } from "@/settings/schema";
import type { ExtensionOptions } from "@/settings/types";
import {
	commitProviderConnection,
	commitSeerrConnection,
} from "./connection-workflows";

const getExtensionOptionsSnapshotMock = vi.hoisted(() => vi.fn());
const saveProviderConnectionSnapshotMock = vi.hoisted(() => vi.fn());
const saveSeerrConnectionSnapshotMock = vi.hoisted(() => vi.fn());
const cleanupUnusedProviderHostPermissionMock = vi.hoisted(() => vi.fn());
const removeSeerrCsrfCookiePermissionMock = vi.hoisted(() => vi.fn());
const bumpLibraryRevisionMock = vi.hoisted(() => vi.fn());
const bumpMappingsRevisionMock = vi.hoisted(() => vi.fn());
const refreshProviderLibraryMock = vi.hoisted(() => vi.fn());
const refreshMappingPipelineMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/settings/store", () => ({
	getExtensionOptionsSnapshot: getExtensionOptionsSnapshotMock,
	saveProviderConnectionSnapshot: saveProviderConnectionSnapshotMock,
	saveSeerrConnectionSnapshot: saveSeerrConnectionSnapshotMock,
}));

vi.mock("@/settings/provider-permissions", () => ({
	cleanupUnusedProviderHostPermission:
		cleanupUnusedProviderHostPermissionMock,
	removeSeerrCsrfCookiePermission: removeSeerrCsrfCookiePermissionMock,
}));

vi.mock("./api-services", () => ({
	bumpLibraryRevision: bumpLibraryRevisionMock,
	bumpMappingsRevision: bumpMappingsRevisionMock,
	refreshProviderLibrary: refreshProviderLibraryMock,
}));

vi.mock("./mapping-refresh", () => ({
	refreshMappingPipeline: refreshMappingPipelineMock,
}));

vi.mock("@/shared/errors/error-utils", () => ({
	logError: logErrorMock,
	normalizeError: (error: unknown) => error,
}));

function withSonarrConnection(
	options: ExtensionOptions,
	url = "https://sonarr.example",
): ExtensionOptions {
	return {
		...options,
		providers: {
			...options.providers,
			sonarr: {
				...options.providers.sonarr,
				url,
				apiKey: "sonarr-key",
			},
		},
	};
}

function withRadarrConnection(options: ExtensionOptions): ExtensionOptions {
	return {
		...options,
		providers: {
			...options.providers,
			radarr: {
				...options.providers.radarr,
				url: "https://radarr.example",
				apiKey: "radarr-key",
			},
		},
	};
}

function withSeerrConnection(
	options: ExtensionOptions,
	connection: SeerrConnection,
): ExtensionOptions {
	return { ...options, seerr: connection };
}

describe("connection workflows", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		refreshMappingPipelineMock.mockResolvedValue(false);
		bumpMappingsRevisionMock.mockImplementation(async () => {});
		bumpLibraryRevisionMock.mockImplementation(async () => {});
		refreshProviderLibraryMock.mockImplementation(async () => {});
		cleanupUnusedProviderHostPermissionMock.mockImplementation(async () => {});
		removeSeerrCsrfCookiePermissionMock.mockImplementation(async () => {});
	});

	it("keeps a committed Arr save successful when warming fails", async () => {
		const previousOptions = createDefaultExtensionOptions();
		const savedOptions = withSonarrConnection(previousOptions);
		getExtensionOptionsSnapshotMock.mockResolvedValue(previousOptions);
		saveProviderConnectionSnapshotMock.mockResolvedValue(savedOptions);
		refreshMappingPipelineMock.mockRejectedValue(new Error("mapping failed"));
		refreshProviderLibraryMock.mockRejectedValue(new Error("library failed"));

		await expect(
			commitProviderConnection("sonarr", {
				url: "https://sonarr.example",
				apiKey: "sonarr-key",
			}),
		).resolves.toBeUndefined();

		expect(saveProviderConnectionSnapshotMock).toHaveBeenCalledOnce();
		expect(bumpMappingsRevisionMock).toHaveBeenCalledOnce();
		expect(bumpLibraryRevisionMock).toHaveBeenCalledWith("sonarr");
		expect(cleanupUnusedProviderHostPermissionMock).toHaveBeenCalledOnce();
		expect(logErrorMock).toHaveBeenCalledTimes(2);
	});

	it("derives disconnect effects from the committed snapshot", async () => {
		const savedOptions = createDefaultExtensionOptions();
		const previousOptions = withRadarrConnection(savedOptions);
		getExtensionOptionsSnapshotMock.mockResolvedValue(previousOptions);
		saveProviderConnectionSnapshotMock.mockResolvedValue(savedOptions);

		await commitProviderConnection("radarr", null);

		expect(refreshProviderLibraryMock).toHaveBeenCalledWith(
			"radarr",
			savedOptions,
		);
		expect(bumpMappingsRevisionMock).toHaveBeenCalledOnce();
		expect(bumpLibraryRevisionMock).toHaveBeenCalledWith("radarr");
		expect(cleanupUnusedProviderHostPermissionMock).toHaveBeenCalledWith(
			"https://radarr.example",
			savedOptions,
		);
	});

	it.each([
		{
			name: "session",
			previous: {
				url: "https://seerr.example",
				auth: { mode: "apiKey" as const, apiKey: "old-key" },
			},
			saved: {
				url: "https://seerr.example",
				auth: { mode: "session" as const },
				account: { id: 7, displayName: "Friend" },
			},
			removesCookiePermission: false,
		},
		{
			name: "API key",
			previous: {
				url: "https://seerr.example",
				auth: { mode: "session" as const },
				account: { id: 7, displayName: "Friend" },
			},
			saved: {
				url: "https://seerr.example",
				auth: { mode: "apiKey" as const, apiKey: "new-key" },
			},
			removesCookiePermission: true,
		},
		{
			name: "disconnect",
			previous: {
				url: "https://seerr.example",
				auth: { mode: "session" as const },
				account: { id: 7, displayName: "Friend" },
			},
			saved: null,
			removesCookiePermission: true,
		},
	])("handles cookie permission for $name", async (testCase) => {
		const defaults = createDefaultExtensionOptions();
		const previousOptions = withSeerrConnection(defaults, testCase.previous);
		const savedOptions = testCase.saved
			? withSeerrConnection(defaults, testCase.saved)
			: defaults;
		getExtensionOptionsSnapshotMock.mockResolvedValue(previousOptions);
		saveSeerrConnectionSnapshotMock.mockResolvedValue(savedOptions);

		await commitSeerrConnection(testCase.saved);

		expect(removeSeerrCsrfCookiePermissionMock).toHaveBeenCalledTimes(
			testCase.removesCookiePermission ? 1 : 0,
		);
	});
});
