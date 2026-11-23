/** Tests for shared content-script shell route reconciliation. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createDefaultPublicOptions } from "@/settings/schema";
import { createContentEntrypointShell } from "./create-content-script-shell";

const getPublicOptionsSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock("@/settings/store", () => ({
	PUBLIC_OPTIONS_CHANGE_KEY: "publicOptions",
	getPublicOptionsSnapshot: getPublicOptionsSnapshotMock,
}));

const ROOT_URL = "https://anilist.co/";
const ANIME_URL = "https://anilist.co/anime/186497/Koori-no-Jouheki/";
const MAL_GENRE_URL = "https://myanimelist.net/anime/genre/2/Adventure";
const MAL_ANIME_URL = "https://myanimelist.net/anime/5114/Fullmetal_Alchemist_Brotherhood";

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

type ShellOptions = Parameters<typeof createContentEntrypointShell>[0];

function startShell(options: ShellOptions): Promise<void> {
	return createContentEntrypointShell(options)(createFakeContentScriptContext());
}

function dispatchLocationChange(url: string): void {
	const event = new Event("wxt:locationchange") as Event & { newUrl: URL };
	event.newUrl = new URL(url);
	globalThis.window.dispatchEvent(event);
}

function dispatchPageShow(persisted: boolean): void {
	const event = new Event("pageshow");
	Object.defineProperty(event, "persisted", { value: persisted });
	globalThis.window.dispatchEvent(event);
}

describe("createContentEntrypointShell", () => {
	beforeEach(() => {
		getPublicOptionsSnapshotMock.mockResolvedValue(createDefaultPublicOptions());
		vi.stubGlobal("location", { href: ROOT_URL });
		vi.stubGlobal("window", new EventTarget());
	});

	it("reconciles SPA route changes from WXT event newUrl instead of stale location.href", async () => {
		const mountedUrls: string[] = [];
		const options = {
			isEligible: () => true,
			mount: (context) => {
				mountedUrls.push(context.url);
			},
			remove: vi.fn(),
		} satisfies ShellOptions;

		await startShell(options);

		dispatchLocationChange(ANIME_URL);

		await vi.waitFor(() => {
			expect(mountedUrls).toEqual([ROOT_URL, ANIME_URL]);
		});
	});

	it("remounts MAL browse UI after a persisted Back restoration", async () => {
		vi.stubGlobal("location", { href: MAL_GENRE_URL });
		const mountedUrls: string[] = [];
		let currentMounts = 0;
		const remove = vi.fn(() => {
			currentMounts = 0;
		});
		const options = {
			isEligible: ({ url }) => url === MAL_GENRE_URL,
			mount: ({ url }) => {
				mountedUrls.push(url);
				currentMounts += 1;
			},
			remove,
		} satisfies ShellOptions;

		await startShell(options);
		dispatchLocationChange(MAL_ANIME_URL);

		await vi.waitFor(() => {
			expect(remove).toHaveBeenCalledTimes(1);
			expect(currentMounts).toBe(0);
		});

		globalThis.location.href = MAL_GENRE_URL;
		dispatchPageShow(true);

		await vi.waitFor(() => {
			expect(mountedUrls).toEqual([MAL_GENRE_URL, MAL_GENRE_URL]);
			expect(currentMounts).toBe(1);
		});

		dispatchPageShow(true);
		await vi.waitFor(() => {
			expect(mountedUrls).toEqual([
				MAL_GENRE_URL,
				MAL_GENRE_URL,
				MAL_GENRE_URL,
			]);
			expect(currentMounts).toBe(1);
			expect(remove).toHaveBeenCalledTimes(3);
		});
	});

	it("ignores a non-persisted pageshow after the initial mount", async () => {
		const mount = vi.fn();
		const remove = vi.fn();
		const options = {
			isEligible: () => true,
			mount,
			remove,
		} satisfies ShellOptions;

		await startShell(options);
		dispatchPageShow(false);

		expect(mount).toHaveBeenCalledTimes(1);
		expect(remove).not.toHaveBeenCalled();
	});

	it("settles a stale async mount before restoring the current UI", async () => {
		vi.stubGlobal("location", { href: MAL_ANIME_URL });
		let currentMounts = 0;
		let mountAttempts = 0;
		let resolveStaleMount: (() => void) | undefined;
		const mount = vi.fn(() => {
			mountAttempts += 1;
			currentMounts += 1;
			if (mountAttempts !== 1) return;
			return new Promise<void>((resolve) => {
				resolveStaleMount = resolve;
			});
		});
		const remove = vi.fn(() => {
			currentMounts = 0;
		});
		const options = {
			isEligible: ({ url }) => url === MAL_GENRE_URL,
			mount,
			remove,
		} satisfies ShellOptions;

		await startShell(options);
		remove.mockClear();
		dispatchLocationChange(MAL_GENRE_URL);

		await vi.waitFor(() => {
			expect(mount).toHaveBeenCalledTimes(1);
		});

		globalThis.location.href = MAL_GENRE_URL;
		dispatchPageShow(true);
		expect(remove).not.toHaveBeenCalled();

		resolveStaleMount?.();

		await vi.waitFor(() => {
			expect(mount).toHaveBeenCalledTimes(2);
			expect(remove).toHaveBeenCalledTimes(2);
			expect(currentMounts).toBe(1);
		});
	});
});
