/** Tests for storage migration ordering during background bootstrap. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import type { Ani2arrApi } from "@/rpc";

const initializeSettingsStorageMock = vi.hoisted(() => vi.fn());
const getExtensionOptionsSnapshotMock = vi.hoisted(() => vi.fn());
const registerAni2arrApiMock = vi.hoisted(() =>
	vi.fn<(api: Ani2arrApi) => void>(),
);
const refreshMappingPipelineMock = vi.hoisted(() => vi.fn());
const migrateMappingStorageMock = vi.hoisted(() => vi.fn());
const hasConfiguredProviderCredentialsMock = vi.hoisted(() => vi.fn());
const hasConfiguredSeerrConnectionMock = vi.hoisted(() => vi.fn());
const loggerConfigureMock = vi.hoisted(() => vi.fn());

vi.mock("@/settings/store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/settings/store")>()),
	getExtensionOptionsSnapshot: getExtensionOptionsSnapshotMock,
	initializeSettingsStorage: initializeSettingsStorageMock,
}));

vi.mock("@/settings/provider-config", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/settings/provider-config")>()),
	hasConfiguredProviderCredentials: hasConfiguredProviderCredentialsMock,
}));

vi.mock("@/settings/seerr-config", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/settings/seerr-config")>()),
	hasConfiguredSeerrConnection: hasConfiguredSeerrConnectionMock,
}));

vi.mock("@/rpc", () => ({
	registerAni2arrApi: registerAni2arrApiMock,
}));

vi.mock("@/anilist/metadata.store");

vi.mock("@/background/mapping-refresh", () => ({
	refreshMappingPipeline: refreshMappingPipelineMock,
}));

vi.mock("@/mapping/migrate", () => ({
	migrateMappingStorage: migrateMappingStorageMock,
}));

vi.mock("@/shared/utils/logger", async (importOriginal) => {
	const { logger } =
		await importOriginal<typeof import("@/shared/utils/logger")>();
	return { logger: { ...logger, configure: loggerConfigureMock } };
});

import { bootstrapBackground } from "./bootstrap";

describe("bootstrapBackground", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hasConfiguredProviderCredentialsMock.mockReturnValue(false);
		hasConfiguredSeerrConnectionMock.mockReturnValue(false);
		getExtensionOptionsSnapshotMock.mockResolvedValue({ debugLogging: true });
		initializeSettingsStorageMock.mockImplementation(async () => {});
		migrateMappingStorageMock.mockResolvedValue(false);
	});

	it("registers RPC and starts mapping migration without waiting", async () => {
		const initialization = Promise.withResolvers<void>();
		const migration = Promise.withResolvers<boolean>();
		initializeSettingsStorageMock.mockReturnValue(initialization.promise);
		migrateMappingStorageMock.mockReturnValue(migration.promise);

		bootstrapBackground();

		expect(registerAni2arrApiMock).toHaveBeenCalledOnce();
		expect(initializeSettingsStorageMock).not.toHaveBeenCalled();
		expect(migrateMappingStorageMock).not.toHaveBeenCalled();

		await Promise.resolve();

		expect(initializeSettingsStorageMock).toHaveBeenCalledOnce();
		expect(migrateMappingStorageMock).toHaveBeenCalledOnce();
		expect(getExtensionOptionsSnapshotMock).not.toHaveBeenCalled();

		initialization.resolve();

		await vi.waitFor(() => {
			expect(getExtensionOptionsSnapshotMock).toHaveBeenCalledOnce();
		});
		expect(loggerConfigureMock).toHaveBeenCalledWith({ enabled: true });
		migration.resolve(false);
	});

	it("waits for MAL aliases to consolidate before serving a cold mapping read", async () => {
		const id = parseAniListId(1);
		await browser.storage.local.set({
			"mapping:manual": {
				version: 1,
				records: { "mal:2": { facts: { tvdbShow: 10 } } },
			},
			"mapping:upstream": {
				version: 1,
				fetchedAt: Date.now(),
				records: {
					"anilist:1": { facts: { tvdbShow: 20 } },
					"mal:2": { facts: {}, linkedAniListId: id },
				},
			},
		});
		const { migrateMappingStorage } =
			await vi.importActual<typeof import("@/mapping/migrate")>(
				"@/mapping/migrate",
			);
		const migration = Promise.withResolvers<void>();
		migrateMappingStorageMock.mockImplementation(() =>
			migration.promise.then(migrateMappingStorage),
		);
		initializeSettingsStorageMock.mockReturnValue(new Promise(() => {}));
		bootstrapBackground();
		const [api] = registerAni2arrApiMock.mock.calls[0]!;

		const identities = api.getMappingIdentities([id]);
		// Metadata does not depend on either migration.
		await expect(api.getAniListMetadata({ ids: [] })).resolves.toEqual({
			metadata: [],
			missingIds: [],
		});
		migration.resolve();

		await expect(identities).resolves.toMatchObject([
			{
				anilistId: id,
				result: { kind: "mapped", source: "manual", providerId: 10 },
			},
		]);
	});

	it("waits for migrated credentials, but not mapping migration, when opening a provider", async () => {
		const legacy = { url: "https://sonarr.example", apiKey: "test-key" };
		await browser.storage.local.set({ sonarrSecrets: legacy });
		const settings =
			await vi.importActual<typeof import("@/settings/store")>(
				"@/settings/store",
			);
		const initialization = Promise.withResolvers<void>();
		initializeSettingsStorageMock.mockImplementation(() =>
			initialization.promise.then(settings.initializeSettingsStorage),
		);
		getExtensionOptionsSnapshotMock.mockImplementation(
			settings.getExtensionOptionsSnapshot,
		);
		migrateMappingStorageMock.mockReturnValue(new Promise(() => {}));
		const createTab = vi.spyOn(browser.tabs, "create");
		bootstrapBackground();
		const [api] = registerAni2arrApiMock.mock.calls[0]!;

		const result = api.openProviderPage({
			provider: "sonarr",
			target: { type: "add" },
		});
		await Promise.resolve();
		expect(getExtensionOptionsSnapshotMock).not.toHaveBeenCalled();
		initialization.resolve();

		await expect(result).resolves.toEqual({ opened: true });
		expect(createTab).toHaveBeenCalledWith({
			url: "https://sonarr.example/add/new",
		});
	});

	it("surfaces initialization failures to dependent RPC without running the handler", async () => {
		const failure = new Error("Settings storage unavailable");
		initializeSettingsStorageMock.mockRejectedValue(failure);
		bootstrapBackground();
		const [api] = registerAni2arrApiMock.mock.calls[0]!;

		await expect(
			api.openProviderPage({ provider: "sonarr", target: { type: "add" } }),
		).rejects.toBe(failure);
		expect(getExtensionOptionsSnapshotMock).not.toHaveBeenCalled();
	});

	it("waits for migration before a refresh alarm runs on a cold worker", async () => {
		const migration = Promise.withResolvers<boolean>();
		migrateMappingStorageMock.mockReturnValue(migration.promise);
		hasConfiguredProviderCredentialsMock.mockReturnValue(true);
		const registerAlarmListener = vi.spyOn(
			browser.alarms.onAlarm,
			"addListener",
		);
		bootstrapBackground();
		const [onAlarm] = registerAlarmListener.mock.calls[0]!;

		onAlarm({
			name: "a2a:refresh-static-mappings",
			scheduledTime: Date.now(),
			persistAcrossSessions: true,
		});
		await vi.waitFor(() => expect(loggerConfigureMock).toHaveBeenCalledOnce());
		expect(refreshMappingPipelineMock).not.toHaveBeenCalled();
		migration.resolve(false);

		await vi.waitFor(() =>
			expect(refreshMappingPipelineMock).toHaveBeenCalledOnce(),
		);
	});

	it("schedules and refreshes after deleting a legacy upstream cache", async () => {
		migrateMappingStorageMock.mockResolvedValue(true);
		hasConfiguredProviderCredentialsMock.mockReturnValue(true);
		const alarmGet = vi.spyOn(browser.alarms, "get").mockResolvedValue();
		const alarmCreate = vi.spyOn(browser.alarms, "create");

		bootstrapBackground();

		await vi.waitFor(() =>
			expect(refreshMappingPipelineMock).toHaveBeenCalledOnce(),
		);
		expect(alarmCreate).toHaveBeenCalledWith("a2a:refresh-static-mappings", {
			periodInMinutes: 360,
		});
		alarmGet.mockRestore();
		alarmCreate.mockRestore();
	});

	it("runs the background mapping refresh workflow on startup", async () => {
		hasConfiguredProviderCredentialsMock.mockReturnValue(true);
		let onStartupListener!: Parameters<
			typeof browser.runtime.onStartup.addListener
		>[0];
		const addStartupListener = vi
			.spyOn(browser.runtime.onStartup, "addListener")
			.mockImplementation((listener) => {
				onStartupListener = listener;
			});

		bootstrapBackground();
		await onStartupListener();

		expect(refreshMappingPipelineMock).toHaveBeenCalledOnce();
		addStartupListener.mockRestore();
	});
});
