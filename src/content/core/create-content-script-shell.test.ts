/** Tests for shared content-script shell route reconciliation. */
// src/content/core/create-content-script-shell.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import type { PublicOptions } from "@/settings/types";
import { createContentEntrypointShell } from "./create-content-script-shell";

const getPublicOptionsSnapshotMock = vi.hoisted(() => vi.fn());
const awaitBackgroundReadyMock = vi.hoisted(() => vi.fn());

vi.mock("@/settings/store", () => ({
	PUBLIC_OPTIONS_CHANGE_KEY: "publicOptions",
	getPublicOptionsSnapshot: getPublicOptionsSnapshotMock,
}));

vi.mock("./await-background-ready", () => ({
	awaitBackgroundReady: awaitBackgroundReadyMock,
}));

const ROOT_URL = "https://anilist.co/";
const ANIME_URL = "https://anilist.co/anime/186497/Koori-no-Jouheki/";

const publicOptions = {
	providers: {
		sonarr: {
			defaults: {},
			isConfigured: false,
		},
		radarr: {
			defaults: {},
			isConfigured: false,
		},
	},
	ui: {
		preferredAniListTitleLanguage: "romaji",
		browseCards: {
			sonarr: {
				enabled: true,
				visibility: "always",
			},
			radarr: {
				enabled: true,
				visibility: "always",
			},
		},
		animePages: {
			sonarr: {
				enabled: true,
			},
			radarr: {
				enabled: true,
			},
		},
	},
	debugLogging: false,
} as PublicOptions;

function createFakeContentScriptContext(): ContentScriptContext {
	return {
		addEventListener: vi.fn(
			(
				target: EventTarget,
				type: string,
				handler: EventListenerOrEventListenerObject,
			) => {
				target.addEventListener(type, handler);
			},
		),
		onInvalidated: vi.fn(),
	} as unknown as ContentScriptContext;
}

describe("createContentEntrypointShell", () => {
	beforeEach(() => {
		getPublicOptionsSnapshotMock.mockResolvedValue(publicOptions);
		awaitBackgroundReadyMock.mockImplementation(() => Promise.resolve());
		vi.stubGlobal("location", { href: ROOT_URL });
		vi.stubGlobal("window", new EventTarget());
	});

	it("reconciles SPA route changes from WXT event newUrl instead of stale location.href", async () => {
		const mountedUrls: string[] = [];
		const shell = createContentEntrypointShell({
			isEligible: () => true,
			mount: (context) => {
				mountedUrls.push(context.url);
			},
			remove: vi.fn(),
		});

		await shell(createFakeContentScriptContext());

		const event = new Event("wxt:locationchange") as Event & { newUrl: URL };
		event.newUrl = new URL(ANIME_URL);
		globalThis.window.dispatchEvent(event);

		await vi.waitFor(() => {
			expect(mountedUrls).toEqual([ROOT_URL, ANIME_URL]);
		});
	});
});
