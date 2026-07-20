/** Tests for settings migration ordering during background bootstrap. */
// src/background/bootstrap.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";

const initializeSettingsStorageMock = vi.hoisted(() => vi.fn());
const getExtensionOptionsSnapshotMock = vi.hoisted(() => vi.fn());
const registerAni2arrApiMock = vi.hoisted(() => vi.fn());
const refreshMappingPipelineMock = vi.hoisted(() => vi.fn());
const hasConfiguredConnectionCredentialsMock = vi.hoisted(() => vi.fn());
const loggerConfigureMock = vi.hoisted(() => vi.fn());
const backgroundInfoMock = vi.hoisted(() => vi.fn());

vi.mock("@/settings/store", () => ({
	getExtensionOptionsSnapshot: getExtensionOptionsSnapshotMock,
	initializeSettingsStorage: initializeSettingsStorageMock,
}));

vi.mock("@/settings/connection-config", () => ({
	hasConfiguredConnectionCredentials: hasConfiguredConnectionCredentialsMock,
}));

vi.mock("@/rpc", () => ({
	registerAni2arrApi: registerAni2arrApiMock,
}));

vi.mock("@/rpc/handlers", () => ({
	apiHandlers: {
		refreshMappingPipeline: refreshMappingPipelineMock,
	},
}));

vi.mock("@/shared/utils/logger", () => ({
	logger: {
		configure: loggerConfigureMock,
		create: () => ({ info: backgroundInfoMock }),
	},
}));

import { bootstrapBackground } from "./bootstrap";

function createDeferred(): {
	promise: Promise<void>;
	resolve: () => void;
} {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("bootstrapBackground", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hasConfiguredConnectionCredentialsMock.mockReturnValue(false);
		getExtensionOptionsSnapshotMock.mockResolvedValue({ debugLogging: true });
	});

	it("registers immediately but delays readiness and settings work", async () => {
		const initialization = createDeferred();
		initializeSettingsStorageMock.mockReturnValue(initialization.promise);
		let onMessageListener!: Parameters<
			typeof browser.runtime.onMessage.addListener
		>[0];
		const addMessageListener = vi
			.spyOn(browser.runtime.onMessage, "addListener")
			.mockImplementation((listener) => {
				onMessageListener = listener;
			});

		bootstrapBackground();

		expect(initializeSettingsStorageMock).toHaveBeenCalledOnce();
		expect(registerAni2arrApiMock).toHaveBeenCalledOnce();
		expect(getExtensionOptionsSnapshotMock).not.toHaveBeenCalled();

		const ping = onMessageListener(
			{
				_a2a: true,
				type: "a2a:ping",
				timestamp: Date.now(),
			},
			{ id: browser.runtime.id } as Browser.runtime.MessageSender,
			() => {},
		) as unknown as Promise<unknown>;
		let pingSettled = false;
		void ping.then(() => {
			pingSettled = true;
		});
		await Promise.resolve();

		expect(pingSettled).toBe(false);
		expect(getExtensionOptionsSnapshotMock).not.toHaveBeenCalled();

		initialization.resolve();

		await expect(ping).resolves.toEqual({ ok: true });
		await vi.waitFor(() => {
			expect(getExtensionOptionsSnapshotMock).toHaveBeenCalledOnce();
		});
		expect(loggerConfigureMock).toHaveBeenCalledWith({ enabled: true });
		addMessageListener.mockRestore();
	});
});
